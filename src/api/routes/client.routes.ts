import express from 'express';
import { createClient, connectClient, disconnectClient, logoutClient, getAllClients, deleteClient, getClientById, syncClientStatuses } from '../controllers/client.controller';
import authMiddleware from '../middlewares/auth.middleware';

const router = express.Router();

// Apply the authentication middleware to all routes in this file
router.use(authMiddleware);

// POST /api/client/create
router.post('/create', createClient);

// POST /api/client/connect
router.post('/connect', connectClient);

// POST /api/client/disconnect
router.post('/disconnect', disconnectClient);

// POST /api/client/logout
router.post('/logout', logoutClient);

// POST /api/client/sync-statuses
router.post('/sync-statuses', syncClientStatuses);

// GET /api/client/
router.get('/', getAllClients);

// GET /api/client/:clientId
router.get('/:clientId', getClientById);

// DELETE /api/client/:clientId
router.delete('/:clientId', deleteClient);

export default router; 