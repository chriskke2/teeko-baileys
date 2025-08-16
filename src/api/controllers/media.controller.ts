import { Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { AuthRequest } from '../middlewares/auth.middleware';
import mediaService from '../../services/media.service';

const handleError = (res: Response, error: any, defaultMessage: string) => {
  console.error('Media Controller Error:', error);
  const statusCode = error.response?.status || StatusCodes.INTERNAL_SERVER_ERROR;
  const message = error.message || defaultMessage;
  res.status(statusCode).json({
    success: false,
    error: message,
  });
};

/**
 * Download and decrypt WhatsApp audio using simplified audio message data
 * POST /api/media/download-audio
 */
export const downloadWhatsAppAudio = async (req: AuthRequest, res: Response) => {
  try {
    const { url, mediaKey, fileEncSha256 } = req.body;

    // Validate required fields using media service
    const validation = mediaService.validateAudioFields(url, mediaKey, fileEncSha256);
    if (!validation.isValid) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        error: validation.error,
        debug: validation.debug
      });
    }

    // Use media service to download and decrypt audio
    const mediaBuffer = await mediaService.downloadAndDecryptAudio(url, mediaKey, fileEncSha256);

    // Set appropriate headers for OGG file download
    res.set({
      'Content-Type': 'audio/ogg',
      'Content-Length': mediaBuffer.length.toString(),
      'Content-Disposition': 'attachment; filename="whatsapp-audio.ogg"',
      'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });

    // Send the decrypted OGG data
    res.send(mediaBuffer);

  } catch (error) {
    // Handle specific service errors
    if (error instanceof Error) {
      if (error.message.includes('No WhatsApp clients are currently connected')) {
        return res.status(StatusCodes.SERVICE_UNAVAILABLE).json({
          success: false,
          error: error.message
        });
      }

      if (error.message.includes('Failed to load client service') || error.message.includes('Failed to load Baileys library')) {
        return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
          success: false,
          error: error.message
        });
      }

      if (error.message.includes('Failed to download audio from WhatsApp')) {
        return res.status(StatusCodes.BAD_REQUEST).json({
          success: false,
          error: error.message
        });
      }
    }

    handleError(res, error, 'Failed to download and decrypt WhatsApp audio.');
  }
};

/**
 * Download and decrypt WhatsApp image
 * POST /api/media/download-image
 */
export const downloadWhatsAppImage = async (req: AuthRequest, res: Response) => {
  try {
    const { url, mediaKey, fileEncSha256 } = req.body;

    // Validate required fields using media service
    const validation = mediaService.validateImageFields(url, mediaKey, fileEncSha256);
    if (!validation.isValid) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        error: validation.error,
        debug: validation.debug
      });
    }

    // Use media service to download and decrypt image
    const mediaBuffer = await mediaService.downloadAndDecryptImage(url, mediaKey, fileEncSha256);

    // Default to JPEG content type and extension
    const contentType = 'image/jpeg';
    const fileExtension = 'jpg';

    // Set appropriate headers for image file download
    res.set({
      'Content-Type': contentType,
      'Content-Length': mediaBuffer.length.toString(),
      'Content-Disposition': `attachment; filename="whatsapp-image.${fileExtension}"`,
      'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });

    // Send the decrypted image data
    res.send(mediaBuffer);

  } catch (error) {
    // Handle specific service errors
    if (error instanceof Error) {
      if (error.message.includes('No WhatsApp clients are currently connected')) {
        return res.status(StatusCodes.SERVICE_UNAVAILABLE).json({
          success: false,
          error: error.message
        });
      }

      if (error.message.includes('Failed to load client service') || error.message.includes('Failed to load Baileys library')) {
        return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
          success: false,
          error: error.message
        });
      }

      if (error.message.includes('Failed to download image from WhatsApp')) {
        return res.status(StatusCodes.BAD_REQUEST).json({
          success: false,
          error: error.message
        });
      }
    }

    handleError(res, error, 'Failed to download and decrypt WhatsApp image.');
  }
};
