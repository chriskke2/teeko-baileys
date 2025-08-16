"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.app = void 0;
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const client_routes_1 = __importDefault(require("./api/routes/client.routes"));
const user_routes_1 = __importDefault(require("./api/routes/user.routes"));
const package_routes_1 = __importDefault(require("./api/routes/package.routes"));
const kb_routes_1 = __importDefault(require("./api/routes/kb.routes"));
const message_routes_1 = __importDefault(require("./api/routes/message.routes"));
const media_routes_1 = __importDefault(require("./api/routes/media.routes"));
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
app.use('/api/users', user_routes_1.default);
app.use('/api/packages', package_routes_1.default);
app.use('/api/kb', kb_routes_1.default);
app.use('/api/message', message_routes_1.default);
app.use('/api/media', media_routes_1.default);
