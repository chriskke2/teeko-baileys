import 'dotenv/config'
import http from 'http';
import { app } from './app';
import connectDB from './config/database';
import socketService from './services/socket.service';
import ClientData from './models/client.model';

const PORT = process.env.PORT || 3000;

const server = http.createServer(app);

const startServer = async () => {
  await connectDB();

  // Set all clients to DISCONNECTED on server restart
  try {
    await ClientData.updateMany({}, { $set: { status: 'DISCONNECTED' } });
    console.log('All clients have been set to DISCONNECTED.');
  } catch (error) {
    console.error('Failed to update client statuses:', error);
  }
  
  socketService.initialize(server);
  
  server.listen(PORT, () => {
    console.log(`Server listening on port: ${PORT}`);
  });
}

startServer(); 