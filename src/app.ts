import express from 'express';
import cors from 'cors';
import clientRoutes from './api/routes/client.routes';
import userRoutes from './api/routes/user.routes';
import packageRoutes from './api/routes/package.routes';
import kbRoutes from './api/routes/kb.routes';
import messageRoutes from './api/routes/message.routes';
import mediaRoutes from './api/routes/media.routes';
import webhookRoutes from './api/routes/webhook.routes';

const app = express();

// Middlewares
app.use(express.json());
app.use(cors());

// Health check route
app.get('/', (req, res) => {
  res.send('<h1>Baileys-Backend is running</h1>');
});

// API routes
app.use('/api/client', clientRoutes);
app.use('/api/users', userRoutes);
app.use('/api/packages', packageRoutes);
app.use('/api/kb', kbRoutes);
app.use('/api/message', messageRoutes);
app.use('/api/media', mediaRoutes);
app.use('/api/webhook', webhookRoutes);

export { app }; 