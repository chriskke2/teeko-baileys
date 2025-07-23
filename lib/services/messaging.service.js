"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const predefined_service_1 = __importDefault(require("./predefined.service"));
// Forward declaration to avoid circular dependency
let clientService;
setTimeout(() => {
    clientService = require('./client.service').default;
}, 0);
/**
 * Base messaging service that provides common messaging functionality
 * This class is meant to be extended by other services that need messaging capabilities
 */
class MessagingService {
    constructor() { }
    static getInstance() {
        if (!MessagingService.instance) {
            MessagingService.instance = new MessagingService();
        }
        return MessagingService.instance;
    }
    /**
     * Extract text from a WhatsApp message object
     * @param message The message object from Baileys
     */
    extractMessageText(message) {
        let messageText = '';
        // Handle different message types
        if (message.message?.conversation) {
            messageText = message.message.conversation.trim();
        }
        else if (message.message?.extendedTextMessage?.text) {
            messageText = message.message.extendedTextMessage.text.trim();
        }
        return messageText;
    }
    /**
     * Send a predefined message with options
     * @param field The message field
     * @param type The message type
     * @param clientId WhatsApp client ID
     * @param recipient Recipient JID
     */
    async sendOptionsMessage(field, type, clientId, recipient) {
        try {
            const whatsappClient = clientService.getClient(clientId);
            if (!whatsappClient) {
                console.error(`No active WhatsApp client found with ID ${clientId}`);
                return false;
            }
            // Get message from predefined messages
            const messageData = await predefined_service_1.default.getMessage(type, field);
            if (!messageData) {
                console.error(`Message template not found: ${type}/${field}`);
                return false;
            }
            // Get options if available
            const displayOptions = await predefined_service_1.default.getDisplayOptions(type, field);
            // Log for debugging
            console.log(`Sending ${type}/${field} with options:`, displayOptions);
            if (displayOptions && displayOptions.length > 0) {
                // Create formatted message with options
                const formattedOptions = displayOptions.map((option, index) => `${index + 1}. ${option}`).join('\n');
                const messageWithOptions = `${messageData.message}\n\n${formattedOptions}`;
                let interactiveSuccess = false;
                // First try interactive list approach
                if (this.shouldTryInteractiveMessage(recipient)) {
                    try {
                        console.log(`Attempting to send interactive list for ${recipient}`);
                        const sections = [
                            {
                                title: `Select your ${field}`,
                                rows: displayOptions.map((option, index) => ({
                                    id: `${field}-option-${index + 1}`,
                                    title: option,
                                    description: ""
                                }))
                            }
                        ];
                        // Try sending as interactive list
                        await whatsappClient.sendMessage(recipient, {
                            text: messageData.message,
                            footer: "Please select one option",
                            buttonText: "Select Option",
                            sections
                        });
                        interactiveSuccess = true;
                        console.log(`Interactive list sent successfully to ${recipient}`);
                    }
                    catch (error) {
                        console.error(`Failed to send interactive list:`, error);
                        interactiveSuccess = false;
                    }
                }
                // Only send text options if interactive message failed or wasn't attempted
                if (!interactiveSuccess) {
                    console.log(`Sending text options to ${recipient}`);
                    await whatsappClient.sendMessage(recipient, {
                        text: messageWithOptions
                    });
                    console.log(`Text options sent to ${recipient}`);
                }
            }
            else {
                // If no options, send as simple text message
                await whatsappClient.sendMessage(recipient, {
                    text: messageData.message
                });
                console.log(`Message with no options sent to ${recipient}`);
            }
            console.log(`Message sent: ${type}/${field} to ${recipient}`);
            return true;
        }
        catch (error) {
            console.error(`Failed to send options message:`, error);
            return false;
        }
    }
    /**
     * Determine whether we should try sending an interactive message
     * This can be expanded later to check client capabilities or preferences
     * @param recipient Recipient JID
     */
    shouldTryInteractiveMessage(recipient) {
        // For now, always return false to default to text-only messages
        // This ensures consistent behavior across all clients
        return false;
    }
    /**
     * Send a predefined message
     * @param messageType The message type/field identifier
     * @param clientId WhatsApp client ID
     * @param recipient Recipient JID or number
     * @param replacements Optional replacements for placeholders
     */
    async sendMessage(messageType, clientId, recipient, replacements = {}) {
        try {
            // Format recipient if it's a number
            if (!recipient.includes('@')) {
                recipient = `${recipient}@s.whatsapp.net`;
            }
            const whatsappClient = clientService.getClient(clientId);
            if (!whatsappClient) {
                console.error(`No active WhatsApp client found with ID ${clientId}`);
                return false;
            }
            // Determine message type and field
            let type = 'system';
            let field = messageType;
            // If messageType contains a slash, split it
            if (messageType.includes('/')) {
                [type, field] = messageType.split('/');
            }
            // Get message from predefined messages
            const messageData = await predefined_service_1.default.getMessage(type, field);
            if (!messageData) {
                console.error(`Message template not found: ${type}/${field}`);
                return false;
            }
            // Replace placeholders in the message
            let finalMessage = messageData.message;
            for (const [key, value] of Object.entries(replacements)) {
                finalMessage = finalMessage.replace(new RegExp(`{${key}}`, 'g'), value);
            }
            // Send the message
            await whatsappClient.sendMessage(recipient, { text: finalMessage });
            console.log(`Message sent: ${type}/${field} to ${recipient}`);
            return true;
        }
        catch (error) {
            console.error(`Failed to send message:`, error);
            return false;
        }
    }
    /**
     * Send a raw text message without using predefined templates
     * @param clientId WhatsApp client ID
     * @param recipient Recipient JID
     * @param message Message text
     */
    async sendRawTextMessage(clientId, recipient, message) {
        try {
            const whatsappClient = clientService.getClient(clientId);
            if (!whatsappClient) {
                console.error(`No active WhatsApp client found with ID ${clientId}`);
                return false;
            }
            // Send the message
            await whatsappClient.sendMessage(recipient, { text: message });
            return true;
        }
        catch (error) {
            console.error(`Failed to send raw message:`, error);
            return false;
        }
    }
}
exports.default = MessagingService.getInstance();
