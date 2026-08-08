import mongoose from 'mongoose';

// ─────────────────────────────────────────────────────────────────
// INCIDENT MODEL — sibling of Task but for unplanned events.
//
// A Task is "we planned to do X". An Incident is "X broke and we
// need to react". They share the same attachment/comment/link
// sub-schemas so the UI and upload pipeline can be identical.
//
// Differences from Task:
//   - severity (S1..S4) instead of just priority (alta/media/baja).
//   - status has 4 stages: abierta → en_atencion → resuelta → cerrada.
//   - type categorizes the nature of the incident (bug, caida, etc.).
//   - SLA tracking: responseDueAt + resolveDueAt computed from severity.
//   - Post-mortem fields populated when the incident is resolved/closed.
//   - references allow linking to affected Tasks/Projects/Clients.
// ─────────────────────────────────────────────────────────────────

// Reuse the same file/link/comment schemas from Task — keeps the
// attachment pipeline single-sourced.
import { createRequire } from 'module';
const _require = createRequire(import.meta.url);

// File/link/comment sub-schemas are inline (duplicated on purpose) so
// changing one model never accidentally affects the other. Mongo doesn't
// care, and Mongoose merges them safely when both are embedded.

const fileSchema = new mongoose.Schema(
  {
    url: { type: String, required: true },
    filename: { type: String, required: true },
    mimetype: { type: String, required: true },
    size: { type: Number, required: true },
    uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { _id: true, timestamps: { createdAt: true, updatedAt: false } }
);

const linkSchema = new mongoose.Schema(
  {
    url: { type: String, required: true, trim: true },
    title: { type: String, trim: true, default: '' },
    description: { type: String, trim: true, default: '', maxlength: 500 },
    addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { _id: true, timestamps: { createdAt: true, updatedAt: false } }
);

const commentSchema = new mongoose.Schema(
  {
    text: { type: String, required: true, trim: true, maxlength: 2000 },
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { _id: true, timestamps: true }
);

// Severity → SLA matrix (minutes).
//   S1 (critica): 15min response, 4h resolve
//   S2 (alta):    30min response, 8h resolve
//   S3 (media):   2h   response, 24h resolve
//   S4 (baja):    8h   response, 72h resolve
// Resolution time applies to when status moves to 'resuelta'.
// 'cerrada' is the post-mortem stage AFTER resolution.
const SLA_MATRIX = {
  S1: { responseMinutes: 15, resolveMinutes: 240 },
  S2: { responseMinutes: 30, resolveMinutes: 480 },
  S3: { responseMinutes: 120, resolveMinutes: 1440 },
  S4: { responseMinutes: 480, resolveMinutes: 4320 },
};

const incidentSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },

    // What happened. Free text, like a bug report.
    description: { type: String, trim: true, maxlength: 5000 },

    // Status with 4 explicit stages — closed is a separate state from resolved.
    status: {
      type: String,
      enum: ['abierta', 'en_atencion', 'resuelta', 'cerrada'],
      default: 'abierta',
      index: true,
    },

    // Severity replaces priority for incidents. S1 is the worst.
    severity: {
      type: String,
      enum: ['S1', 'S2', 'S3', 'S4'],
      default: 'S3',
      index: true,
    },

    // Categorization — what kind of incident is this.
    type: {
      type: String,
      enum: ['bug', 'caida', 'seguridad', 'rendimiento', 'datos', 'ux', 'otro'],
      default: 'bug',
      index: true,
    },

    // ─── SLA tracking ────────────────────────────────────────────
    // responseDueAt: when the team must first engage (assignee != null OR
    //   status != 'abierta'). Once firstRespondedAt is set, this is moot.
    // resolveDueAt: hard deadline to reach 'resuelta'. If now > resolveDueAt
    //   and status != 'resuelta'/'cerrada', the incident is "SLA breached".
    responseDueAt: { type: Date },
    resolveDueAt: { type: Date },
    firstRespondedAt: { type: Date },
    resolvedAt: { type: Date },
    closedAt: { type: Date },

    // ─── Post-mortem (filled when status moves to resuelta/cerrada) ──
    resolution: { type: String, trim: true, maxlength: 5000 },
    rootCause: { type: String, trim: true, maxlength: 5000 },
    prevention: { type: String, trim: true, maxlength: 5000 },

    // Impact (free text — "10 clientes sin acceso al dashboard durante 2h")
    impact: { type: String, trim: true, maxlength: 2000 },

    // ─── People ──────────────────────────────────────────────────
    // owner = who reported / is responsible for the incident.
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    // assignee = who is fixing it. null until someone picks it up.
    assignee: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },

    // ─── Cross-references (optional) ─────────────────────────────
    project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project', default: null, index: true },
    client: { type: mongoose.Types.ObjectId, ref: 'Client', default: null, index: true },
    affectedTasks: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Task' }],

    // ─── Same attachments model as Task ───────────────────────────
    images: { type: [fileSchema], default: [] },
    videos: { type: [fileSchema], default: [] },
    documents: { type: [fileSchema], default: [] },
    links: { type: [linkSchema], default: [] },
    comments: { type: [commentSchema], default: [] },
  },
  { timestamps: true }
);

// ─────────────────────────────────────────────────────────────────
// PRE-SAVE: recompute SLA deadlines whenever severity changes.
// Called automatically before .save().
// ─────────────────────────────────────────────────────────────────
incidentSchema.pre('save', function (next) {
  if (this.isModified('severity') || this.isNew) {
    const sla = SLA_MATRIX[this.severity] || SLA_MATRIX.S3;
    const createdAt = this.createdAt || this.isNew ? new Date() : this.createdAt;
    if (!this.responseDueAt) this.responseDueAt = new Date(createdAt.getTime() + sla.responseMinutes * 60_000);
    if (!this.resolveDueAt) this.resolveDueAt = new Date(createdAt.getTime() + sla.resolveMinutes * 60_000);
  }

  // Stamp status transition timestamps.
  if (this.isModified('status')) {
    const now = new Date();
    if (this.status === 'en_atencion' && !this.firstRespondedAt) {
      this.firstRespondedAt = now;
    }
    if (this.status === 'resuelta' && !this.resolvedAt) {
      this.resolvedAt = now;
    }
    if (this.status === 'cerrada' && !this.closedAt) {
      this.closedAt = now;
    }
  }

  next();
});

// ─────────────────────────────────────────────────────────────────
// INSTANCE METHODS
// ─────────────────────────────────────────────────────────────────

// Returns whether SLA is currently breached (used by frontend badges).
incidentSchema.methods.slaStatus = function () {
  const now = new Date();
  if (this.status === 'cerrada' || this.status === 'resuelta') return 'ok';
  if (now > this.resolveDueAt) return 'breached';
  if (now > this.responseDueAt && !this.firstRespondedAt) return 'response_overdue';
  return 'ok';
};

// Computed age in minutes since creation.
incidentSchema.methods.ageMinutes = function () {
  return Math.floor((Date.now() - this.createdAt.getTime()) / 60_000);
};

// Minutes remaining until SLA breach (negative = already breached).
incidentSchema.methods.minutesToBreach = function () {
  return Math.floor((this.resolveDueAt.getTime() - Date.now()) / 60_000);
};

// Static: severity options for the frontend dropdowns.
incidentSchema.statics.SEVERITY_OPTIONS = [
  { value: 'S1', label: '🔴 S1 — Crítica',     sla: '15min respuesta · 4h resolución' },
  { value: 'S2', label: '🟠 S2 — Alta',        sla: '30min respuesta · 8h resolución' },
  { value: 'S3', label: '🟡 S3 — Media',       sla: '2h respuesta · 24h resolución' },
  { value: 'S4', label: '🟢 S4 — Baja',        sla: '8h respuesta · 72h resolución' },
];

incidentSchema.statics.STATUS_OPTIONS = [
  { value: 'abierta',     label: '🔴 Abierta',     color: '#ef4444' },
  { value: 'en_atencion', label: '🟡 En atención', color: '#f59e0b' },
  { value: 'resuelta',    label: '🟢 Resuelta',    color: '#10b981' },
  { value: 'cerrada',     label: '⚫ Cerrada',     color: '#6b7280' },
];

incidentSchema.statics.TYPE_OPTIONS = [
  { value: 'bug',         label: '🐞 Bug' },
  { value: 'caida',       label: '💥 Caída de servicio' },
  { value: 'seguridad',   label: '🔒 Seguridad' },
  { value: 'rendimiento', label: '⚡ Rendimiento' },
  { value: 'datos',       label: '📊 Datos' },
  { value: 'ux',          label: '🎨 UX' },
  { value: 'otro',        label: '📦 Otro' },
];

// Expose the SLA matrix for the UI to render "due in Xh Ym".
incidentSchema.statics.SLA_MATRIX = SLA_MATRIX;

export default mongoose.model('Incident', incidentSchema);