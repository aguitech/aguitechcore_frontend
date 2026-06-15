import User from '../models/User.js';
import bcrypt from 'bcryptjs';

export async function getProfile(req, res) {
  res.json({ user: req.user });
}

export async function updateProfile(req, res, next) {
  try {
    const { name, email, phone } = req.body;
    const updates = {};
    if (name) updates.name = name;
    if (email) updates.email = email;
    if (phone !== undefined) updates.phone = phone;
    const user = await User.findByIdAndUpdate(req.user._id, updates, { new: true, runValidators: true });
    res.json({ user });
  } catch (err) { next(err); }
}

export async function changePassword(req, res, next) {
  try {
    const { current, next: nextPwd } = req.body;
    if (!current || !nextPwd) return res.status(400).json({ message: 'Faltan contraseñas' });
    if (nextPwd.length < 6) return res.status(400).json({ message: 'Mínimo 6 caracteres' });
    const user = await User.findById(req.user._id);
    const ok = await user.comparePassword(current);
    if (!ok) return res.status(401).json({ message: 'Contraseña actual incorrecta' });
    user.password = nextPwd;
    await user.save();
    res.json({ ok: true });
  } catch (err) { next(err); }
}
