import { Router } from 'express';
import { Notification } from '../models/Notification.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

// GET /api/notifications — most recent first, paginated
// Optional: ?unreadOnly=true&limit=50&skip=0
router.get('/', async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const skip = Math.max(parseInt(req.query.skip, 10) || 0, 0);
    const filter = { recipient: req.user._id };
    if (String(req.query.unreadOnly) === 'true') filter.read = false;
    const [items, total, unread] = await Promise.all([
      Notification.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Notification.countDocuments(filter),
      Notification.countDocuments({ recipient: req.user._id, read: false }),
    ]);
    res.json({ items, total, unread, limit, skip });
  } catch (err) {
    next(err);
  }
});

// POST /api/notifications/mark-read — mark items as read
// Body: { ids: ['...','...'] } or { all: true }
router.post('/mark-read', async (req, res, next) => {
  try {
    const now = new Date();
    const filter = { recipient: req.user._id };
    if (req.body && req.body.all === true) {
      // mark all unread as read
    } else if (Array.isArray(req.body?.ids) && req.body.ids.length > 0) {
      filter._id = { $in: req.body.ids };
    } else {
      return res.status(400).json({ msg: 'ids[] o all:true requerido' });
    }
    const r = await Notification.updateMany(filter, { $set: { read: true, readAt: now } });
    res.json({ ok: true, modified: r.modifiedCount || 0 });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/notifications/:id — delete a single notification (the user "dismisses" it)
router.delete('/:id', async (req, res, next) => {
  try {
    const r = await Notification.deleteOne({ _id: req.params.id, recipient: req.user._id });
    if (r.deletedCount === 0) return res.status(404).json({ msg: 'Notificación no encontrada' });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// POST /api/notifications/clear-all — wipe the user's notifications
router.post('/clear-all', async (req, res, next) => {
  try {
    const r = await Notification.deleteMany({ recipient: req.user._id });
    res.json({ ok: true, deleted: r.deletedCount || 0 });
  } catch (err) {
    next(err);
  }
});

export default router;
