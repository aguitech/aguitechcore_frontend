import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import {
  listConversations,
  openConversation,
  listMessages,
  sendMessage,
  markRead,
  searchUsers,
  uploadAttachments,
} from '../controllers/chat.controller.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

// Uploads directory (shared with task uploads)
const UPLOAD_DIR = path.resolve('uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Disk storage: keep it simple — same shape as task uploads
const diskStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ts = Date.now();
    const safe = file.originalname
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .slice(0, 80);
    cb(null, `${ts}_${safe}`);
  },
});

// Memory storage for non-image/video files (need buffer for magic-byte check)
const memStorage = multer.memoryStorage();

const imageFilter = (_req, file, cb) => {
  if (/^image\//.test(file.mimetype)) cb(null, true);
  else cb(new Error('Solo se permiten imágenes'));
};
const videoFilter = (_req, file, cb) => {
  if (/^video\//.test(file.mimetype)) cb(null, true);
  else cb(new Error('Solo se permiten videos'));
};
const docFilter = (_req, _file, cb) => cb(null, true);

const uploadImages = multer({ storage: diskStorage, fileFilter: imageFilter, limits: { fileSize: 15 * 1024 * 1024 } });
const uploadVideos = multer({ storage: diskStorage, fileFilter: videoFilter, limits: { fileSize: 100 * 1024 * 1024 } });
const uploadDocs = multer({ storage: memStorage, fileFilter: docFilter, limits: { fileSize: 50 * 1024 * 1024 } });

// Persist memory-stored documents to disk after multer
function persistMemoryFiles(req, _res, next) {
  try {
    if (req.files && req.files.length > 0) {
      for (const f of req.files) {
        if (f.buffer && !f.path) {
          const ts = Date.now() + '_' + Math.random().toString(36).slice(2, 8);
          const safe = f.originalname
            .replace(/[^a-zA-Z0-9._-]/g, '_')
            .slice(0, 80);
          const filename = `${ts}_${safe}`;
          const fullPath = path.join(UPLOAD_DIR, filename);
          fs.writeFileSync(fullPath, f.buffer);
          f.path = fullPath;
          f.filename = filename;
        }
      }
    }
    next();
  } catch (err) {
    next(err);
  }
}

// Combined upload: any files in a single multipart with field name "files".
// We accept up to 20 files; the controller categorizes each.
const uploadAny = multer({
  storage: diskStorage,
  fileFilter: (_req, file, cb) => {
    // Block executables at the multer level too (defense in depth)
    const blocked = /\.(exe|msi|dll|bat|cmd|sh|ps1|vbs|jar|app|hta)$/i;
    if (blocked.test(file.originalname)) {
      return cb(new Error(`Tipo de archivo no permitido: ${file.originalname}`));
    }
    cb(null, true);
  },
  limits: { fileSize: 50 * 1024 * 1024, files: 20 },
});

// Search users to start a chat
router.get('/users/search', searchUsers);

// Conversations
router.get('/conversations', listConversations);
router.post('/conversations', openConversation);

// Messages inside a conversation
router.get('/conversations/:id/messages', listMessages);
// Send message: JSON { text } OR multipart with "files" + optional "text"
router.post('/conversations/:id/messages', uploadAny.array('files', 20), sendMessage);
// Upload-only attachments (creates a new message with no text)
router.post('/conversations/:id/attachments', uploadAny.array('files', 20), uploadAttachments);
router.post('/conversations/:id/read', markRead);

export default router;
