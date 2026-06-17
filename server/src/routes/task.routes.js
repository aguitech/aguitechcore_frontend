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

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ts = Date.now();
    const safe = file.originalname
      .replace(/[^a-zA-Z0-9._-]/g, '_')
      .slice(0, 80);
    cb(null, `${ts}_${safe}`);
  },
});

const imageFilter = (_req, file, cb) => {
  if (/^image\//.test(file.mimetype)) cb(null, true);
  else cb(new Error('Solo se permiten imágenes (jpg, png, webp, gif)'));
};

const videoFilter = (_req, file, cb) => {
  if (/^video\//.test(file.mimetype)) cb(null, true);
  else cb(new Error('Solo se permiten videos (mp4, webm, mov)'));
};

const uploadImages = multer({ storage, fileFilter: imageFilter, limits: { fileSize: 15 * 1024 * 1024 } });
const uploadVideos = multer({ storage, fileFilter: videoFilter, limits: { fileSize: 100 * 1024 * 1024 } });

// CRUD
router.get('/', listTasks);
router.post('/', createTask);
router.put('/:id', updateTask);
router.delete('/:id', deleteTask);

// Attachments
router.post('/:id/images', uploadImages.array('files', 20), addImages);
router.post('/:id/videos', uploadVideos.array('files', 10), addVideos);
router.delete('/:id/files/:kind/:fileId', deleteFile);

// Comments
router.post('/:id/comments', addComment);
router.delete('/:id/comments/:commentId', deleteComment);

export default router;
