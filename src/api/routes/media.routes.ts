import express from 'express';
import { downloadWhatsAppAudio, downloadWhatsAppImage } from '../controllers/media.controller';
import authMiddleware from '../middlewares/auth.middleware';

const router = express.Router();

// Apply the authentication middleware to all routes in this file
router.use(authMiddleware);

// POST /api/media/download-audio - Download and decrypt WhatsApp audio with minimal payload
router.post('/download-audio', downloadWhatsAppAudio);

// POST /api/media/download-image - Download and decrypt WhatsApp image with minimal payload
router.post('/download-image', downloadWhatsAppImage);

export default router;
