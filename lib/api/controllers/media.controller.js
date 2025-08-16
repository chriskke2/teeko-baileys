"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.downloadWhatsAppAudio = void 0;
const http_status_codes_1 = require("http-status-codes");
const media_service_1 = __importDefault(require("../../services/media.service"));
const handleError = (res, error, defaultMessage) => {
    console.error('Media Controller Error:', error);
    const statusCode = error.response?.status || http_status_codes_1.StatusCodes.INTERNAL_SERVER_ERROR;
    const message = error.message || defaultMessage;
    res.status(statusCode).json({
        success: false,
        error: message,
    });
};
/**
 * Download and decrypt WhatsApp audio using simplified audio message data
 * POST /api/media/download-audio
 */
const downloadWhatsAppAudio = async (req, res) => {
    try {
        const { url, mediaKey, fileEncSha256 } = req.body;
        // Validate required fields using media service
        const validation = media_service_1.default.validateAudioFields(url, mediaKey, fileEncSha256);
        if (!validation.isValid) {
            return res.status(http_status_codes_1.StatusCodes.BAD_REQUEST).json({
                success: false,
                error: validation.error,
                debug: validation.debug
            });
        }
        // Use media service to download and decrypt audio
        const mediaBuffer = await media_service_1.default.downloadAndDecryptAudio(url, mediaKey, fileEncSha256);
        // Set appropriate headers for OGG file download
        res.set({
            'Content-Type': 'audio/ogg',
            'Content-Length': mediaBuffer.length.toString(),
            'Content-Disposition': 'attachment; filename="whatsapp-audio.ogg"',
            'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization'
        });
        // Send the decrypted OGG data
        res.send(mediaBuffer);
    }
    catch (error) {
        // Handle specific service errors
        if (error instanceof Error) {
            if (error.message.includes('No WhatsApp clients are currently connected')) {
                return res.status(http_status_codes_1.StatusCodes.SERVICE_UNAVAILABLE).json({
                    success: false,
                    error: error.message
                });
            }
            if (error.message.includes('Failed to load client service') || error.message.includes('Failed to load Baileys library')) {
                return res.status(http_status_codes_1.StatusCodes.INTERNAL_SERVER_ERROR).json({
                    success: false,
                    error: error.message
                });
            }
            if (error.message.includes('Failed to download audio from WhatsApp')) {
                return res.status(http_status_codes_1.StatusCodes.BAD_REQUEST).json({
                    success: false,
                    error: error.message
                });
            }
        }
        handleError(res, error, 'Failed to download and decrypt WhatsApp audio.');
    }
};
exports.downloadWhatsAppAudio = downloadWhatsAppAudio;
