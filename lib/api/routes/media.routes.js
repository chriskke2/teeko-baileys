"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const media_controller_1 = require("../controllers/media.controller");
const auth_middleware_1 = __importDefault(require("../middlewares/auth.middleware"));
const router = express_1.default.Router();
// Apply the authentication middleware to all routes in this file
router.use(auth_middleware_1.default);
// POST /api/media/download-audio - Download and decrypt WhatsApp audio with minimal payload
router.post('/download-audio', media_controller_1.downloadWhatsAppAudio);
// POST /api/media/download-image - Download and decrypt WhatsApp image with minimal payload
router.post('/download-image', media_controller_1.downloadWhatsAppImage);
exports.default = router;
