import { Router } from 'express';
import {
  listConversations,
  openConversation,
  listMessages,
  sendMessage,
  markRead,
  searchUsers,
} from '../controllers/chat.controller.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();
router.use(requireAuth);

// Search users to start a chat
router.get('/users/search', searchUsers);

// Conversations
router.get('/conversations', listConversations);
router.post('/conversations', openConversation);

// Messages inside a conversation
router.get('/conversations/:id/messages', listMessages);
router.post('/conversations/:id/messages', sendMessage);
router.post('/conversations/:id/read', markRead);

export default router;
