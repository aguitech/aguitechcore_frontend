// API Key model for MCP access.
// Each user can have multiple keys (e.g. one per device or agent).
// Keys are stored as a bcrypt hash; we only keep the prefix for display.
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const apiKeySchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    // Human label, e.g. "Hermes Bot", "Mi laptop", "Cursor IDE"
    name: { type: String, required: true, trim: true, maxlength: 80 },
    // First 12 chars of the key (publicly visible for identification in the UI)
    prefix: { type: String, required: true },
    // bcrypt hash of the FULL key. Never stored in plaintext.
    hashedKey: { type: String, required: true },
    // Last 4 chars suffix (display only, helps user recognize the key)
    suffix: { type: String, required: true },
    enabled: { type: Boolean, default: true },
    lastUsedAt: { type: Date, default: null },
    // Optional expiry (null = never expires)
    expiresAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// Hash the key before saving
apiKeySchema.pre('save', async function (next) {
  if (!this.isModified('hashedKey')) return next();
  // We hash the FULL key. bcrypt is slow on purpose — that's the point.
  this.hashedKey = await bcrypt.hash(this.hashedKey, 10);
  next();
});

// Verify a plaintext key against the stored hash
apiKeySchema.methods.verifyKey = function (plain) {
  return bcrypt.compare(plain, this.hashedKey);
};

// Don't leak the hash in JSON responses
apiKeySchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.hashedKey;
  delete obj.__v;
  return obj;
};

export default mongoose.model('ApiKey', apiKeySchema);
