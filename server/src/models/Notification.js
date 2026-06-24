import mongoose from 'mongoose';

// Bell notification — a single row per "you should know about this" event.
// Sources: chat messages, task assignments, status changes, blog comments,
// appointment updates, etc. The /api/notifications endpoint polls every 30s
// from the client bell-icon dropdown.
const notificationSchema = new mongoose.Schema(
  {
    // Who should see this notification
    recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    // What kind of notification — drives the icon and color
    type: {
      type: String,
      enum: [
        'chat.message',         // someone sent me a chat message
        'chat.mention',         // someone @mentioned me in chat
        'task.assigned',        // I was assigned a task
        'task.status_changed',  // someone changed status of a task I own/watch
        'task.commented',       // someone commented on my task
        'blog.comment',         // someone commented on my blog post
        'blog.published',       // a post I authored was published
        'appointment.created',  // someone booked an appointment with me
        'appointment.cancelled',// an appointment with me was cancelled
        'appointment.reminder', // T-24h / T-1h reminder
        'user.role_changed',    // my role was changed by an admin
        'system',               // generic system notice
      ],
      required: true,
      index: true,
    },

    // Short headline shown in the bell dropdown
    title: { type: String, required: true, maxlength: 200 },

    // Optional longer description (markdown-free, plain text)
    body: { type: String, default: '', maxlength: 1000 },

    // Where clicking the notification should take the user
    link: { type: String, default: '' }, // e.g. '/tasks', '/chat?conv=...', '/blog/...'

    // Source tracking — enables the bell to deep-link to the right place
    sourceType: { type: String, default: '' }, // 'Task' | 'Conversation' | 'Post' | 'Appointment' | ...
    sourceId: { type: String, default: '', index: true },

    // Optional payload for the client to render richer UI
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },

    // Optional sender (who triggered the notification)
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    actorName: { type: String, default: '' },

    // Read state
    read: { type: Boolean, default: false, index: true },
    readAt: { type: Date, default: null },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

notificationSchema.index({ recipient: 1, read: 1, createdAt: -1 });
notificationSchema.index({ recipient: 1, createdAt: -1 });

// Auto-expire after 90 days to keep the collection lean.
notificationSchema.statics.ensureTTL = async function ensureTTL(days = 90) {
  if (!days || days <= 0) return;
  try {
    const coll = this.collection;
    const idxs = await coll.indexes();
    const ttlIdx = idxs.find((i) => i.name === 'notification_ttl');
    const seconds = days * 24 * 60 * 60;
    if (ttlIdx) {
      if (ttlIdx.expireAfterSeconds !== seconds) {
        await coll.dropIndex('notification_ttl');
        await coll.createIndex({ createdAt: 1 }, { expireAfterSeconds: seconds, name: 'notification_ttl' });
      }
    } else {
      await coll.createIndex({ createdAt: 1 }, { expireAfterSeconds: seconds, name: 'notification_ttl' });
    }
  } catch (err) {
    console.warn('[Notification] TTL index setup skipped:', err?.message || err);
  }
};

export const Notification = mongoose.model('Notification', notificationSchema);
export default Notification;
