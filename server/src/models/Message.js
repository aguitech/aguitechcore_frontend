import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema(
  {
    conversation: { type: mongoose.Schema.Types.ObjectId, ref: 'Conversation', required: true, index: true },
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    text: { type: String, required: true, trim: true, maxlength: 4000 },
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

export default mongoose.model('Message', messageSchema);
