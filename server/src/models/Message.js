import mongoose from 'mongoose';

const attachmentSchema = new mongoose.Schema(
  {
    kind: { type: String, enum: ['image', 'video', 'document'], required: true },
    url: { type: String, required: true },
    filename: { type: String, required: true },
    mimetype: { type: String, required: true },
    size: { type: Number, required: true },
  },
  { _id: false }
);

const messageSchema = new mongoose.Schema(
  {
    conversation: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true, index: true },
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    // text is optional when attachments are present (image-only / file-only messages)
    text: { type: String, trim: true, maxlength: 4000, default: '' },
    // Optional file attachments (images, videos, generic files)
    attachments: { type: [attachmentSchema], default: [] },
    // Per-user read state: array of user ids who have read this message
    readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    // Optional: edited/deleted metadata for future
    editedAt: { type: Date, default: null },
    deleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Compound index for efficient cursor-based pagination:
// "get the last 30 messages before a given cursor, ordered desc"
messageSchema.index({ conversation: 1, _id: -1 });

// Backward-compat validator: at least text OR one attachment must exist
messageSchema.pre('validate', function (next) {
  if ((!this.text || !this.text.trim()) && (!this.attachments || this.attachments.length === 0)) {
    return next(new Error('El mensaje debe tener texto o al menos un adjunto'));
  }
  next();
});

export default mongoose.model('Message', messageSchema);
