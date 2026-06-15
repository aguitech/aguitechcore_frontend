import { Router } from 'express';
import { getStats, listProjects, createProject } from '../controllers/dashboard.controller.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

router.get('/stats', getStats);
router.get('/projects', listProjects);
router.post('/projects', createProject);

export default router;
