import express from 'express';
import { addPackage, getAllPackages, getPackageById, deletePackage, updatePackage } from '../controllers/package.controller';
import authMiddleware from '../middlewares/auth.middleware';

const router = express.Router();

// Apply the authentication middleware to all routes in this file
router.use(authMiddleware);

// POST /api/packages/add
router.post('/add', addPackage);

// GET /api/packages/
router.get('/', getAllPackages);

// GET /api/packages/:packageId
router.get('/:packageId', getPackageById);

// DELETE /api/packages/:packageId
router.delete('/:packageId', deletePackage);

// PUT /api/packages/:packageId
router.put('/:packageId', updatePackage);

export default router; 