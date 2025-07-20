"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const client_controller_1 = require("../controllers/client.controller");
const auth_middleware_1 = __importDefault(require("../middlewares/auth.middleware"));
const router = express_1.default.Router();
// Apply the authentication middleware to all routes in this file
router.use(auth_middleware_1.default);
// POST /api/client/create
router.post('/create', client_controller_1.createClient);
// POST /api/client/connect
router.post('/connect', client_controller_1.connectClient);
// POST /api/client/disconnect
router.post('/disconnect', client_controller_1.disconnectClient);
// POST /api/client/logout
router.post('/logout', client_controller_1.logoutClient);
// GET /api/client/
router.get('/', client_controller_1.getAllClients);
// GET /api/client/:clientId
router.get('/:clientId', client_controller_1.getClientById);
// DELETE /api/client/:clientId
router.delete('/:clientId', client_controller_1.deleteClient);
exports.default = router;
