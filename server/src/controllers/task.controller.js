import Task from '../models/Task.js';
import Project from '../models/Project.js';
import mongoose from 'mongoose';
import fs from 'fs';
import { validateFile, categorizeFile } from '../lib/fileGuard.js';

// Build a filter that shows tasks from projects where user is owner OR member,
// OR tasks the user owns directly
async function buildUserTaskFilter(userId) {
  const accessibleProjectIds = await Project.find({
    $or: [
      { owner: userId },
      { 'members.user': userId },
    ],
  }).distinct('_id');
  return {
    $or: [
      { owner: userId },
      { project: { $in: accessibleProjectIds } },
    ],
  };
}

export async function listTasks(req, res, next) {
  try {
    const filter = await buildUserTaskFilter(req.user._id);
    if (req.query.status) filter.status = req.query.status;
    if (req.query.project) filter.project = req.query.project;
    if (req.query.client) filter.client = req.query.client;
    if (req.query.priority) filter.priority = req.query.priority;
    const tasks = await Task.find(filter)
      .populate('project', 'title status')
      .populate('client', 'name')
      .populate('comments.author', 'name email')
      .populate('images.uploadedBy', 'name email')
      .populate('videos.uploadedBy', 'name email')
      .populate('documents.uploadedBy', 'name email')
      .sort({ dueDate: 1, createdAt: -1 });
    res.json(tasks);
  } catch (err) { next(err); }
}

export async function createTask(req, res, next) {
  try {
    const task = await Task.create({ ...req.body, owner: req.user._id });
    const populated = await task.populate(['project', 'client']);
    res.status(201).json(populated);
  } catch (err) { next(err); }
}

export async function updateTask(req, res, next) {
  try {
    const filter = await buildUserTaskFilter(req.user._id);
    filter._id = req.params.id;
    const task = await Task.findOneAndUpdate(filter, req.body, { new: true, runValidators: true })
      .populate('project', 'title status')
      .populate('client', 'name')
      .populate('comments.author', 'name email');
    if (!task) return res.status(404).json({ message: 'Tarea no encontrada' });
    res.json(task);
  } catch (err) { next(err); }
}

export async function deleteTask(req, res, next) {
  try {
    const filter = await buildUserTaskFilter(req.user._id);
    filter._id = req.params.id;
    const task = await Task.findOneAndDelete(filter);
    if (!task) return res.status(404).json({ message: 'Tarea no encontrada' });
    // Cleanup files on disk
    const cleanup = (arr = []) => {
      for (const f of arr) {
        if (f.url && f.url.startsWith('/api/uploads/')) {
          const path = `.${f.url}`;
          fs.unlink(path, () => {});
        }
      }
    };
    cleanup(task.images);
    cleanup(task.videos);
    cleanup(task.documents);
    res.json({ ok: true });
  } catch (err) { next(err); }
}

// === Attachments ===
function fileToObject(file, userId) {
  return {
    url: `/api/uploads/${file.filename}`,
    filename: file.originalname,
    mimetype: file.mimetype,
    size: file.size,
    uploadedBy: userId,
  };
}

export async function addImages(req, res, next) {
  try {
    const filter = await buildUserTaskFilter(req.user._id);
    filter._id = req.params.id;
    const files = req.files || [];
    const additions = files.map((f) => fileToObject(f, req.user._id));
    const task = await Task.findOneAndUpdate(
      filter,
      { $push: { images: { $each: additions } } },
      { new: true }
    )
      .populate('images.uploadedBy', 'name email')
      .populate('comments.author', 'name email');
    if (!task) return res.status(404).json({ message: 'Tarea no encontrada' });
    res.json(task);
  } catch (err) { next(err); }
}

export async function addVideos(req, res, next) {
  try {
    const filter = await buildUserTaskFilter(req.user._id);
    filter._id = req.params.id;
    const files = req.files || [];
    const additions = files.map((f) => fileToObject(f, req.user._id));
    const task = await Task.findOneAndUpdate(
      filter,
      { $push: { videos: { $each: additions } } },
      { new: true }
    )
      .populate('videos.uploadedBy', 'name email')
      .populate('comments.author', 'name email');
    if (!task) return res.status(404).json({ message: 'Tarea no encontrada' });
    res.json(task);
  } catch (err) { next(err); }
}

// Generic documents (.js, .html, .pdf, .docx, .zip, source code, etc.)
// Validates extension + MIME + magic bytes via fileGuard.
export async function addDocuments(req, res, next) {
  try {
    const filter = await buildUserTaskFilter(req.user._id);
    filter._id = req.params.id;
    const files = req.files || [];
    if (!files.length) return res.status(400).json({ message: 'Sin archivos' });

    const accepted = [];
    const rejected = [];
    for (const f of files) {
      const check = validateFile({
        originalname: f.originalname,
        mimetype: f.mimetype,
        buffer: f.buffer, // only present when memoryStorage is used
      });
      if (!check.ok) {
        // Remove rejected file from disk if it was saved
        if (f.path) fs.unlink(f.path, () => {});
        rejected.push({ filename: f.originalname, error: check.error });
      } else {
        accepted.push(fileToObject(f, req.user._id));
      }
    }

    // If every file was rejected, return 400 with the list
    if (accepted.length === 0) {
      return res.status(400).json({
        message: 'Ningún archivo pasó la validación',
        rejected,
      });
    }

    const task = await Task.findOneAndUpdate(
      filter,
      { $push: { documents: { $each: accepted } } },
      { new: true }
    )
      .populate('documents.uploadedBy', 'name email')
      .populate('comments.author', 'name email');

    if (!task) {
      // Cleanup just-uploaded files since the task wasn't found
      for (const f of files) if (f.path) fs.unlink(f.path, () => {});
      return res.status(404).json({ message: 'Tarea no encontrada' });
    }

    res.json({ task, rejected });
  } catch (err) { next(err); }
}

export async function deleteFile(req, res, next) {
  try {
    const { id, kind, fileId } = req.params;
    if (!['images', 'videos', 'documents'].includes(kind)) {
      return res.status(400).json({ message: 'Tipo inválido' });
    }
    const filter = await buildUserTaskFilter(req.user._id);
    filter._id = id;
    filter[`${kind}._id`] = new mongoose.Types.ObjectId(fileId);
    const task = await Task.findOne(filter);
    if (!task) return res.status(404).json({ message: 'Archivo no encontrado' });

    const file = (task[kind] || []).find((f) => f._id.toString() === fileId);
    if (file && file.url && file.url.startsWith('/api/uploads/')) {
      fs.unlink(`.${file.url}`, () => {});
    }

    const updated = await Task.findOneAndUpdate(
      filter,
      { $pull: { [kind]: { _id: fileId } } },
      { new: true }
    );
    res.json(updated);
  } catch (err) { next(err); }
}

// === Comments ===
export async function addComment(req, res, next) {
  try {
    const { text } = req.body;
    if (!text || !text.trim()) return res.status(400).json({ message: 'Comentario vacío' });
    const filter = await buildUserTaskFilter(req.user._id);
    filter._id = req.params.id;
    const task = await Task.findOneAndUpdate(
      filter,
      { $push: { comments: { text: text.trim(), author: req.user._id } } },
      { new: true }
    ).populate('comments.author', 'name email');
    if (!task) return res.status(404).json({ message: 'Tarea no encontrada' });
    res.json(task);
  } catch (err) { next(err); }
}

export async function deleteComment(req, res, next) {
  try {
    const filter = await buildUserTaskFilter(req.user._id);
    filter._id = req.params.id;
    filter['comments._id'] = new mongoose.Types.ObjectId(req.params.commentId);
    const task = await Task.findOne(filter);
    if (!task) return res.status(404).json({ message: 'Comentario no encontrado' });
    // Only author or task owner can delete
    const comment = task.comments.find((c) => c._id.toString() === req.params.commentId);
    if (!comment) return res.status(404).json({ message: 'Comentario no encontrado' });
    const isAuthor = comment.author.toString() === req.user._id.toString();
    const isTaskOwner = task.owner.toString() === req.user._id.toString();
    if (!isAuthor && !isTaskOwner) return res.status(403).json({ message: 'Sin permiso' });

    const updated = await Task.findOneAndUpdate(
      filter,
      { $pull: { comments: { _id: req.params.commentId } } },
      { new: true }
    ).populate('comments.author', 'name email');
    res.json(updated);
  } catch (err) { next(err); }
}
