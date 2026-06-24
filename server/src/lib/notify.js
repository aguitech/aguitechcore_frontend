import { Notification } from '../models/Notification.js';

// Fire-and-forget notification creator. Never throws.
export function notify({
  recipient,
  type,
  title,
  body = '',
  link = '',
  sourceType = '',
  sourceId = '',
  meta = {},
  actor = null,
  actorName = '',
}) {
  try {
    if (!recipient) return;
    if (actor && String(actor) === String(recipient)) {
      // Don't notify people about their own actions
      return;
    }
    Notification.create({
      recipient,
      type,
      title: String(title || '').slice(0, 200),
      body: String(body || '').slice(0, 1000),
      link: String(link || '').slice(0, 240),
      sourceType,
      sourceId: sourceId ? String(sourceId) : '',
      meta: meta || {},
      actor,
      actorName: actorName ? String(actorName).slice(0, 120) : '',
    }).catch((err) => {
      console.warn('[notify] failed to create notification:', err?.message || err);
    });
  } catch (err) {
    console.warn('[notify] unexpected error:', err?.message || err);
  }
}

// Bulk version — creates one notification per recipient. Skips failures.
export function notifyMany({ recipients = [], ...rest }) {
  for (const r of recipients) notify({ ...rest, recipient: r });
}

export default notify;
