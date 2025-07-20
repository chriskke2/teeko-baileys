"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const socket_io_1 = require("socket.io");
const client_model_1 = __importDefault(require("../models/client.model"));
class SocketService {
    constructor() {
        this.io = null;
        this.debugMode = true;
    }
    static getInstance() {
        if (!SocketService.instance) {
            SocketService.instance = new SocketService();
        }
        return SocketService.instance;
    }
    initialize(server) {
        this.io = new socket_io_1.Server(server, {
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
                const clientExists = await client_model_1.default.findOne({ clientId }).lean();
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
    getIO() {
        if (!this.io) {
            throw new Error('Socket.IO not initialized!');
        }
        return this.io;
    }
}
exports.default = SocketService.getInstance();
