import mongoose from 'mongoose';

const MEMBER_ROLES = ['colaborador', 'revisor', 'observador'];

const memberSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  role: { type: String, enum: MEMBER_ROLES, default: 'colaborador' },
  addedAt: { type: Date, default: Date.now },
}, { _id: false });

const projectSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    client: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true },
    status: { type: String, enum: ['activo', 'pausado', 'completado'], default: 'activo' },
    progress: { type: Number, min: 0, max: 100, default: 0 },
    description: { type: String, default: '' },
    budget: { type: Number, default: null },
    startDate: { type: Date, default: null },
    endDate: { type: Date, default: null },
    members: { type: [memberSchema], default: [] },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

projectSchema.statics.MEMBER_ROLES = MEMBER_ROLES;
projectSchema.statics.MEMBER_ROLE_LABELS = {
  colaborador: 'Colaborador (puede editar tareas)',
  revisor: 'Revisor (puede ver y comentar)',
  observador: 'Observador (solo ver)',
};

export default mongoose.model('Project', projectSchema);
