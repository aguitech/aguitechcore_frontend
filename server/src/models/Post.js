import mongoose from 'mongoose';

// Reusable subdocument for any uploaded file (matches the pattern in Task.js).
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

const postSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    slug: { type: String, required: true, unique: true, trim: true, lowercase: true, index: true },
    excerpt: { type: String, trim: true, maxlength: 500, default: '' },
    body: { type: String, trim: true, default: '' }, // plain text / markdown-ish note
    coverImage: { type: String, default: '' }, // url of an attached image (optional)
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'BlogCategory',
      required: true,
      index: true,
    },
    tags: { type: [String], default: [], index: true },
    status: {
      type: String,
      enum: ['borrador', 'publicado'],
      default: 'borrador',
      index: true,
    },
    // Attachments — same model as tasks
    images: { type: [fileSchema], default: [] },
    videos: { type: [fileSchema], default: [] },
    documents: { type: [fileSchema], default: [] },
    // External links
    links: {
      type: [
        new mongoose.Schema(
          {
            url: { type: String, required: true, trim: true },
            title: { type: String, trim: true, default: '' },
            description: { type: String, trim: true, default: '', maxlength: 500 },
            addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
          },
          { _id: true, timestamps: { createdAt: true, updatedAt: false } }
        ),
      ],
      default: [],
    },
    // Comments / notes by readers (optional, simple — no threading)
    comments: {
      type: [
        new mongoose.Schema(
          {
            text: { type: String, required: true, trim: true, maxlength: 2000 },
            author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
            authorName: { type: String, default: '' }, // snapshot in case user is deleted
          },
          { _id: true, timestamps: { createdAt: true, updatedAt: false } }
        ),
      ],
      default: [],
    },
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    publishedAt: { type: Date, default: null },
    views: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// Auto-generate a URL-safe slug from title when one is not provided.
postSchema.statics.slugify = function slugify(text) {
  return (text || '')
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip accents
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 120);
};

const BlogCategorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 60, unique: true },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    description: { type: String, default: '', maxlength: 300 },
    color: { type: String, default: '#FF6A00' }, // aguitech orange
    icon: { type: String, default: '📝' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

BlogCategorySchema.statics.slugify = postSchema.statics.slugify;

export const Post = mongoose.model('Post', postSchema);
export const BlogCategory = mongoose.model('BlogCategory', BlogCategorySchema);
export default Post;