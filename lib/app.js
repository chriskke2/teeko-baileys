"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.app = void 0;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const client_routes_1 = __importDefault(require("./api/routes/client.routes"));
const app = (0, express_1.default)();
exports.app = app;
// Middlewares
app.use(express_1.default.json());
app.use((0, cors_1.default)());
// Health check route
app.get('/', (req, res) => {
    res.send('<h1>Baileys-Backend is running</h1>');
});
// API routes
app.use('/api/client', client_routes_1.default);
