import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { StatusCodes } from 'http-status-codes';
import config from '../../config';

export interface AuthRequest extends Request {
  user?: { uid: string };
}

const authMiddleware = (req: AuthRequest, res: Response, next: NextFunction) => {
  // TEMPORARY: Authentication bypass - adding dummy user
  req.user = { uid: 'temp-user-id' };
  next();
  return;
  
  // Original authentication code below - temporarily disabled
  /*
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(StatusCodes.UNAUTHORIZED).json({
      success: false,
      error: 'No token provided or token format is incorrect.',
    });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, config.jwt_key) as { uid: string };
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(StatusCodes.UNAUTHORIZED).json({
      success: false,
      error: 'Not authorized to access this route. Token is invalid.',
    });
  }
  */
};

export default authMiddleware; 