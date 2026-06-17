import mongoose from 'mongoose';

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

const commentSchema = new mongoose.Schema(
  {
    text: { type: String, required: true, trim: true, maxlength: 2000 },
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { _id: true, timestamps: true }
);

const taskSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    status: { type: String, enum: ['pendiente', 'en_curso', 'hecho'], default: 'pendiente' },
    priority: { type: String, enum: ['baja', 'media', 'alta'], default: 'media' },
    dueDate: { type: Date },
    project: { type: mongoose.Schema.Types.ObjectId, ref: 'Project' },
    client: { type: mongoose.Schema.Types.ObjectId, ref: 'Client' },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    images: { type: [fileSchema], default: [] },
    videos: { type: [fileSchema], default: [] },
    documents: { type: [fileSchema], default: [] }, // generic file attachments (.js, .html, .pdf, .docx, archives, etc.)
    comments: { type: [commentSchema], default: [] },
  },
  { timestamps: true }
);

export default mongoose.model('Task', taskSchema);
