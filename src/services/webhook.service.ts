import config from '../config';
import axios from 'axios';

/**
 * Interface for webhook response
 */
interface WebhookResponse {
  message?: string;
  status?: 'success' | 'error';
  error?: string;
  output?: string;
}

interface Customer {
  customerName: string;
  phoneNumber: string;
  from: string;
  to: string;
}

interface Taxi {
  driverName: string;
  phoneNumber: string;
}

interface Payment {
  amount: number;
  receiptNumber: string;
}

interface TaxiData {
  customer: Customer;
  taxi: Taxi;
  payment: Payment;
}

/**
 * WebhookService handles sending webhook requests to external services
 */
class WebhookService {
  private static instance: WebhookService;

  private constructor() {
    console.log(`Webhook URL: ${config.webhook_url ? 'Configured' : 'Not configured'}`);
  }

  public static getInstance(): WebhookService {
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
  private extractMessageFromResponse(responseData: any): string | undefined {
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
    } catch (error) {
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
  public async sendMessageWebhook(
    payload: {
      message: string;
      phoneNumber: string | number;
      context?: string;
      userId?: string;
      segmentation?: Record<string, any>;
      [key: string]: any;
    },
    onFallback?: () => Promise<void>,
    onResponse?: (response: WebhookResponse) => Promise<void>
  ): Promise<boolean> {
    try {
      if (!config.webhook_url) {
        console.warn('Webhook URL not configured. Skipping webhook request.');
        if (onFallback) await onFallback();
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
        if (onFallback) await onFallback();
      }, 7000);
      
      // Send the webhook request with 30-second timeout
      const response = await axios.post(config.webhook_url, webhookPayload, {
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
          const webhookResponse: WebhookResponse = {
            message,
            status: message ? 'success' : 'error'
          };
          await onResponse(webhookResponse);
        } catch (error) {
          console.error('Error processing webhook response:', error);
        }
      }
      
      return response.status >= 200 && response.status < 300;
    } catch (error) {
      console.error('Error sending webhook:', error);
      
      // Execute fallback if it hasn't been executed yet
      if (onFallback) await onFallback();
      
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
  public async sendMessageWebhookUnified(
    message: any,
    clientId: string,
    clientType: 'chatbot' | 'translate',
    user?: any
  ): Promise<boolean> {
    try {
      // Determine webhook URL based on client type
      const webhookUrl = clientType === 'translate' ? config.translate_webhook_url : config.webhook_url;

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
      } else if (imageMessage) {
        messageType = 'image';
      }

      // Skip if no content (text, audio, or image)
      if (!messageText.trim() && !audioMessage && !imageMessage) {
        console.log(`Skipping message - no text, audio, or image content from ${message.key?.remoteJid}`);
        return false;
      }

      // Extract phone number from remoteJid
      const remoteJid = message.key?.remoteJid;
      // Filter out group messages
      if (remoteJid && remoteJid.endsWith('@g.us')) {
        console.log(`Skipping group message from ${remoteJid}`);
        return false;
      }
      const phoneNumber = remoteJid ? parseInt(remoteJid.split('@')[0]) : null;

      if (!phoneNumber || isNaN(phoneNumber)) {
        console.log(`Invalid phone number format: ${remoteJid}`);
        return false;
      }

      // Create base webhook payload
      const webhookPayload: any = {
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
      
      // Add user data for chatbot clients (first_name and context)
      if (clientType === 'chatbot' && user) {
        webhookPayload.first_name = user.first_name || '';
        webhookPayload.context = user.context || '';
      }

      // Add message content based on type
      if (messageType === 'text') {
        webhookPayload.message = messageText;
      } else if (messageType === 'audio' && audioMessage) {
        // Send the entire raw audioMessage object (as per original implementation)
        webhookPayload.audioMessage = audioMessage;
        // Also include text if available (for transcription purposes)
        if (messageText.trim()) {
          webhookPayload.message = messageText;
        }
      } else if (messageType === 'image' && imageMessage) {
        // Send the entire raw imageMessage object (as per original implementation)
        webhookPayload.imageMessage = imageMessage;
        // Also include caption as message if available
        if (imageMessage.caption && imageMessage.caption.trim()) {
          webhookPayload.message = imageMessage.caption;
        }
      }

      // For both client types, handle response with fallback timer
      return await this.sendWebhookWithResponse(
        webhookUrl,
        webhookPayload,
        clientId,
        message.key?.remoteJid || '',
        phoneNumber,
        clientType
      );

    } catch (error) {
      console.error(`Error sending ${clientType} webhook:`, error);
      return false;
    }
  }

  /**
   * Send webhook with response handling and fallback timer for both client types
   * @param webhookUrl The webhook URL
   * @param payload The webhook payload
   * @param clientId The WhatsApp client ID
   * @param remoteJid The remote JID
   * @param phoneNumber The phone number
   * @param clientType The client type ('chatbot' or 'translate')
   * @returns Promise<boolean> Success status
   */
  private async sendWebhookWithResponse(
    webhookUrl: string,
    payload: any,
    clientId: string,
    remoteJid: string,
    phoneNumber: number,
    clientType: 'chatbot' | 'translate'
  ): Promise<boolean> {
    try {
      // Set up fallback timer (10 seconds)
      let fallbackExecuted = false;
      const fallbackTimer = setTimeout(async () => {
        fallbackExecuted = true;
        console.log(`Webhook response taking too long (>10s) for ${phoneNumber}. Sending fallback message.`);
        await this.sendFallbackMessage(clientId, remoteJid);
      }, 7000);

      // Send the webhook request with 30-second timeout
      const response = await axios.post(webhookUrl, payload, {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 30000 // 30 second timeout
      });

      // Clear the fallback timer
      clearTimeout(fallbackTimer);

      console.log(`${clientType} webhook sent successfully. Status: ${response.status}`);

      // Always process the response, even if fallback was executed
      if (response.data) {
        try {
          const message = this.extractMessageFromResponse(response.data);
          if (message) {
            if (fallbackExecuted) {
              console.log(`Received webhook response for user ${phoneNumber} (after fallback). Sending message: ${message.substring(0, 50)}...`);
            } else {
              console.log(`Received webhook response for user ${phoneNumber}. Sending message: ${message.substring(0, 50)}...`);
            }
            await this.sendResponseMessage(clientId, remoteJid, message);
          } else {
            console.warn(`No valid message in webhook response for user ${phoneNumber}`);
            if (!fallbackExecuted) {
              await this.sendErrorMessage(clientId, remoteJid);
            }
          }
        } catch (error) {
          console.error('Error processing webhook response:', error);
          if (!fallbackExecuted) {
            await this.sendErrorMessage(clientId, remoteJid);
          }
        }
      }

      return response.status >= 200 && response.status < 300;

    } catch (error) {
      console.error(`Error sending ${clientType} webhook:`, error);

      // Send fallback message if webhook fails
      await this.sendFallbackMessage(clientId, remoteJid);
      return false;
    }
  }

  /**
   * Process taxi data received from webhook
   * @param taxiData The taxi data to process
   */
  public async processTaxiData(taxiData: TaxiData): Promise<void> {
    try {
      console.log('Processing taxi data:', JSON.stringify(taxiData, null, 2));
      
      // TODO: Add your processing logic here
      // For now, just log the data
      console.log('Customer:', taxiData.customer);
      console.log('Taxi:', taxiData.taxi);
      console.log('Payment:', taxiData.payment);
      
      // You can add database operations, notifications, etc. here later
      
    } catch (error) {
      console.error('Error processing taxi data:', error);
      throw error;
    }
  }


  /**
   * Send fallback message when webhook takes too long
   * @param clientId The WhatsApp client ID
   * @param remoteJid The remote JID
   */
  private async sendFallbackMessage(clientId: string, remoteJid: string): Promise<void> {
    try {
      const messagingService = require('./messaging.service').default;
      await messagingService.sendRawTextMessage(
        clientId,
        remoteJid,
        "We're processing your request. Please wait a moment..."
      );
    } catch (error) {
      console.error('Error sending fallback message:', error);
    }
  }

  /**
   * Send response message from webhook
   * @param clientId The WhatsApp client ID
   * @param remoteJid The remote JID
   * @param message The message to send
   */
  private async sendResponseMessage(clientId: string, remoteJid: string, message: string): Promise<void> {
    try {
      const messagingService = require('./messaging.service').default;
      await messagingService.sendRawTextMessage(clientId, remoteJid, message);
    } catch (error) {
      console.error('Error sending response message:', error);
    }
  }

  /**
   * Send error message when webhook response is invalid
   * @param clientId The WhatsApp client ID
   * @param remoteJid The remote JID
   */
  private async sendErrorMessage(clientId: string, remoteJid: string): Promise<void> {
    try {
      const messagingService = require('./messaging.service').default;
      await messagingService.sendRawTextMessage(
        clientId,
        remoteJid,
        "Sorry, I couldn't process your request. Please try again."
      );
    } catch (error) {
      console.error('Error sending error message:', error);
    }
  }
}

export default WebhookService.getInstance();