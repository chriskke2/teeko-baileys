"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const config_1 = __importDefault(require("../config"));
const axios_1 = __importDefault(require("axios"));
/**
 * WebhookService handles sending webhook requests to external services
 */
class WebhookService {
    constructor() {
        console.log(`Webhook URL: ${config_1.default.webhook_url ? 'Configured' : 'Not configured'}`);
    }
    static getInstance() {
        if (!WebhookService.instance) {
            WebhookService.instance = new WebhookService();
        }
        return WebhookService.instance;
    }
    /**
     * Extract message from webhook response
     * @param responseData The response data from webhook
     * @returns The extracted message or undefined
     */
    extractMessageFromResponse(responseData) {
        console.log('Processing webhook response:', JSON.stringify(responseData).substring(0, 200) + '...');
        try {
            // Handle array response format with output field
            if (Array.isArray(responseData) && responseData.length > 0) {
                if (responseData[0].output) {
                    return responseData[0].output;
                }
            }
            // Handle direct message field
            if (responseData.message) {
                return responseData.message;
            }
            // Handle direct output field
            if (responseData.output) {
                return responseData.output;
            }
            return undefined;
        }
        catch (error) {
            console.error('Error extracting message from response:', error);
            return undefined;
        }
    }
    /**
     * Send a webhook request with user message data and handle the response
     * @param payload The payload to send
     * @param onFallback Callback function to execute if 10 seconds pass without a response
     * @param onResponse Callback function to execute when response is received
     */
    async sendMessageWebhook(payload, onFallback, onResponse) {
        try {
            if (!config_1.default.webhook_url) {
                console.warn('Webhook URL not configured. Skipping webhook request.');
                if (onFallback)
                    await onFallback();
                return false;
            }
            console.log(`Sending webhook for message from ${payload.phoneNumber}`);
            // Add timestamp to payload
            const webhookPayload = {
                ...payload,
                timestamp: new Date().toISOString()
            };
            // Set up fallback timer (10 seconds)
            let fallbackExecuted = false;
            const fallbackTimer = setTimeout(async () => {
                fallbackExecuted = true;
                console.log(`Webhook response taking too long (>10s) for ${payload.phoneNumber}. Sending fallback message.`);
                if (onFallback)
                    await onFallback();
            }, 10000);
            // Send the webhook request with 30-second timeout
            const response = await axios_1.default.post(config_1.default.webhook_url, webhookPayload, {
                headers: {
                    'Content-Type': 'application/json'
                },
                timeout: 30000 // 30 second timeout
            });
            // Clear the fallback timer
            clearTimeout(fallbackTimer);
            console.log(`Webhook sent successfully. Status: ${response.status}`);
            // Process the response regardless of fallback execution
            if (onResponse && response.data) {
                try {
                    const message = this.extractMessageFromResponse(response.data);
                    const webhookResponse = {
                        message,
                        status: message ? 'success' : 'error'
                    };
                    await onResponse(webhookResponse);
                }
                catch (error) {
                    console.error('Error processing webhook response:', error);
                }
            }
            return response.status >= 200 && response.status < 300;
        }
        catch (error) {
            console.error('Error sending webhook:', error);
            // Execute fallback if it hasn't been executed yet
            if (onFallback)
                await onFallback();
            return false;
        }
    }
    /**
     * Send message webhook for both chatbot and translate client types
     * @param message The Baileys message object
     * @param clientId The WhatsApp client ID
     * @param clientType The client type ('chatbot' or 'translate')
     * @param user The user object (optional, for translate clients)
     * @returns Promise<boolean> Success status
     */
    async sendMessageWebhookUnified(message, clientId, clientType, user) {
        try {
            // Determine webhook URL based on client type
            const webhookUrl = clientType === 'translate' ? config_1.default.translate_webhook_url : config_1.default.webhook_url;
            if (!webhookUrl) {
                console.warn(`${clientType === 'translate' ? 'Translation' : 'Chatbot'} webhook URL not configured. Skipping webhook request.`);
                return false;
            }
            // Extract message content
            const messageText = message.message?.conversation ||
                message.message?.extendedTextMessage?.text ||
                '';
            const audioMessage = message.message?.audioMessage;
            const imageMessage = message.message?.imageMessage;
            // Determine message type
            let messageType = 'text';
            if (audioMessage) {
                messageType = 'audio';
            }
            else if (imageMessage) {
                messageType = 'image';
            }
            // Skip if no content (text, audio, or image)
            if (!messageText.trim() && !audioMessage && !imageMessage) {
                console.log(`[WEBHOOK] Skipping message - no text, audio, or image content from ${message.key?.remoteJid}`);
                return false;
            }
            // Extract phone number from remoteJid
            const remoteJid = message.key?.remoteJid;
            const phoneNumber = remoteJid ? parseInt(remoteJid.split('@')[0]) : null;
            if (!phoneNumber || isNaN(phoneNumber)) {
                console.log(`[WEBHOOK] Invalid phone number format: ${remoteJid}`);
                return false;
            }
            console.log(`[WEBHOOK] Sending ${clientType} webhook for ${messageType} message from ${phoneNumber}`);
            // Create base webhook payload
            const webhookPayload = {
                type: messageType,
                phoneNumber,
                clientId,
                timestamp: new Date().toISOString()
            };
            // Add user data for translate clients
            if (clientType === 'translate' && user) {
                webhookPayload.userId = user._id.toString();
                webhookPayload.context = user.context || '';
                webhookPayload.segmentation = user.segmentation || {};
                webhookPayload.first_name = user.first_name || '';
            }
            // Add message content based on type
            if (messageType === 'text') {
                webhookPayload.message = messageText;
            }
            else if (messageType === 'audio' && audioMessage) {
                webhookPayload.audioMessage = {
                    url: audioMessage.url,
                    mediaKey: audioMessage.mediaKey,
                    fileEncSha256: audioMessage.fileEncSha256,
                    mimetype: audioMessage.mimetype || 'audio/ogg; codecs=opus',
                    seconds: audioMessage.seconds,
                    ptt: audioMessage.ptt
                };
                // Also include text if available (for transcription purposes)
                if (messageText.trim()) {
                    webhookPayload.message = messageText;
                }
            }
            else if (messageType === 'image' && imageMessage) {
                webhookPayload.imageMessage = {
                    url: imageMessage.url,
                    mediaKey: imageMessage.mediaKey,
                    fileEncSha256: imageMessage.fileEncSha256,
                    mimetype: imageMessage.mimetype || 'image/jpeg',
                    caption: imageMessage.caption || '',
                    width: imageMessage.width,
                    height: imageMessage.height
                };
                // Also include caption as message if available
                if (imageMessage.caption && imageMessage.caption.trim()) {
                    webhookPayload.message = imageMessage.caption;
                }
            }
            // For translate clients, handle response with fallback timer
            if (clientType === 'translate') {
                return await this.sendTranslateWebhookWithResponse(webhookUrl, webhookPayload, clientId, message.key?.remoteJid || '', phoneNumber);
            }
            else {
                // For chatbot clients, just send without waiting for response
                const response = await axios_1.default.post(webhookUrl, webhookPayload, {
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    timeout: 30000 // 30 second timeout
                });
                console.log(`[WEBHOOK] ${clientType} webhook sent successfully. Status: ${response.status}`);
                return response.status >= 200 && response.status < 300;
            }
        }
        catch (error) {
            console.error(`[WEBHOOK] Error sending ${clientType} webhook:`, error);
            return false;
        }
    }
    /**
     * Send translate webhook with response handling and fallback timer
     * @param webhookUrl The webhook URL
     * @param payload The webhook payload
     * @param clientId The WhatsApp client ID
     * @param remoteJid The remote JID
     * @param phoneNumber The phone number
     * @returns Promise<boolean> Success status
     */
    async sendTranslateWebhookWithResponse(webhookUrl, payload, clientId, remoteJid, phoneNumber) {
        try {
            console.log(`[WEBHOOK] Sending translate webhook for ${payload.type} message from ${phoneNumber}`);
            // Set up fallback timer (10 seconds)
            let fallbackExecuted = false;
            const fallbackTimer = setTimeout(async () => {
                fallbackExecuted = true;
                console.log(`[WEBHOOK] Webhook response taking too long (>10s) for ${phoneNumber}. Sending fallback message.`);
                await this.sendFallbackMessage(clientId, remoteJid);
            }, 10000);
            // Send the webhook request with 30-second timeout
            const response = await axios_1.default.post(webhookUrl, payload, {
                headers: {
                    'Content-Type': 'application/json'
                },
                timeout: 30000 // 30 second timeout
            });
            // Clear the fallback timer
            clearTimeout(fallbackTimer);
            console.log(`[WEBHOOK] translate webhook sent successfully. Status: ${response.status}`);
            // Process the response if we haven't executed fallback
            if (!fallbackExecuted && response.data) {
                try {
                    const message = this.extractMessageFromResponse(response.data);
                    if (message) {
                        console.log(`[WEBHOOK] Received webhook response for user ${phoneNumber}. Sending message: ${message.substring(0, 50)}...`);
                        await this.sendResponseMessage(clientId, remoteJid, message);
                    }
                    else {
                        console.warn(`[WEBHOOK] No valid message in webhook response for user ${phoneNumber}`);
                        await this.sendErrorMessage(clientId, remoteJid);
                    }
                }
                catch (error) {
                    console.error('Error processing translation webhook response:', error);
                    await this.sendErrorMessage(clientId, remoteJid);
                }
            }
            return response.status >= 200 && response.status < 300;
        }
        catch (error) {
            console.error('Error sending translation webhook:', error);
            // Send fallback message if webhook fails
            await this.sendFallbackMessage(clientId, remoteJid);
            return false;
        }
    }
    /**
     * Send fallback message when webhook takes too long
     * @param clientId The WhatsApp client ID
     * @param remoteJid The remote JID
     */
    async sendFallbackMessage(clientId, remoteJid) {
        try {
            const messagingService = require('./messaging.service').default;
            await messagingService.sendRawTextMessage(clientId, remoteJid, "We're processing your request. Please wait a moment...");
        }
        catch (error) {
            console.error('Error sending fallback message:', error);
        }
    }
    /**
     * Send response message from webhook
     * @param clientId The WhatsApp client ID
     * @param remoteJid The remote JID
     * @param message The message to send
     */
    async sendResponseMessage(clientId, remoteJid, message) {
        try {
            const messagingService = require('./messaging.service').default;
            await messagingService.sendRawTextMessage(clientId, remoteJid, message);
        }
        catch (error) {
            console.error('Error sending response message:', error);
        }
    }
    /**
     * Send error message when webhook response is invalid
     * @param clientId The WhatsApp client ID
     * @param remoteJid The remote JID
     */
    async sendErrorMessage(clientId, remoteJid) {
        try {
            const messagingService = require('./messaging.service').default;
            await messagingService.sendRawTextMessage(clientId, remoteJid, "Sorry, I couldn't process your request. Please try again.");
        }
        catch (error) {
            console.error('Error sending error message:', error);
        }
    }
}
exports.default = WebhookService.getInstance();
