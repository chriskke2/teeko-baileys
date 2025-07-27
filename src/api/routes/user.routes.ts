import express from 'express';
import { addUser, getAllUsers, deleteUser, activateUser, sendImageMessage, sendImageFromDb } from '../controllers/user.controller';
import authMiddleware from '../middlewares/auth.middleware';

const router = express.Router();

// Apply the authentication middleware to all routes in this file
router.use(authMiddleware);

// POST /api/users/subscribe
router.post('/subscribe', addUser);

// POST /api/users/activate
router.post('/activate', activateUser);

// POST /api/users/send-image
router.post('/send-image', sendImageMessage);

// POST /api/users/send-image-from-db
router.post('/send-image-from-db', sendImageFromDb);

// GET /api/users/
router.get('/', getAllUsers);

// DELETE /api/users/:userId
router.delete('/:userId', deleteUser);

export default router; 