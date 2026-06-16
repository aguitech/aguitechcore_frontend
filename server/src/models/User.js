import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const ROLES = ['admin', 'manager', 'member', 'client'];

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, minlength: 6 },
    role: { type: String, enum: ROLES, default: 'member' },
    phone: { type: String, trim: true, default: '' },
    active: { type: Boolean, default: true },
    lastLogin: { type: Date },
  },
  { timestamps: true }
);

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

userSchema.methods.comparePassword = function (plain) {
  return bcrypt.compare(plain, this.password);
};

userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  delete obj.__v;
  return obj;
};

userSchema.statics.ROLES = ROLES;
userSchema.statics.ROLE_LABELS = {
  admin: 'Administrador',
  manager: 'Manager',
  member: 'Miembro',
  client: 'Cliente',
};
userSchema.statics.ROLE_DESCRIPTIONS = {
  admin: 'Acceso total. Puede crear/eliminar usuarios y gestionar todo el sistema.',
  manager: 'Gestiona proyectos, clientes y tareas. Puede ver el equipo.',
  member: 'Trabaja en tareas asignadas. Solo ve lo propio.',
  client: 'Acceso limitado. Solo ve sus propios proyectos.',
};

export default mongoose.model('User', userSchema);
