import { Router } from 'express';
import { getEvents } from '../controllers/calendar.controller.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

router.get('/events', getEvents);

export default router;
