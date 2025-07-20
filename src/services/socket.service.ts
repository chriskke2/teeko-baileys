import { Server } from 'socket.io';
import http from 'http';
import ClientData from '../models/client.model';

class SocketService {
  private static instance: SocketService;
  private io: Server | null = null;
  private debugMode: boolean = true;

  private constructor() {}

  public static getInstance(): SocketService {
    if (!SocketService.instance) {
      SocketService.instance = new SocketService();
    }
    return SocketService.instance;
  }

  public initialize(server: http.Server): void {
    this.io = new Server(server, {
      cors: {
        origin: '*',
        methods: ['GET', 'POST'],
      },
    });

    this.io.on('connection', (socket) => {
      console.log('A user connected', socket.id);

      socket.on('subscribe', async ({ clientId }) => {
        if (!clientId) {
          console.error(`Socket ${socket.id} attempted to subscribe with invalid clientId.`);
          socket.emit('subscription_error', { message: 'Invalid clientId provided.' });
          return;
        }

        const clientExists = await ClientData.findOne({ clientId }).lean();
        if (!clientExists) {
            console.error(`Subscription failed: ClientId '${clientId}' not found.`);
            socket.emit('subscription_error', { message: `Client not found.` });
            return;
        }
        
        socket.join(clientId);
        console.log(`Socket ${socket.id} subscribed to room: ${clientId}`);
        
        socket.emit('subscribed', { room: clientId });
      });

      socket.on('disconnect', () => {
        console.log('A user disconnected', socket.id);
      });
    });

    console.log('Socket.IO service initialized.');
  }

  public getIO(): Server {
    if (!this.io) {
      throw new Error('Socket.IO not initialized!');
    }
    return this.io;
  }
}

export default SocketService.getInstance(); 