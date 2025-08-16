"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const config_1 = __importDefault(require("../config"));
const axios_1 = __importDefault(require("axios"));
const user_model_1 = __importDefault(require("../models/user.model"));
const messaging_service_1 = __importDefault(require("./messaging.service"));
/**
 * TranslationService handles translation client type messages
 * Validates user status and forwards messages to translation webhook
 */
class TranslationService {
    constructor() {
        console.log(`Translation Webhook URL: ${config_1.default.translate_webhook_url ? 'Configured' : 'Not configured'}`);
    }
    static getInstance() {
        if (!TranslationService.instance) {
            TranslationService.instance = new TranslationService();
        }
        return TranslationService.instance;
    }
    /**
     * Process incoming message for translation client type
     * @param message The message object from Baileys
     * @param clientId The WhatsApp client ID
     */
    async processTranslationMessage(message, clientId) {
        try {
            // Extract the WhatsApp number from remoteJid
            const remoteJid = message.key?.remoteJid;
            if (!remoteJid || (!remoteJid.includes('@s.whatsapp.net') && !remoteJid.includes('@lid'))) {
                console.log(`[DEBUG] Translation - Skipping message - not a private message. RemoteJid: ${remoteJid}`);
                return; // Not a private message
            }
            // Skip messages sent by this client (fromMe: true)
            if (message.key?.fromMe) {
                return;
            }
            // Extract message content and determine type
            const messageText = message.message?.conversation ||
                message.message?.extendedTextMessage?.text ||
                '';
            const audioMessage = message.message?.audioMessage;
            const messageType = audioMessage ? 'audio' : 'text';
            // Skip if neither text nor audio message
            if (!messageText.trim() && !audioMessage) {
                console.log(`[DEBUG] Translation - Skipping message - no text or audio content from ${remoteJid}`);
                return;
            }
            // Extract WhatsApp number
            const waNumber = parseInt(remoteJid.split('@')[0]);
            if (isNaN(waNumber)) {
                console.log(`[DEBUG] Translation - Invalid phone number format: ${remoteJid}`);
                return;
            }
            console.log(`[Translation] Processing ${messageType} message from ${waNumber}: ${messageType === 'text' ? `"${messageText}"` : 'audio message'}`);
            // Check if user exists and is active
            const user = await user_model_1.default.findOne({ wa_num: waNumber });
            if (!user) {
                console.log(`[Translation] User ${waNumber} not found`);
                await messaging_service_1.default.sendRawTextMessage(clientId, remoteJid, "Please completing your onboarding process in order to enjoy Teeko's translation services.");
                return;
            }
            if (user.status !== 'ACTIVE') {
                console.log(`[Translation] User ${waNumber} is not active (status: ${user.status})`);
                await messaging_service_1.default.sendRawTextMessage(clientId, remoteJid, "Please completing your onboarding process in order to enjoy Teeko's translation services.");
                return;
            }
            console.log(`[Translation] User ${waNumber} is active, forwarding ${messageType} message to translation webhook`);
            // Forward to translation webhook
            await this.forwardToTranslationWebhook(messageText, messageType, audioMessage, waNumber, user, clientId, remoteJid);
        }
        catch (error) {
            console.error('Error processing translation message:', error);
        }
    }
    /**
     * Forward message to translation webhook and handle response
     * @param messageText The message text
     * @param messageType The message type ('text' or 'audio')
     * @param audioMessage The audio message object (if applicable)
     * @param phoneNumber The user's phone number
     * @param user The user object
     * @param clientId The WhatsApp client ID
     * @param recipient The recipient JID
     */
    async forwardToTranslationWebhook(messageText, messageType, audioMessage, phoneNumber, user, clientId, recipient) {
        try {
            if (!config_1.default.translate_webhook_url) {
                console.warn('Translation webhook URL not configured. Sending error message.');
                await messaging_service_1.default.sendRawTextMessage(clientId, recipient, "Translation service is currently unavailable. Please try again later.");
                return;
            }
            // Prepare webhook payload
            const webhookPayload = {
                type: messageType,
                phoneNumber,
                userId: user._id.toString(),
                context: user.context || '',
                segmentation: user.segmentation || {},
                first_name: user.first_name || '',
                clientId,
                timestamp: new Date().toISOString()
            };
            // Add message content based on type
            if (messageType === 'text') {
                webhookPayload.message = messageText;
            }
            else if (messageType === 'audio' && audioMessage) {
                webhookPayload.audioMessage = audioMessage;
                // Also include text if available (for transcription purposes)
                if (messageText.trim()) {
                    webhookPayload.message = messageText;
                }
            }
            console.log(`[Translation] Sending webhook for ${messageType} message from ${phoneNumber}`);
            // Define fallback function to send after 10 seconds
            const fallbackFunction = async () => {
                console.warn(`[Translation] Webhook response taking too long for user ${phoneNumber}. Sending interim message.`);
                await messaging_service_1.default.sendRawTextMessage(clientId, recipient, "We're processing your translation request. Please wait a moment...");
            };
            // Define response handler function
            const responseHandler = async (response) => {
                if (response && response.message) {
                    // Send the response message from the webhook
                    console.log(`[Translation] Received webhook response for user ${phoneNumber}. Sending message: ${response.message.substring(0, 50)}...`);
                    await messaging_service_1.default.sendRawTextMessage(clientId, recipient, response.message);
                }
                else {
                    console.warn(`[Translation] No valid message in webhook response for user ${phoneNumber}`);
                    await messaging_service_1.default.sendRawTextMessage(clientId, recipient, "Sorry, I couldn't process your translation request. Please try again.");
                }
            };
            // Send the webhook request with fallback and response handlers
            const webhookSent = await this.sendTranslationWebhook(webhookPayload, fallbackFunction, responseHandler);
            if (!webhookSent) {
                console.warn(`[Translation] Webhook failed for user ${phoneNumber}. Sending fallback message.`);
                // Send a simple acknowledgment if webhook fails completely
                await messaging_service_1.default.sendRawTextMessage(clientId, recipient, "We're having trouble connecting to our translation services. Please try again later.");
            }
        }
        catch (error) {
            console.error('Error forwarding to translation webhook:', error);
            // Send a simple error message
            await messaging_service_1.default.sendRawTextMessage(clientId, recipient, "Sorry, we encountered an error processing your translation request. Please try again later.");
        }
    }
    /**
     * Send a webhook request to the translation service
     * @param payload The payload to send
     * @param onFallback Callback function to execute if 10 seconds pass without a response
     * @param onResponse Callback function to execute when response is received
     */
    async sendTranslationWebhook(payload, onFallback, onResponse) {
        try {
            if (!config_1.default.translate_webhook_url) {
                console.warn('Translation webhook URL not configured. Skipping webhook request.');
                if (onFallback)
                    await onFallback();
                return false;
            }
            console.log(`[Translation] Sending webhook for message from ${payload.phoneNumber}`);
            // Set up fallback timer (10 seconds)
            let fallbackExecuted = false;
            const fallbackTimer = setTimeout(async () => {
                fallbackExecuted = true;
                console.log(`[Translation] Webhook response taking too long (>10s) for ${payload.phoneNumber}. Sending fallback message.`);
                if (onFallback)
                    await onFallback();
            }, 10000);
            // Send the webhook request with 30-second timeout
            const response = await axios_1.default.post(config_1.default.translate_webhook_url, payload, {
                headers: {
                    'Content-Type': 'application/json'
                },
                timeout: 30000 // 30 second timeout
            });
            // Clear the fallback timer
            clearTimeout(fallbackTimer);
            console.log(`[Translation] Webhook sent successfully. Status: ${response.status}`);
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
                    console.error('Error processing translation webhook response:', error);
                }
            }
            return response.status >= 200 && response.status < 300;
        }
        catch (error) {
            console.error('Error sending translation webhook:', error);
            // Execute fallback if it hasn't been executed yet
            if (onFallback)
                await onFallback();
            return false;
        }
    }
    /**
     * Extract message from webhook response
     * @param responseData The response data from webhook
     * @returns The extracted message or undefined
     */
    extractMessageFromResponse(responseData) {
        // Try different possible response formats
        if (typeof responseData === 'string') {
            return responseData;
        }
        if (responseData && typeof responseData === 'object') {
            // Try common response field names
            return responseData.message ||
                responseData.text ||
                responseData.response ||
                responseData.output ||
                responseData.result ||
                undefined;
        }
        return undefined;
    }
}
exports.default = TranslationService.getInstance();
