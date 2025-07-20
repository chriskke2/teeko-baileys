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
const client_model_1 = __importDefault(require("./models/client.model"));
const PORT = process.env.PORT || 3000;
const server = http_1.default.createServer(app_1.app);
const startServer = async () => {
    await (0, database_1.default)();
    // Set all clients to DISCONNECTED on server restart
    try {
        await client_model_1.default.updateMany({}, { $set: { status: 'DISCONNECTED' } });
        console.log('All clients have been set to DISCONNECTED.');
    }
    catch (error) {
        console.error('Failed to update client statuses:', error);
    }
    socket_service_1.default.initialize(server);
    server.listen(PORT, () => {
        console.log(`Server listening on port: ${PORT}`);
    });
};
startServer();
