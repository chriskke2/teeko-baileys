import express from 'express';
import { addUser, getAllUsers, deleteUser, activateUser, sendImageMessage, sendImageFromDb, sendImageByName, startOnboarding } from '../controllers/user.controller';
import authMiddleware from '../middlewares/auth.middleware';

const router = express.Router();

// Apply the authentication middleware to all routes in this file
router.use(authMiddleware);

// POST /api/users/subscribe
router.post('/subscribe', addUser);

// POST /api/users/activate
router.post('/activate', activateUser);

// POST /api/users/start-onboarding
router.post('/start-onboarding', startOnboarding);

// POST /api/users/send-image
router.post('/send-image', sendImageMessage);

// POST /api/users/send-image-from-db
router.post('/send-image-from-db', sendImageFromDb);

// POST /api/users/send-image-by-name
router.post('/send-image-by-name', sendImageByName);

// GET /api/users/
router.get('/', getAllUsers);

// DELETE /api/users/:userId
router.delete('/:userId', deleteUser);

export default router; 