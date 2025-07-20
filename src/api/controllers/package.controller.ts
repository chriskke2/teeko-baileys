import { Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { AuthRequest } from '../middlewares/auth.middleware';
import packageService from '../../services/package.service';
import mongoose from 'mongoose';

// Standardized error handler
const handleError = (res: Response, error: any, defaultMessage: string, statusCode: number = StatusCodes.INTERNAL_SERVER_ERROR) => {
  console.error(defaultMessage, error);
  const message = error.message || defaultMessage;
  res.status(statusCode).json({
    success: false,
    error: message,
  });
};

export const addPackage = async (req: AuthRequest, res: Response) => {
  console.log("POST /api/packages/add");
  try {
    const { name, text_quota, aud_quota, img_quota, duration_days } = req.body;
    
    // Validate required fields
    if (!name) {
      return res.status(StatusCodes.BAD_REQUEST).json({ success: false, error: 'Package name is required.' });
    }
    
    if (!text_quota || !aud_quota || !img_quota || !duration_days) {
      return res.status(StatusCodes.BAD_REQUEST).json({ 
        success: false, 
        error: 'All quota fields (text_quota, aud_quota, img_quota) and duration_days are required.' 
      });
    }

    // Ensure all quotas are numbers
    const packageData = {
      name,
      text_quota: Number(text_quota),
      aud_quota: Number(aud_quota),
      img_quota: Number(img_quota),
      duration_days: Number(duration_days)
    };

    const newPackage = await packageService.addPackage(packageData);
    res.status(StatusCodes.CREATED).json({ 
      success: true, 
      message: 'Package created successfully',
      id: newPackage._id,
      createdAt: newPackage.createdAt
    });
  } catch (error: any) {
    handleError(res, error, 'Failed to add package.');
  }
};

export const getAllPackages = async (req: AuthRequest, res: Response) => {
  console.log("GET /api/packages/");
  try {
    const packages = await packageService.getAllPackages();
    res.status(StatusCodes.OK).json({ success: true, packages });
  } catch (error) {
    handleError(res, error, 'Failed to retrieve packages.');
  }
};

export const getPackageById = async (req: AuthRequest, res: Response) => {
  console.log("GET /api/packages/:packageId");
  try {
    const { packageId } = req.params;
    
    // Validate if the ID is a valid MongoDB ObjectId
    if (!mongoose.Types.ObjectId.isValid(packageId)) {
      return res.status(StatusCodes.BAD_REQUEST).json({ success: false, error: 'Invalid package ID format.' });
    }
    
    const packageData = await packageService.getPackageById(packageId);
    
    if (!packageData) {
      return res.status(StatusCodes.NOT_FOUND).json({ success: false, error: 'Package not found.' });
    }
    
    res.status(StatusCodes.OK).json({ success: true, package: packageData });
  } catch (error) {
    handleError(res, error, 'Failed to retrieve package.');
  }
};

export const deletePackage = async (req: AuthRequest, res: Response) => {
  console.log("DELETE /api/packages/:packageId");
  try {
    const { packageId } = req.params;

    // Validate if the ID is a valid MongoDB ObjectId
    if (!mongoose.Types.ObjectId.isValid(packageId)) {
      return res.status(StatusCodes.BAD_REQUEST).json({ success: false, error: 'Invalid package ID format.' });
    }

    const result = await packageService.deletePackage(packageId);
    
    if (!result) {
      return res.status(StatusCodes.NOT_FOUND).json({ success: false, error: 'Package not found.' });
    }

    res.status(StatusCodes.OK).json({ success: true, message: 'Package deleted successfully.' });
  } catch (error) {
    handleError(res, error, 'Failed to delete package.');
  }
};

export const updatePackage = async (req: AuthRequest, res: Response) => {
  console.log("PUT /api/packages/:packageId");
  try {
    const { packageId } = req.params;
    const updateData = req.body;
    
    // Validate if the ID is a valid MongoDB ObjectId
    if (!mongoose.Types.ObjectId.isValid(packageId)) {
      return res.status(StatusCodes.BAD_REQUEST).json({ success: false, error: 'Invalid package ID format.' });
    }
    
    // Convert numeric fields to numbers
    if (updateData.text_quota) updateData.text_quota = Number(updateData.text_quota);
    if (updateData.aud_quota) updateData.aud_quota = Number(updateData.aud_quota);
    if (updateData.img_quota) updateData.img_quota = Number(updateData.img_quota);
    if (updateData.duration_days) updateData.duration_days = Number(updateData.duration_days);
    
    const result = await packageService.updatePackage(packageId, updateData);
    
    if (!result) {
      return res.status(StatusCodes.NOT_FOUND).json({ success: false, error: 'Package not found.' });
    }
    
    res.status(StatusCodes.OK).json({ success: true, package: result });
  } catch (error) {
    handleError(res, error, 'Failed to update package.');
  }
}; 