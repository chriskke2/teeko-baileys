import config from '../config';
import axios from 'axios';
import UserData from '../models/user.model';
import messagingService from './messaging.service';
import webhookService from './webhook.service';

/**
 * Interface for translation webhook response
 */
interface TranslationWebhookResponse {
  message?: string;
  status?: 'success' | 'error';
  error?: string;
  output?: string;
}

/**
 * TranslationService handles translation client type messages
 * Validates user status and forwards messages to translation webhook
 */
class TranslationService {
  private static instance: TranslationService;

  private constructor() {
    console.log(`Translation Webhook URL: ${config.translate_webhook_url ? 'Configured' : 'Not configured'}`);
  }

  public static getInstance(): TranslationService {
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
  public async processTranslationMessage(message: any, clientId: string): Promise<void> {
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
      const imageMessage = message.message?.imageMessage;

      // Determine message type
      let messageType = 'text';
      if (audioMessage) {
        messageType = 'audio';
      } else if (imageMessage) {
        messageType = 'image';
      }

      // Skip if no content (text, audio, or image)
      if (!messageText.trim() && !audioMessage && !imageMessage) {
        console.log(`[DEBUG] Translation - Skipping message - no text, audio, or image content from ${remoteJid}`);
        return;
      }

      // Extract WhatsApp number
      const waNumber = parseInt(remoteJid.split('@')[0]);
      if (isNaN(waNumber)) {
        console.log(`[DEBUG] Translation - Invalid phone number format: ${remoteJid}`);
        return;
      }

      console.log(`[Translation] Processing ${messageType} message from ${waNumber}: ${
        messageType === 'text' ? `"${messageText}"` :
        messageType === 'audio' ? 'audio message' :
        'image message'
      }`);

      // Check if user exists and is active
      const user = await UserData.findOne({ wa_num: waNumber });

      if (!user) {
        console.log(`[Translation] User ${waNumber} not found`);
        await messagingService.sendRawTextMessage(
          clientId,
          remoteJid,
          "Please completing your onboarding process in order to enjoy Teeko's translation services."
        );
        return;
      }

      if (user.status !== 'ACTIVE') {
        console.log(`[Translation] User ${waNumber} is not active (status: ${user.status})`);
        await messagingService.sendRawTextMessage(
          clientId,
          remoteJid,
          "Please completing your onboarding process in order to enjoy Teeko's translation services."
        );
        return;
      }

      console.log(`User ${waNumber} is active, forwarding ${messageType} message to translation webhook`);

      // Note: Webhook processing is now handled by the universal webhook service in client.service.ts
      // This ensures consistent behavior for all message types (text, audio, image) across both client types
      // No need to call webhook service here to avoid duplication
      console.log(`Webhook will be handled by universal webhook service`);

    } catch (error) {
      console.error('Error processing translation message:', error);
    }
  }



  /**
   * Send a webhook request to the translation service
   * @param payload The payload to send
   * @param onFallback Callback function to execute if 10 seconds pass without a response
   * @param onResponse Callback function to execute when response is received
   */
  private async sendTranslationWebhook(
    payload: {
      message: string;
      phoneNumber: string | number;
      context?: string;
      userId?: string;
      segmentation?: Record<string, any>;
      [key: string]: any;
    },
    onFallback?: () => Promise<void>,
    onResponse?: (response: TranslationWebhookResponse) => Promise<void>
  ): Promise<boolean> {
    try {
      if (!config.translate_webhook_url) {
        console.warn('Translation webhook URL not configured. Skipping webhook request.');
        if (onFallback) await onFallback();
        return false;
      }

      console.log(`Sending webhook for message from ${payload.phoneNumber}`);
      
      // Set up fallback timer (10 seconds)
      let fallbackExecuted = false;
      const fallbackTimer = setTimeout(async () => {
        fallbackExecuted = true;
        console.log(`Webhook response taking too long (>10s) for ${payload.phoneNumber}. Sending fallback message.`);
        if (onFallback) await onFallback();
      }, 10000);
      
      // Send the webhook request with 30-second timeout
      const response = await axios.post(config.translate_webhook_url, payload, {
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
          const webhookResponse: TranslationWebhookResponse = {
            message,
            status: message ? 'success' : 'error'
          };
          await onResponse(webhookResponse);
        } catch (error) {
          console.error('Error processing translation webhook response:', error);
        }
      }
      
      return response.status >= 200 && response.status < 300;
    } catch (error) {
      console.error('Error sending translation webhook:', error);
      
      // Execute fallback if it hasn't been executed yet
      if (onFallback) await onFallback();
      return false;
    }
  }

  /**
   * Extract message from webhook response
   * @param responseData The response data from webhook
   * @returns The extracted message or undefined
   */
  private extractMessageFromResponse(responseData: any): string | undefined {
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

export default TranslationService.getInstance();
