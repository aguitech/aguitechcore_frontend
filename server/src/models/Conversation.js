import mongoose from 'mongoose';

const participantSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    // Last time this user read the conversation
    lastReadAt: { type: Date, default: null },
    // Optional: muted/notifications
    muted: { type: Boolean, default: false },
  },
  { _id: false }
);

const conversationSchema = new mongoose.Schema(
  {
    // For 1-on-1 chats we store a deterministic pair id for fast lookup
    // (sorted concatenation of the two user ids)
    pairKey: { type: String },
    // Type of conversation: 'direct' (1-on-1) or 'group' (future)
    type: { type: String, enum: ['direct', 'group'], default: 'direct' },
    // For groups
    name: { type: String, default: null, trim: true },
    participants: { type: [participantSchema], default: [] },
    // Last message preview (denormalized for the left-panel list)
    lastMessage: { type: mongoose.Schema.Types.ObjectId, ref: 'Message', default: null },
    lastMessageAt: { type: Date, default: null, index: true },
    // Soft-delete per user
    archivedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  },
  { timestamps: true }
);

// One direct conversation per pair
conversationSchema.index({ pairKey: 1 }, { unique: true, partialFilterExpression: { type: 'direct' } });

// Lookup conversations for a user, ordered by most recent activity
conversationSchema.index({ 'participants.user': 1, lastMessageAt: -1 });

// Note: pairKey is already indexed via schema.index() above; do NOT add `index: true`
// to the field declaration to avoid a duplicate-index warning from Mongoose.

export default mongoose.model('Conversation', conversationSchema);
