import User from '../models/User.js';

export async function listUsers(_req, res, next) {
  try {
    const users = await User.find().sort({ createdAt: -1 });
    res.json(users);
  } catch (err) { next(err); }
}

export async function getUser(req, res, next) {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'Usuario no encontrado' });
    res.json(user);
  } catch (err) { next(err); }
}

export async function createUser(req, res, next) {
  try {
    const { name, email, password, role, phone } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Nombre, email y contraseña son requeridos' });
    }
    if (!User.ROLES.includes(role)) {
      return res.status(400).json({ message: `Rol inválido. Opciones: ${User.ROLES.join(', ')}` });
    }
    const exists = await User.findOne({ email: email.toLowerCase() });
    if (exists) return res.status(409).json({ message: 'Ese email ya está registrado' });
    const user = await User.create({ name, email, password, role, phone });
    res.status(201).json(user);
  } catch (err) { next(err); }
}

export async function updateUser(req, res, next) {
  try {
    const { name, email, role, phone, active, password } = req.body;
    const updates = {};
    if (name !== undefined) updates.name = name;
    if (email !== undefined) updates.email = email.toLowerCase();
    if (role !== undefined) {
      if (!User.ROLES.includes(role)) {
        return res.status(400).json({ message: `Rol inválido. Opciones: ${User.ROLES.join(', ')}` });
      }
      updates.role = role;
    }
    if (phone !== undefined) updates.phone = phone;
    if (active !== undefined) updates.active = active;
    if (password) updates.password = password;
    const user = await User.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });
    if (!user) return res.status(404).json({ message: 'Usuario no encontrado' });
    res.json(user);
  } catch (err) { next(err); }
}

export async function deleteUser(req, res, next) {
  try {
    if (req.params.id === req.user._id.toString()) {
      return res.status(400).json({ message: 'No puedes eliminarte a ti mismo' });
    }
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ message: 'Usuario no encontrado' });
    res.json({ ok: true });
  } catch (err) { next(err); }
}

export async function getRoleInfo(_req, res) {
  res.json({
    roles: User.ROLES,
    labels: User.ROLE_LABELS,
    descriptions: User.ROLE_DESCRIPTIONS,
  });
}
