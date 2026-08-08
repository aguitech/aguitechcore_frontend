import mongoose from 'mongoose';

// Audit log entry — one row per meaningful user action. Admin-only view.
const auditLogSchema = new mongoose.Schema(
  {
    // Who did it
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    actorName: { type: String, required: true }, // snapshot in case user is deleted
    actorRole: { type: String, required: true },

    // What they did
    action: { type: String, required: true, index: true },
    // Examples:
    //   'auth.login'         'auth.logout'         'auth.login_failed'
    //   'user.create'        'user.update'         'user.delete'         'user.role_change'
    //   'client.create'      'client.update'       'client.delete'
    //   'project.create'     'project.update'      'project.delete'
    //   'task.create'        'task.update'         'task.delete'         'task.assign'        'task.status_change'
    //   'incident.create'    'incident.update'     'incident.delete'     'incident.assign'    'incident.status_change'
    //   'incident.{image,video,document}.add'
    //   'blog.post.create'   'blog.post.update'    'blog.post.delete'    'blog.post.publish'
    //   'blog.category.*'
    //   'chat.message'       'chat.conversation.create'
    //   'apikey.create'      'apikey.revoke'
    //   'file.upload'        'file.delete'
    //   'appointment.create' 'appointment.update'  'appointment.cancel'  'appointment.complete'
    //   'admin.export'       'admin.settings_change'

    category: {
      type: String,
      enum: ['auth', 'user', 'client', 'project', 'task', 'incident', 'blog', 'chat', 'apikey', 'file', 'appointment', 'admin', 'system'],
      required: true,
      index: true,
    },

    // The thing that was acted on
    targetType: { type: String, default: '' }, // 'User', 'Client', 'Task', 'Post', 'Appointment', etc.
    targetId: { type: String, default: '', index: true },
    targetLabel: { type: String, default: '' }, // human-readable snapshot (e.g. user name, post title)

    // Optional structured diff / payload
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
    // Examples:
    //   task.assign: { from: 'userId1', to: 'userId2', taskTitle: 'X' }
    //   blog.post.publish: { from: 'borrador', to: 'publicado' }
    //   apikey.create: { name: 'MCP key', prefix: 'agk_abc...' }

    // Request context
    ip: { type: String, default: '' },
    userAgent: { type: String, default: '' },

    // Severity — admin can filter on this
    severity: {
      type: String,
      enum: ['info', 'warning', 'critical'],
      default: 'info',
      index: true,
    },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ category: 1, createdAt: -1 });
auditLogSchema.index({ actor: 1, createdAt: -1 });

// Auto-expire after 180 days (configurable) to keep the collection lean.
// Set to 0 to disable.
auditLogSchema.statics.ensureTTL = async function ensureTTL(days = 180) {
  if (!days || days <= 0) return;
  try {
    const coll = this.collection;
    const idxs = await coll.indexes();
    const ttlIdx = idxs.find((i) => i.name === 'auditlog_ttl');
    const seconds = days * 24 * 60 * 60;
    if (ttlIdx) {
      if (ttlIdx.expireAfterSeconds !== seconds) {
        await coll.dropIndex('auditlog_ttl');
        await coll.createIndex({ createdAt: 1 }, { expireAfterSeconds: seconds, name: 'auditlog_ttl' });
      }
    } else {
      await coll.createIndex({ createdAt: 1 }, { expireAfterSeconds: seconds, name: 'auditlog_ttl' });
    }
  } catch (err) {
    // TTL index management is best-effort; don't crash startup.
    console.warn('[auditLog] TTL index setup skipped:', err?.message || err);
  }
};

export const AuditLog = mongoose.model('AuditLog', auditLogSchema);
export default AuditLog;
