import { AuditLog } from '../models/AuditLog.js';

// Fire-and-forget audit logger. Never throws — logging must not break the request.
export function audit({
  req,
  actor,
  action,
  category,
  targetType = '',
  targetId = '',
  targetLabel = '',
  meta = {},
  severity = 'info',
}) {
  try {
    const u = actor || req?.user;
    if (!u) return; // can't audit anonymous actions at this layer
    AuditLog.create({
      actor: u._id,
      actorName: u.name || u.email || 'Unknown',
      actorRole: u.role || 'member',
      action,
      category,
      targetType,
      targetId: targetId ? String(targetId) : '',
      targetLabel: targetLabel ? String(targetLabel).slice(0, 200) : '',
      meta: meta || {},
      ip: req?.ip || req?.headers?.['x-forwarded-for'] || req?.socket?.remoteAddress || '',
      userAgent: (req?.headers?.['user-agent'] || '').slice(0, 240),
      severity,
    }).catch((err) => {
      // Don't crash on logging failure, but surface to stderr so it shows up in docker logs.
      console.warn('[audit] failed to write log entry:', err?.message || err);
    });
  } catch (err) {
    console.warn('[audit] unexpected error:', err?.message || err);
  }
}

// Helper to extract a stable label from a doc
export function labelOf(doc, fallbackFields = ['name', 'title', 'email', 'slug']) {
  if (!doc) return '';
  if (typeof doc === 'string') return doc;
  for (const f of fallbackFields) {
    if (doc[f]) return String(doc[f]);
  }
  return '';
}

export default audit;
