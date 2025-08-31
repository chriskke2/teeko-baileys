import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import userService from '../../services/user.service';
import mongoose from 'mongoose';
import clientService from '../../services/client.service';
import multer from 'multer';
import ImageModel from '../../models/image.model';
const upload = multer();

// Standardized error handler
const handleError = (res: Response, error: any, defaultMessage: string, statusCode: number = StatusCodes.INTERNAL_SERVER_ERROR) => {
  console.error(defaultMessage, error);
  const message = error.message || defaultMessage;
  res.status(statusCode).json({
    success: false,
    error: message,
  });
};

export const addUser = async (req: Request, res: Response) => {
  console.log("POST /api/users/subscribe");
  try {
    const { wa_num, package_id, clientId } = req.body;
    
    // Validate required fields
    if (!wa_num) {
      return res.status(StatusCodes.BAD_REQUEST).json({ success: false, error: 'WhatsApp number is required.' });
    }
    
    if (!package_id) {
      return res.status(StatusCodes.BAD_REQUEST).json({ success: false, error: 'Package ID is required.' });
    }

    if (!clientId) {
      return res.status(StatusCodes.BAD_REQUEST).json({ success: false, error: 'Client ID is required.' });
    }

    // Check if the client is connected
    const isClientConnected = await userService.isClientConnected(clientId);
    if (!isClientConnected) {
      return res.status(StatusCodes.SERVICE_UNAVAILABLE).json({ 
        success: false, 
        error: 'WhatsApp client is not connected. Please connect the client first.' 
      });
    }

    // Validate package ID format
    if (!mongoose.Types.ObjectId.isValid(package_id)) {
      return res.status(StatusCodes.BAD_REQUEST).json({ 
        success: false, 
        error: 'Invalid package ID format.' 
      });
    }

    // Convert wa_num to number if it's a string
    const waNumber = typeof wa_num === 'string' ? parseInt(wa_num, 10) : wa_num;
    
    // Validate that wa_num is a valid number
    if (isNaN(waNumber)) {
      return res.status(StatusCodes.BAD_REQUEST).json({ 
        success: false, 
        error: 'Phone number must be a valid number containing only digits.' 
      });
    }

    // Additional validation: check if the original input contains only digits
    if (typeof wa_num === 'string' && !/^\d+$/.test(wa_num)) {
      return res.status(StatusCodes.BAD_REQUEST).json({ 
        success: false, 
        error: 'Phone number must contain only digits (0-9).' 
      });
    }

    // Validate phone number length (typical phone numbers are 7-15 digits)
    if (waNumber < 1000000 || waNumber > 999999999999999) {
      return res.status(StatusCodes.BAD_REQUEST).json({ 
        success: false, 
        error: 'Phone number must be between 7 and 15 digits long.' 
      });
    }

    try {
      const newUser = await userService.addUser({ 
        wa_num: waNumber, 
        package_id,
        clientId // Pass clientId if provided for sending activation message
      });
      
      res.status(StatusCodes.CREATED).json({ 
        success: true, 
        message: 'User created successfully',
        user: {
          id: newUser._id,
          wa_num: newUser.wa_num,
          code: newUser.code
        }
      });
    } catch (error: any) {
      // Check for user existence errors
      if (error.message && (
          error.message.includes("already exists") || 
          error.message.includes("already subscribed")
        )) {
        return res.status(StatusCodes.CONFLICT).json({ 
          success: false, 
          error: error.message
        });
      }
      // Check for package not found error
      if (error.message && error.message.includes("not found")) {
        return res.status(StatusCodes.BAD_REQUEST).json({ 
          success: false, 
          error: error.message
        });
      }
      throw error; // Re-throw for the outer catch block
    }
  } catch (error: any) {
    // Handle duplicate key error
    if (error.code === 11000) {
      return handleError(
        res, 
        error, 
        'User with this WhatsApp number already exists.', 
        StatusCodes.CONFLICT
      );
    }
    handleError(res, error, 'Failed to add user.');
  }
};

export const activateUser = async (req: Request, res: Response) => {
  console.log("POST /api/users/activate");
  try {
    const { wa_num, code, clientId } = req.body;
    
    // Validate required fields
    if (!wa_num) {
      return res.status(StatusCodes.BAD_REQUEST).json({ success: false, error: 'WhatsApp number is required.' });
    }
    
    if (!code) {
      return res.status(StatusCodes.BAD_REQUEST).json({ success: false, error: 'Verification code is required.' });
    }

    if (!clientId) {
      return res.status(StatusCodes.BAD_REQUEST).json({ success: false, error: 'Client ID is required.' });
    }

    // Check if the client is connected
    const isClientConnected = await userService.isClientConnected(clientId);
    if (!isClientConnected) {
      return res.status(StatusCodes.SERVICE_UNAVAILABLE).json({ 
        success: false, 
        error: 'WhatsApp client is not connected. Please connect the client first.' 
      });
    }

    // Convert wa_num to number if it's a string
    const waNumber = typeof wa_num === 'string' ? parseInt(wa_num, 10) : wa_num;
    
    // Validate that wa_num is a valid number
    if (isNaN(waNumber)) {
      return res.status(StatusCodes.BAD_REQUEST).json({ success: false, error: 'WhatsApp number must be a valid number.' });
    }

    try {
      const updatedUser = await userService.activateUser({ wa_num: waNumber, code });
      
      // Format the dates for the response
      const subscriptionStart = updatedUser.subscription_start ? 
        updatedUser.subscription_start.toISOString() : null;
      const subscriptionEnd = updatedUser.subscription_end ? 
        updatedUser.subscription_end.toISOString() : null;

      res.status(StatusCodes.OK).json({ 
        success: true, 
        message: 'Subscription activated successfully',
        subscription: {
          wa_num: updatedUser.wa_num,
          package_name: updatedUser.package_name,
          subscription_start: subscriptionStart,
          subscription_end: subscriptionEnd,
          status: updatedUser.status
        }
      });
    } catch (error: any) {
      // Return error with BAD_REQUEST status for subscription-specific errors
      return res.status(StatusCodes.BAD_REQUEST).json({ 
        success: false, 
        error: error.message
      });
    }
  } catch (error: any) {
    handleError(res, error, 'Failed to activate subscription.');
  }
};

export const getAllUsers = async (req: Request, res: Response) => {
  console.log("GET /api/users/");
  try {
    const users = await userService.getAllUsers();
    res.status(StatusCodes.OK).json({ success: true, users });
  } catch (error) {
    handleError(res, error, 'Failed to retrieve users.');
  }
};

export const deleteUser = async (req: Request, res: Response) => {
  console.log("DELETE /api/users/:userId");
  try {
    const { userId } = req.params;

    // Validate if the ID is a valid MongoDB ObjectId
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(StatusCodes.BAD_REQUEST).json({ success: false, error: 'Invalid user ID format.' });
    }

    const result = await userService.deleteUser(userId);
    
    if (!result) {
      return res.status(StatusCodes.NOT_FOUND).json({ success: false, error: 'User not found.' });
    }

    res.status(StatusCodes.OK).json({ success: true, message: 'User deleted successfully.' });
  } catch (error) {
    handleError(res, error, 'Failed to delete user.');
  }
}; 

export const sendImageMessage = [
  upload.single('image'),
      async (req: Request, res: Response) => {
    try {
      const { clientId, wa_num, caption } = req.body;
      let imageBuffer: Buffer | undefined;
      // If file upload (multipart/form-data)
      if (req.file && req.file.buffer) {
        imageBuffer = req.file.buffer;
      } else if (Array.isArray(req.body.image)) {
        // If JSON array of numbers
        imageBuffer = Buffer.from(req.body.image);
      } else {
        return res.status(StatusCodes.BAD_REQUEST).json({ success: false, error: 'Image must be uploaded as a file or as an array of numbers.' });
      }
      if (!clientId || !wa_num || !imageBuffer) {
        return res.status(StatusCodes.BAD_REQUEST).json({ success: false, error: 'clientId, wa_num, and image are required.' });
      }
      // Get the WhatsApp client
      const client = clientService.getClient(clientId);
      if (!client) {
        return res.status(StatusCodes.SERVICE_UNAVAILABLE).json({ success: false, error: 'WhatsApp client is not connected.' });
      }
      // Format recipient JID
      const jid = wa_num.toString().includes('@') ? wa_num.toString() : `${wa_num}@s.whatsapp.net`;
      // Send the image message
      await client.sendMessage(jid, {
        image: imageBuffer,
        caption: caption || ''
      });
      return res.status(StatusCodes.OK).json({ success: true, message: 'Image sent successfully.' });
    } catch (error) {
      console.error('Failed to send image message:', error);
      return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ success: false, error: 'Failed to send image message.' });
    }
  }
]; 

export const sendImageFromDb = async (req: Request, res: Response) => {
  try {
    const { clientId, wa_num, imageId, caption } = req.body;
    if (!clientId || !wa_num || !imageId) {
      return res.status(StatusCodes.BAD_REQUEST).json({ success: false, error: 'clientId, wa_num, and imageId are required.' });
    }
    const client = clientService.getClient(clientId);
    if (!client) {
      return res.status(StatusCodes.SERVICE_UNAVAILABLE).json({ success: false, error: 'WhatsApp client is not connected.' });
    }
    const imageDoc = await ImageModel.findById(imageId);
    if (!imageDoc) {
      return res.status(StatusCodes.NOT_FOUND).json({ success: false, error: 'Image not found.' });
    }
    const jid = wa_num.toString().includes('@') ? wa_num.toString() : `${wa_num}@s.whatsapp.net`;
    await client.sendMessage(jid, {
      image: imageDoc.data,
      caption: caption || ''
    });
    return res.status(StatusCodes.OK).json({ success: true, message: 'Image sent successfully.' });
  } catch (error) {
    console.error('Failed to send image from DB:', error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ success: false, error: 'Failed to send image from DB.' });
  }
};

export const sendImageByName = async (req: Request, res: Response) => {
  try {
    const { clientId, wa_num, imageName, caption } = req.body;
    if (!clientId || !wa_num || !imageName) {
      return res.status(StatusCodes.BAD_REQUEST).json({ success: false, error: 'clientId, wa_num, and imageName are required.' });
    }
    const client = clientService.getClient(clientId);
    if (!client) {
      return res.status(StatusCodes.SERVICE_UNAVAILABLE).json({ success: false, error: 'WhatsApp client is not connected.' });
    }
    const imageDoc = await ImageModel.findOne({ name: imageName });
    if (!imageDoc) {
      return res.status(StatusCodes.NOT_FOUND).json({ success: false, error: `Image with name '${imageName}' not found.` });
    }
    const jid = wa_num.toString().includes('@') ? wa_num.toString() : `${wa_num}@s.whatsapp.net`;
    await client.sendMessage(jid, {
      image: imageDoc.data,
      caption: caption || ''
    });
    return res.status(StatusCodes.OK).json({ success: true, message: 'Image sent successfully.' });
  } catch (error) {
    console.error('Failed to send image by name:', error);
    return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({ success: false, error: 'Failed to send image by name.' });
  }
}; 

/**
 * Start onboarding process for a new user
 * @param req Request object containing user_name and wa_num
 * @param res Response object
 */
export const startOnboarding = async (req: Request, res: Response) => {
  console.log("POST /api/users/start-onboarding");
  try {
    const { user_name, wa_num } = req.body;
    
    // Validate required fields
    if (!user_name) {
      return res.status(StatusCodes.BAD_REQUEST).json({ 
        success: false, 
        error: 'User name is required.' 
      });
    }
    
    if (!wa_num) {
      return res.status(StatusCodes.BAD_REQUEST).json({ 
        success: false, 
        error: 'WhatsApp number is required.' 
      });
    }

    // Convert wa_num to number if it's a string
    const waNumber = typeof wa_num === 'string' ? parseInt(wa_num, 10) : wa_num;
    
    // Validate that wa_num is a valid number
    if (isNaN(waNumber)) {
      return res.status(StatusCodes.BAD_REQUEST).json({ 
        success: false, 
        error: 'WhatsApp number must be a valid number.' 
      });
    }

    // Call the user service to start onboarding
    const result = await userService.startOnboarding({
      user_name,
      wa_num: waNumber
    });

    if (!result.success) {
      // Handle different error types
      if (result.error?.includes('already registered')) {
        return res.status(StatusCodes.CONFLICT).json({
          success: false,
          error: result.error
        });
      }
      
      if (result.error?.includes('No chatbot client found')) {
        return res.status(StatusCodes.SERVICE_UNAVAILABLE).json({
          success: false,
          error: result.error
        });
      }
      
      if (result.error?.includes('not connected')) {
        return res.status(StatusCodes.SERVICE_UNAVAILABLE).json({
          success: false,
          error: result.error
        });
      }
      
      if (result.error?.includes('not detected on WhatsApp')) {
        return res.status(StatusCodes.BAD_REQUEST).json({
          success: false,
          error: result.error
        });
      }
      
      return res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
        success: false,
        error: result.error || 'Failed to start onboarding process.'
      });
    }

    // Return success response
    res.status(StatusCodes.CREATED).json({
      success: true,
      message: 'User onboarding has successfully started',
      user: {
        id: result.user._id,
        wa_num: result.user.wa_num,
        first_name: result.user.first_name,
        status: result.user.status,
        current_step: result.user.current_step
      }
    });

  } catch (error) {
    console.error('Error starting onboarding:', error);
    res.status(StatusCodes.INTERNAL_SERVER_ERROR).json({
      success: false,
      error: 'Failed to start onboarding process.'
    });
  }
}; 