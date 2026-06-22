import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import {
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  listPosts,
  getPost,
  createPost,
  updatePost,
  deletePost,
  addImages,
  addVideos,
  addDocuments,
  deleteFile,
  addLink,
  deleteLink,
  addComment,
  deleteComment,
  listPublicPosts,
  getPublicPostBySlug,
} from '../controllers/post.controller.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// Uploads directory (relative to project root: /code/server)
const UPLOAD_DIR = path.resolve('uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// ----- multer setup (mirrors task.routes.js) -----
const diskStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ts = Date.now();
    const safe = (file.originalname || 'archivo')
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .slice(0, 80);
    cb(null, `${ts}_${safe}`);
  },
});

const memStorage = multer.memoryStorage();

const imageFilter = (_req, file, cb) => {
  if (/^image\//.test(file.mimetype)) cb(null, true);
  else cb(new Error('Solo se permiten imágenes (jpg, png, webp, gif)'));
};
const videoFilter = (_req, file, cb) => {
  if (/^video\//.test(file.mimetype)) cb(null, true);
  else cb(new Error('Solo se permiten videos (mp4, webm, mov)'));
};
const documentFilter = (_req, file, cb) => cb(null, true);

const uploadImages = multer({
  storage: diskStorage,
  fileFilter: imageFilter,
  limits: { fileSize: 15 * 1024 * 1024 },
});
const uploadVideos = multer({
  storage: diskStorage,
  fileFilter: videoFilter,
  limits: { fileSize: 100 * 1024 * 1024 },
});
const uploadDocuments = multer({
  storage: memStorage,
  fileFilter: documentFilter,
  limits: { fileSize: 50 * 1024 * 1024 },
});

// Persist multer-memory documents to disk before the controller runs
function persistMemoryFiles(req, _res, next) {
  try {
    if (req.files && req.files.length > 0) {
      for (const f of req.files) {
        if (f.buffer && !f.path) {
          const ts = Date.now() + '_' + Math.random().toString(36).slice(2, 8);
          const safe = (f.originalname || 'archivo')
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

// ====== PUBLIC ROUTES (no auth) — used by the public site ======
// Mounted before requireAuth so anyone can read published posts.
router.get('/public/posts', listPublicPosts);
router.get('/public/posts/:slug', getPublicPostBySlug);

// ====== AUTHENTICATED ROUTES (admin / members) ======
router.use(requireAuth);

// Categories
router.get('/categories', listCategories);
router.post('/categories', createCategory);
router.put('/categories/:id', updateCategory);
router.delete('/categories/:id', deleteCategory);

// Posts
router.get('/posts', listPosts);
router.get('/posts/:id', getPost);
router.post('/posts', createPost);
router.put('/posts/:id', updatePost);
router.delete('/posts/:id', deletePost);

// Attachments
router.post('/posts/:id/images', uploadImages.array('files', 20), addImages);
router.post('/posts/:id/videos', uploadVideos.array('files', 10), addVideos);
router.post(
  '/posts/:id/documents',
  uploadDocuments.array('files', 10),
  persistMemoryFiles,
  addDocuments
);
router.delete('/posts/:id/files/:kind/:fileId', deleteFile);

// Links
router.post('/posts/:id/links', addLink);
router.delete('/posts/:id/links/:linkId', deleteLink);

// Comments
router.post('/posts/:id/comments', addComment);
router.delete('/posts/:id/comments/:commentId', deleteComment);

export default router;