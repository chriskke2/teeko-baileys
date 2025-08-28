"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const http_1 = __importDefault(require("http"));
const app_1 = require("./app");
const database_1 = __importDefault(require("./config/database"));
const socket_service_1 = __importDefault(require("./services/socket.service"));
const client_service_1 = __importDefault(require("./services/client.service"));
const client_model_1 = __importDefault(require("./models/client.model"));
const PORT = process.env.PORT || 3000;
const server = http_1.default.createServer(app_1.app);
const startServer = async () => {
    await (0, database_1.default)();
    // Set all clients to DISCONNECTED on server restart
    try {
        const result = await client_model_1.default.updateMany({}, { $set: { status: 'DISCONNECTED' } });
        if (result.modifiedCount > 0) {
            console.log(`Reset ${result.modifiedCount} client(s) to DISCONNECTED`);
        }
    }
    catch (error) {
        console.error('Failed to update client statuses:', error);
    }
    socket_service_1.default.initialize(server);
    // Start health checks for client connections (sync messages disabled)
    client_service_1.default.startHealthChecks(5); // Check every 5 minutes
    server.listen(PORT, () => {
        console.log(`Server listening on port: ${PORT}`);
    });
    // Graceful shutdown handling
    process.on('SIGTERM', async () => {
        console.log('SIGTERM received, shutting down gracefully...');
        await client_service_1.default.shutdown();
        server.close(() => {
            console.log('Server closed');
            process.exit(0);
        });
    });
    process.on('SIGINT', async () => {
        console.log('SIGINT received, shutting down gracefully...');
        await client_service_1.default.shutdown();
        server.close(() => {
            console.log('Server closed');
            process.exit(0);
        });
    });
};
startServer();
