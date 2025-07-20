import express from 'express';
import cors from 'cors';
import clientRoutes from './api/routes/client.routes';

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

export { app }; 