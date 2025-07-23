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
            // Process the response if it hasn't been handled by the fallback
            if (!fallbackExecuted && onResponse && response.data) {
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
}
exports.default = WebhookService.getInstance();
