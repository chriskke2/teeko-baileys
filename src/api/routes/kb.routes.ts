import express from 'express';
import { uploadDocument } from '../controllers/kb.controller';
import authMiddleware from '../middlewares/auth.middleware';

const router = express.Router();

// Apply the authentication middleware to all routes in this file
router.use(authMiddleware);

// POST /api/kb/upload
router.post('/upload', uploadDocument);

export default router; 