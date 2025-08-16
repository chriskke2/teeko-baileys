import express from 'express';
import { downloadMedia, getMediaInfo } from '../controllers/media.controller';
import authMiddleware from '../middlewares/auth.middleware';

const router = express.Router();

// Apply the authentication middleware to all routes in this file
router.use(authMiddleware);

// POST /api/media/download - Download media file and return binary data
router.post('/download', downloadMedia);

// POST /api/media/info - Get media file information without downloading
router.post('/info', getMediaInfo);

export default router;
