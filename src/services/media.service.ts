/**
 * MediaService handles WhatsApp media processing and decryption
 */
class MediaService {
  private static instance: MediaService;

  private constructor() {}

  public static getInstance(): MediaService {
    if (!MediaService.instance) {
      MediaService.instance = new MediaService();
    }
    return MediaService.instance;
  }

  /**
   * Download and decrypt WhatsApp audio using available client
   * @param url The encrypted media URL
   * @param mediaKey The decryption key
   * @param fileEncSha256 The file encryption SHA256
   * @returns Promise<Buffer> The decrypted audio buffer
   */
  public async downloadAndDecryptAudio(
    url: string,
    mediaKey: string,
    fileEncSha256: string
  ): Promise<Buffer> {
    // Import WhatsApp client service and Baileys
    let clientService, client, downloadMediaMessage;

    try {
      clientService = require('./client.service').default;
    } catch (error) {
      throw new Error('Failed to load client service.');
    }

    try {
      // Get any available connected client
      const availableClients = clientService.getAllConnectedClients();

      if (availableClients.length === 0) {
        throw new Error('No WhatsApp clients are currently connected. Please ensure at least one client is connected.');
      }

      // Use the first available connected client
      const clientId = availableClients[0];
      client = clientService.getClient(clientId);

    } catch (error) {
      throw new Error('Failed to access WhatsApp clients.');
    }

    if (!client) {
      throw new Error('WhatsApp client is not available. Please ensure at least one client is connected.');
    }

    try {
      const baileys = require('@whiskeysockets/baileys');
      downloadMediaMessage = baileys.downloadMediaMessage;
    } catch (error) {
      throw new Error('Failed to load Baileys library.');
    }

    // Create audioMessage object for Baileys
    const audioMessage = {
      url,
      mediaKey,
      fileEncSha256,
      mimetype: 'audio/ogg; codecs=opus'
    };

    // Create a message object in the format expected by Baileys
    const messageForBaileys = {
      key: {
        remoteJid: 'temp@s.whatsapp.net', // Temporary JID for download
        fromMe: false,
        id: 'temp-id'
      },
      message: {
        audioMessage: audioMessage
      }
    };

    let mediaBuffer;

    try {
      mediaBuffer = await downloadMediaMessage(
        messageForBaileys,
        'buffer',
        {},
        {
          reuploadRequest: client.updateMediaMessage
        }
      );
    } catch (downloadError) {
      throw new Error(
        'Failed to download audio from WhatsApp: ' +
        (downloadError instanceof Error ? downloadError.message : 'Unknown error')
      );
    }

    if (!mediaBuffer) {
      throw new Error('Failed to download audio from WhatsApp. The media may have expired or be invalid.');
    }

    return mediaBuffer;
  }

  /**
   * Download and decrypt WhatsApp image using available client
   * @param url The encrypted media URL
   * @param mediaKey The decryption key
   * @param fileEncSha256 The file encryption SHA256
   * @returns Promise<Buffer> The decrypted image buffer
   */
  public async downloadAndDecryptImage(
    url: string,
    mediaKey: string,
    fileEncSha256: string
  ): Promise<Buffer> {
    // Import WhatsApp client service and Baileys
    let clientService, client, downloadMediaMessage;

    try {
      clientService = require('./client.service').default;
    } catch (error) {
      throw new Error('Failed to load client service.');
    }

    try {
      // Get any available connected client
      const availableClients = clientService.getAllConnectedClients();

      if (availableClients.length === 0) {
        throw new Error('No WhatsApp clients are currently connected. Please ensure at least one client is connected.');
      }

      // Use the first available connected client
      const clientId = availableClients[0];
      client = clientService.getClient(clientId);

    } catch (error) {
      throw new Error('Failed to access WhatsApp clients.');
    }

    if (!client) {
      throw new Error('WhatsApp client is not available. Please ensure at least one client is connected.');
    }

    try {
      const baileys = require('@whiskeysockets/baileys');
      downloadMediaMessage = baileys.downloadMediaMessage;
    } catch (error) {
      throw new Error('Failed to load Baileys library.');
    }

    // Create imageMessage object for Baileys
    const imageMessage = {
      url,
      mediaKey,
      fileEncSha256,
      mimetype: 'image/jpeg'
    };

    // Create a message object in the format expected by Baileys
    const messageForBaileys = {
      key: {
        remoteJid: 'temp@s.whatsapp.net', // Temporary JID for download
        fromMe: false,
        id: 'temp-id'
      },
      message: {
        imageMessage: imageMessage
      }
    };

    let mediaBuffer;

    try {
      mediaBuffer = await downloadMediaMessage(
        messageForBaileys,
        'buffer',
        {},
        {
          reuploadRequest: client.updateMediaMessage
        }
      );
    } catch (downloadError) {
      throw new Error(
        'Failed to download image from WhatsApp: ' +
        (downloadError instanceof Error ? downloadError.message : 'Unknown error')
      );
    }

    if (!mediaBuffer) {
      throw new Error('Failed to download image from WhatsApp. The media may have expired or be invalid.');
    }

    return mediaBuffer;
  }

  /**
   * Validate required fields for audio download
   * @param url The media URL
   * @param mediaKey The media key
   * @param fileEncSha256 The file encryption SHA256
   * @returns Object with validation result and error message if any
   */
  public validateAudioFields(
    url: string | undefined,
    mediaKey: string | undefined,
    fileEncSha256: string | undefined
  ): { isValid: boolean; error?: string; debug?: any } {
    if (!url || !mediaKey || !fileEncSha256) {
      return {
        isValid: false,
        error: 'url, mediaKey, and fileEncSha256 fields are required.',
        debug: {
          hasUrl: !!url,
          hasMediaKey: !!mediaKey,
          hasFileEncSha256: !!fileEncSha256
        }
      };
    }

    return { isValid: true };
  }

  /**
   * Validate required fields for image download
   * @param url The media URL
   * @param mediaKey The media key
   * @param fileEncSha256 The file encryption SHA256
   * @returns Object with validation result and error message if any
   */
  public validateImageFields(
    url: string | undefined,
    mediaKey: string | undefined,
    fileEncSha256: string | undefined
  ): { isValid: boolean; error?: string; debug?: any } {
    if (!url || !mediaKey || !fileEncSha256) {
      return {
        isValid: false,
        error: 'url, mediaKey, and fileEncSha256 fields are required.',
        debug: {
          hasUrl: !!url,
          hasMediaKey: !!mediaKey,
          hasFileEncSha256: !!fileEncSha256
        }
      };
    }

    return { isValid: true };
  }
}

export default MediaService.getInstance();