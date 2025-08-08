import { Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { AuthRequest } from '../middlewares/auth.middleware';
import messageService from '../../services/message.service';

/**
 * Send a text message to a specific chat ID
 * POST /api/message/send
 */
export const sendMessage = async (req: AuthRequest, res: Response) => {
  try {
    const { clientId, chatId, message } = req.body;

    // Use the message service to handle the business logic
    const result = await messageService.sendTextMessage({
      clientId,
      chatId,
      message
    });

    if (result.success) {
      return res.status(StatusCodes.OK).json({
        success: true,
        message: 'Message sent successfully.',
        data: result.data
      });
    } else {
      // Determine appropriate status code based on error type
      let statusCode = StatusCodes.INTERNAL_SERVER_ERROR;

      if (result.error?.includes('required') || result.error?.includes('non-empty string')) {
        statusCode = StatusCodes.BAD_REQUEST;
      } else if (result.error?.includes('not connected')) {
        statusCode = StatusCodes.SERVICE_UNAVAILABLE;
      }

      return res.status(statusCode).json({
        success: false,
        error: result.error
      });
    }

  } catch (error) {
    console.error('MessageController: Failed to send message:', error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      error: 'Failed to send message.'
    });
  }
};
