import { Router } from 'express';
import { body } from 'express-validator';
import { register, login, me } from '../controllers/auth.controller.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

router.post(
  '/register',
  [
    body('name').notEmpty().withMessage('Nombre requerido'),
    body('email').isEmail().withMessage('Email inválido'),
    body('password').isLength({ min: 6 }).withMessage('Mínimo 6 caracteres'),
  ],
  register
);

router.post(
  '/login',
  [body('email').isEmail(), body('password').notEmpty()],
  login
);

router.get('/me', requireAuth, me);

export default router;
