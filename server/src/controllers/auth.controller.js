import jwt from 'jsonwebtoken';
import { validationResult } from 'express-validator';
import User from '../models/User.js';
import { audit } from '../lib/audit.js';

function signToken(user) {
  return jwt.sign(
    { id: user._id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );
}

export async function register(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { name, email, password, role } = req.body;
    const exists = await User.findOne({ email });
    if (exists) return res.status(409).json({ message: 'Ese email ya está registrado' });

    const user = await User.create({ name, email, password, role });
    const token = signToken(user);
    audit({
      req,
      actor: user,
      action: 'user.create',
      category: 'user',
      targetType: 'User',
      targetId: user._id,
      targetLabel: user.name,
      meta: { via: 'register', role: user.role },
      severity: 'info',
    });
    res.status(201).json({ token, user });
  } catch (err) {
    next(err);
  }
}

export async function login(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) {
      audit({
        req,
        actor: { _id: 'anonymous', name: email, role: 'anonymous' },
        action: 'auth.login_failed',
        category: 'auth',
        targetType: 'User',
        targetLabel: email,
        meta: { reason: 'user_not_found' },
        severity: 'warning',
      });
      return res.status(401).json({ message: 'Credenciales inválidas' });
    }

    const ok = await user.comparePassword(password);
    if (!ok) {
      audit({
        req,
        actor: user,
        action: 'auth.login_failed',
        category: 'auth',
        targetType: 'User',
        targetId: user._id,
        targetLabel: user.name,
        meta: { reason: 'bad_password' },
        severity: 'warning',
      });
      return res.status(401).json({ message: 'Credenciales inválidas' });
    }

    const token = signToken(user);
    audit({
      req,
      actor: user,
      action: 'auth.login',
      category: 'auth',
      targetType: 'User',
      targetId: user._id,
      targetLabel: user.name,
    });
    res.json({ token, user });
  } catch (err) {
    next(err);
  }
}

export async function me(req, res) {
  res.json({ user: req.user });
}
