import clientService from './client.service';
import messagingService from './messaging.service';

interface SendMessageRequest {
  clientId: string;
  chatId: string;
  message: string;
}

interface SendMessageResponse {
  success: boolean;
  data?: {
    clientId: string;
    chatId: string;
    message: string;
  };
  error?: string;
}

class MessageService {
  private static instance: MessageService;

  public static getInstance(): MessageService {
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
  public async sendTextMessage(request: SendMessageRequest): Promise<SendMessageResponse> {
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
      const client = clientService.getClient(clientId);
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
      const success = await messagingService.sendRawTextMessage(clientId, jid, message.trim());
      
      if (success) {
        return {
          success: true,
          data: {
            clientId,
            chatId: jid,
            message: message.trim()
          }
        };
      } else {
        return {
          success: false,
          error: 'Failed to send message through messaging service.'
        };
      }

    } catch (error) {
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
  public async validateClient(clientId: string): Promise<boolean> {
    try {
      const client = clientService.getClient(clientId);
      return client !== undefined && client !== null;
    } catch (error) {
      console.error('MessageService: Failed to validate client:', error);
      return false;
    }
  }

  /**
   * Format a phone number or chat ID to proper WhatsApp JID format
   * @param chatId The chat ID or phone number
   * @returns Formatted JID string
   */
  public formatChatId(chatId: string): string {
    if (!chatId.includes('@')) {
      return `${chatId}@s.whatsapp.net`;
    }
    return chatId;
  }
}

export default MessageService.getInstance();
