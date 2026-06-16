import { Router } from 'express';
import { listUsers, getUser, createUser, updateUser, deleteUser, getRoleInfo } from '../controllers/user.controller.js';
import { requireAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';

const router = Router();
router.use(requireAuth);

// Role info - any authenticated user can see
router.get('/roles', getRoleInfo);

// Admin-only routes
router.get('/', requireRole('admin'), listUsers);
router.get('/:id', requireRole('admin', 'manager'), getUser);
router.post('/', requireRole('admin'), createUser);
router.put('/:id', requireRole('admin'), updateUser);
router.delete('/:id', requireRole('admin'), deleteUser);

export default router;
