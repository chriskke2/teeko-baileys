"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const client_service_1 = __importDefault(require("./client.service"));
const messaging_service_1 = __importDefault(require("./messaging.service"));
class MessageService {
    static getInstance() {
        if (!MessageService.instance) {
            MessageService.instance = new MessageService();
        }
        return MessageService.instance;
    }
    /**
     * Send a text message to a specific chat ID
     * @param request The message request containing clientId, chatId, and message
     * @returns Promise<SendMessageResponse>
     */
    async sendTextMessage(request) {
        try {
            const { clientId, chatId, message } = request;
            // Validate required fields
            if (!clientId || !chatId || !message) {
                return {
                    success: false,
                    error: 'clientId, chatId, and message are required.'
                };
            }
            // Validate message is not empty
            if (typeof message !== 'string' || message.trim().length === 0) {
                return {
                    success: false,
                    error: 'Message must be a non-empty string.'
                };
            }
            // Check if WhatsApp client exists and is connected
            const client = client_service_1.default.getClient(clientId);
            if (!client) {
                return {
                    success: false,
                    error: 'WhatsApp client is not connected.'
                };
            }
            // Format recipient JID if needed
            let jid = chatId.toString();
            if (!jid.includes('@')) {
                jid = `${jid}@s.whatsapp.net`;
            }
            // Send the message using the messaging service
            const success = await messaging_service_1.default.sendRawTextMessage(clientId, jid, message.trim());
            if (success) {
                return {
                    success: true,
                    data: {
                        clientId,
                        chatId: jid,
                        message: message.trim()
                    }
                };
            }
            else {
                return {
                    success: false,
                    error: 'Failed to send message through messaging service.'
                };
            }
        }
        catch (error) {
            console.error('MessageService: Failed to send message:', error);
            return {
                success: false,
                error: 'Internal server error while sending message.'
            };
        }
    }
    /**
     * Validate if a client is connected and ready to send messages
     * @param clientId The client ID to validate
     * @returns Promise<boolean>
     */
    async validateClient(clientId) {
        try {
            const client = client_service_1.default.getClient(clientId);
            return client !== undefined && client !== null;
        }
        catch (error) {
            console.error('MessageService: Failed to validate client:', error);
            return false;
        }
    }
    /**
     * Format a phone number or chat ID to proper WhatsApp JID format
     * @param chatId The chat ID or phone number
     * @returns Formatted JID string
     */
    formatChatId(chatId) {
        if (!chatId.includes('@')) {
            return `${chatId}@s.whatsapp.net`;
        }
        return chatId;
    }
}
exports.default = MessageService.getInstance();
