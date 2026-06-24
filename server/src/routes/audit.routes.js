import { Router } from 'express';
import { AuditLog } from '../models/AuditLog.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

// GET /api/audit-log — admin-only chronological log
// Filters: ?category=task&actor=<id>&action=task.assign&severity=info&from=ISO&to=ISO&q=text
router.get('/', async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ msg: 'Solo administradores pueden ver la bitácora' });
    }
    const limit = Math.min(parseInt(req.query.limit, 10) || 100, 500);
    const skip = Math.max(parseInt(req.query.skip, 10) || 0, 0);
    const filter = {};
    if (req.query.category) filter.category = req.query.category;
    if (req.query.actor) filter.actor = req.query.actor;
    if (req.query.action) filter.action = req.query.action;
    if (req.query.severity) filter.severity = req.query.severity;
    if (req.query.targetType) filter.targetType = req.query.targetType;
    if (req.query.targetId) filter.targetId = req.query.targetId;
    if (req.query.from || req.query.to) {
      filter.createdAt = {};
      if (req.query.from) filter.createdAt.$gte = new Date(req.query.from);
      if (req.query.to) filter.createdAt.$lte = new Date(req.query.to);
    }
    if (req.query.q) {
      const rx = new RegExp(String(req.query.q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [
        { actorName: rx },
        { targetLabel: rx },
        { action: rx },
      ];
    }
    const [items, total] = await Promise.all([
      AuditLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      AuditLog.countDocuments(filter),
    ]);
    // Aggregate stats — useful for the dashboard tiles
    const [byCategory, bySeverity, byDay] = await Promise.all([
      AuditLog.aggregate([
        { $match: filter },
        { $group: { _id: '$category', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      AuditLog.aggregate([
        { $match: filter },
        { $group: { _id: '$severity', count: { $sum: 1 } } },
      ]),
      AuditLog.aggregate([
        { $match: filter },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: -1 } },
        { $limit: 30 },
      ]),
    ]);
    res.json({ items, total, limit, skip, stats: { byCategory, bySeverity, byDay } });
  } catch (err) {
    next(err);
  }
});

// GET /api/audit-log/export — admin-only CSV export
router.get('/export', async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ msg: 'Solo administradores pueden exportar la bitácora' });
    }
    const limit = Math.min(parseInt(req.query.limit, 10) || 5000, 50000);
    const items = await AuditLog.find().sort({ createdAt: -1 }).limit(limit).lean();
    const header = ['createdAt', 'actorName', 'actorRole', 'category', 'action', 'severity', 'targetType', 'targetId', 'targetLabel', 'ip'];
    const escape = (v) => {
      if (v === null || v === undefined) return '';
      const s = String(v).replace(/"/g, '""');
      return /[",\n]/.test(s) ? `"${s}"` : s;
    };
    const rows = items.map((it) =>
      [it.createdAt, it.actorName, it.actorRole, it.category, it.action, it.severity, it.targetType, it.targetId, it.targetLabel, it.ip]
        .map(escape).join(',')
    );
    const csv = [header.join(','), ...rows].join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="bitacora-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send('\uFEFF' + csv); // BOM so Excel acentos OK
  } catch (err) {
    next(err);
  }
});

export default router;
