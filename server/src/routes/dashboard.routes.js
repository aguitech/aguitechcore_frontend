import { Router } from 'express';
import {
  getStats, listProjects, getProject, getProjectDetail, createProject, updateProject, deleteProject,
  addMember, removeMember, getMemberRoles
} from '../controllers/dashboard.controller.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

router.get('/stats', getStats);
router.get('/projects', listProjects);
router.get('/projects/member-roles', getMemberRoles);
router.get('/projects/:id', getProject);
router.get('/projects/:id/detail', getProjectDetail);
router.post('/projects', createProject);
router.put('/projects/:id', updateProject);
router.delete('/projects/:id', deleteProject);
router.post('/projects/:id/members', addMember);
router.delete('/projects/:id/members/:userId', removeMember);

export default router;
