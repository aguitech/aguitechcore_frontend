import mongoose from 'mongoose';

const projectSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    client: { type: String, required: true, trim: true },
    status: { type: String, enum: ['activo', 'pausado', 'completado'], default: 'activo' },
    progress: { type: Number, min: 0, max: 100, default: 0 },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

export default mongoose.model('Project', projectSchema);
