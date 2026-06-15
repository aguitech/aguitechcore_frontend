import { Router } from 'express';
import { getProfile, updateProfile, changePassword } from '../controllers/profile.controller.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

router.get('/', getProfile);
router.put('/', updateProfile);
router.put('/password', changePassword);

export default router;
