"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const authMiddleware = (req, res, next) => {
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
exports.default = authMiddleware;
