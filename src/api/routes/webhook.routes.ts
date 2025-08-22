import express from 'express';
import { receiveTaxiData } from '../controllers/webhook.controller';

const router = express.Router();

// POST /api/webhook/taxi-data
router.post('/taxi-data', receiveTaxiData);

export default router;
