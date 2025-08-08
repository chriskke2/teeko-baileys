"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendMessage = void 0;
const http_status_codes_1 = require("http-status-codes");
const message_service_1 = __importDefault(require("../../services/message.service"));
/**
 * Send a text message to a specific chat ID
 * POST /api/message/send
 */
const sendMessage = async (req, res) => {
    try {
        const { clientId, chatId, message } = req.body;
        // Use the message service to handle the business logic
        const result = await message_service_1.default.sendTextMessage({
            clientId,
            chatId,
            message
        });
        if (result.success) {
            return res.status(http_status_codes_1.StatusCodes.OK).json({
                success: true,
                message: 'Message sent successfully.',
                data: result.data
            });
        }
        else {
            // Determine appropriate status code based on error type
            let statusCode = http_status_codes_1.StatusCodes.INTERNAL_SERVER_ERROR;
            if (result.error?.includes('required') || result.error?.includes('non-empty string')) {
                statusCode = http_status_codes_1.StatusCodes.BAD_REQUEST;
            }
            else if (result.error?.includes('not connected')) {
                statusCode = http_status_codes_1.StatusCodes.SERVICE_UNAVAILABLE;
            }
            return res.status(statusCode).json({
                success: false,
                error: result.error
            });
        }
    }
    catch (error) {
        console.error('MessageController: Failed to send message:', error);
        return res.status(http_status_codes_1.StatusCodes.INTERNAL_SERVER_ERROR).json({
            success: false,
            error: 'Failed to send message.'
        });
    }
};
exports.sendMessage = sendMessage;
