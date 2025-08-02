"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const kb_controller_1 = require("../controllers/kb.controller");
const auth_middleware_1 = __importDefault(require("../middlewares/auth.middleware"));
const router = express_1.default.Router();
// Apply the authentication middleware to all routes in this file
router.use(auth_middleware_1.default);
// POST /api/kb/upload
router.post('/upload', kb_controller_1.uploadDocument);
exports.default = router;
