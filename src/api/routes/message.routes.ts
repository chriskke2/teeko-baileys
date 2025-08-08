import express from 'express';
import { sendMessage } from '../controllers/message.controller';
import authMiddleware from '../middlewares/auth.middleware';

const router = express.Router();

// Apply the authentication middleware to all routes in this file
router.use(authMiddleware);

// POST /api/message/send
router.post('/send', sendMessage);

export default router;
