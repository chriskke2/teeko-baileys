import { Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import ClientData from '../../models/client.model';
import { StatusCodes } from 'http-status-codes';
import { AuthRequest } from '../middlewares/auth.middleware';
import clientService from '../../services/client.service';

// Standardized error handler
const handleError = (res: Response, error: any, defaultMessage: string, statusCode: number = StatusCodes.INTERNAL_SERVER_ERROR) => {
  console.error(defaultMessage, error);
  const message = error.message || defaultMessage;
  res.status(statusCode).json({
    success: false,
    error: message,
  });
};

export const createClient = async (req: AuthRequest, res: Response) => {
  console.log("POST /api/client/create");
  try {
    const clientId = uuidv4();
    
    const newClient = new ClientData({ clientId, status: 'INITIALIZED' });
    await newClient.save();
    res.status(StatusCodes.CREATED).json({ success: true, client: newClient });
  } catch (error) {
    handleError(res, error, 'Failed to create new client.');
  }
};

export const connectClient = async (req: AuthRequest, res: Response) => {
  console.log("POST /api/client/connect");
  try {
    const { clientId } = req.body;
    if (!clientId) {
      return res.status(StatusCodes.BAD_REQUEST).json({ success: false, error: 'clientId is required.' });
    }

    const clientData = await ClientData.findOne({ clientId });
    if (!clientData) {
      return res.status(StatusCodes.NOT_FOUND).json({ success: false, error: 'Client not found.' });
    }
    
    await clientService.initializeClient(clientId);
    res.status(StatusCodes.OK).json({ success: true, message: 'Client connection initiated. Listen for QR code and status updates.' });
  } catch (error) {
    handleError(res, error, 'Failed to initiate client connection.');
  }
};

export const disconnectClient = async (req: AuthRequest, res: Response) => {
  console.log("POST /api/client/disconnect");
  try {
    const { clientId } = req.body;
    if (!clientId) {
      return res.status(StatusCodes.BAD_REQUEST).json({ success: false, error: 'clientId is required.' });
    }
    
    await clientService.disconnectClient(clientId);
    res.status(StatusCodes.OK).json({ success: true, message: 'Client disconnected successfully.' });
  } catch (error) {
    handleError(res, error, 'Failed to disconnect client.');
  }
};

export const logoutClient = async (req: AuthRequest, res: Response) => {
  console.log("POST /api/client/logout");
  try {
    const { clientId } = req.body;
    if (!clientId) {
      return res.status(StatusCodes.BAD_REQUEST).json({ success: false, error: 'clientId is required.' });
    }
    
    await clientService.logoutClient(clientId);
    res.status(StatusCodes.OK).json({ success: true, message: 'Client logged out successfully and session data has been cleared.' });
  } catch (error) {
    handleError(res, error, 'Failed to logout client.');
  }
};

export const getAllClients = async (req: AuthRequest, res: Response) => {
  console.log("GET /api/client/");
  try {
    const clients = await ClientData.find().select('-session');
    res.status(StatusCodes.OK).json({ success: true, clients });
  } catch (error) {
    handleError(res, error, 'Failed to retrieve clients.');
  }
};

export const deleteClient = async (req: AuthRequest, res: Response) => {
  console.log("DELETE /api/client/:clientId");
  try {
    const { clientId } = req.params;

    const client = await ClientData.findOne({ clientId });
    if (!client) {
      return res.status(StatusCodes.NOT_FOUND).json({ success: false, error: 'Client not found.' });
    }

    await clientService.disconnectClient(clientId);
    await ClientData.deleteOne({ clientId });

    res.status(StatusCodes.OK).json({ success: true, message: 'Client deleted successfully.' });
  } catch (error) {
    handleError(res, error, 'Failed to delete client.');
  }
};

export const getClientById = async (req: AuthRequest, res: Response) => {
  console.log("GET /api/client/:clientId");
  try {
    const { clientId } = req.params;
    const client = await ClientData.findOne({ clientId }).select('-session');

    if (!client) {
      return res.status(StatusCodes.NOT_FOUND).json({ success: false, error: 'Client not found.' });
    }

    res.status(StatusCodes.OK).json({ success: true, client });
  } catch (error) {
    handleError(res, error, 'Failed to retrieve client.');
  }
}; 