import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import {
  listTasks,
  createTask,
  updateTask,
  deleteTask,
  addImages,
  addVideos,
  addDocuments,
  deleteFile,
  addComment,
  deleteComment,
} from '../controllers/task.controller.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

// Uploads directory (relative to project root: /code/server)
const UPLOAD_DIR = path.resolve('uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Disk storage: large media (images/videos) — written to disk first
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

// Memory storage for documents — needed so the controller can validate
// magic bytes before the file is written to disk.
const memStorage = multer.memoryStorage();

const imageFilter = (_req, file, cb) => {
  if (/^image\//.test(file.mimetype)) cb(null, true);
  else cb(new Error('Solo se permiten imágenes (jpg, png, webp, gif)'));
};

const videoFilter = (_req, file, cb) => {
  if (/^video\//.test(file.mimetype)) cb(null, true);
  else cb(new Error('Solo se permiten videos (mp4, webm, mov)'));
};

// Permissive MIME filter for documents — fileGuard does the real check
const documentFilter = (_req, file, cb) => cb(null, true);

const uploadImages = multer({ storage: diskStorage, fileFilter: imageFilter, limits: { fileSize: 15 * 1024 * 1024 } });
const uploadVideos = multer({ storage: diskStorage, fileFilter: videoFilter, limits: { fileSize: 100 * 1024 * 1024 } });
const uploadDocuments = multer({ storage: memStorage, fileFilter: documentFilter, limits: { fileSize: 50 * 1024 * 1024 } });

// Helper: drain multer's upload then write memory buffers to disk before
// the controller runs. fileToObject() in the controller reads f.path, so we
// need every accepted document to be persisted on disk.
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

// CRUD
router.get('/', listTasks);
router.post('/', createTask);
router.put('/:id', updateTask);
router.delete('/:id', deleteTask);

// Attachments
router.post('/:id/images', uploadImages.array('files', 20), addImages);
router.post('/:id/videos', uploadVideos.array('files', 10), addVideos);
router.post(
  '/:id/documents',
  uploadDocuments.array('files', 10),
  persistMemoryFiles,
  addDocuments
);
router.delete('/:id/files/:kind/:fileId', deleteFile);

// Comments
router.post('/:id/comments', addComment);
router.delete('/:id/comments/:commentId', deleteComment);

export default router;
