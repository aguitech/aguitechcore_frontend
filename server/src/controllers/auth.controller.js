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

// Self-serve signup is always a 'member'. The role field is taken from the
// query/body only when an ADMIN is creating a user via POST /api/users — not
// here. This prevents a trivial privilege escalation:
//   POST /api/auth/register { email, password, role: 'admin' } → 201 admin.
// We log a warning when the body includes role, so we can spot anyone trying.
const SELF_SERVE_ROLE = 'member';
const ALLOWED_ADMIN_CREATE_ROLES = new Set(['admin', 'manager', 'member']);

export async function register(req, res, next) {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { name, email, password } = req.body;

    // Defense in depth: refuse any role-altering field from anonymous callers.
    // Admin/manager role assignments MUST go through POST /api/users (which
    // requires requireAuth + requireRole('admin') — see user.routes.js).
    if (req.body && Object.prototype.hasOwnProperty.call(req.body, 'role')) {
      audit({
        req,
        actor: { _id: 'anonymous', name: email, role: 'anonymous' },
        action: 'auth.register_role_escalation_attempt',
        category: 'auth',
        targetType: 'User',
        targetLabel: email,
        meta: { attempted_role: String(req.body.role).slice(0, 40) },
        severity: 'warning',
      });
      return res.status(400).json({
        message: 'No puedes elegir tu propio rol al registrarte.',
      });
    }

    const exists = await User.findOne({ email });
    if (exists) return res.status(409).json({ message: 'Ese email ya está registrado' });

    // Force role to 'member' — never trust client input for self-serve signup.
    const user = await User.create({
      name,
      email,
      password,
      role: SELF_SERVE_ROLE,
    });
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

// Helper exported for the admin user-creation endpoint — admins may create
// users with any of these roles; everything else gets rejected.
export function isAllowedAdminRole(role) {
  return ALLOWED_ADMIN_CREATE_ROLES.has(role);
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
