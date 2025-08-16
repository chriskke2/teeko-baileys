import { Response } from 'express';
import ClientData from '../../models/client.model';
import { StatusCodes } from 'http-status-codes';
import { AuthRequest } from '../middlewares/auth.middleware';
import clientService from '../../services/client.service';
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

export const createClient = async (req: AuthRequest, res: Response) => {
  console.log("POST /api/client/create");
  try {
    const { client_type } = req.body;

    // Validate client_type parameter
    if (!client_type) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        error: 'client_type is required. Must be either "chatbot" or "translate".'
      });
    }

    if (!['chatbot', 'translate'].includes(client_type)) {
      return res.status(StatusCodes.BAD_REQUEST).json({
        success: false,
        error: 'Invalid client_type. Must be either "chatbot" or "translate".'
      });
    }

    const newClient = new ClientData({
      status: 'INITIALIZED',
      client_type: client_type
    });
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

    // Validate if the ID is a valid MongoDB ObjectId
    if (!mongoose.Types.ObjectId.isValid(clientId)) {
      return res.status(StatusCodes.BAD_REQUEST).json({ success: false, error: 'Invalid client ID format.' });
    }

    const clientData = await ClientData.findById(clientId);
    if (!clientData) {
      return res.status(StatusCodes.NOT_FOUND).json({ success: false, error: 'Client not found.' });
    }

    // Check if client is already connected
    const existingClient = clientService.getClient(clientId);
    if (existingClient) {
      // Get the current connection status
      const connectionStatus = clientService.getConnectionStatus(clientId);

      return res.status(StatusCodes.CONFLICT).json({
        success: false,
        error: 'Client is already connected. Use disconnect first if you want to reconnect.',
        data: {
          currentStatus: connectionStatus.status,
          isConnected: connectionStatus.isConnected,
          isAuthenticated: connectionStatus.isAuthenticated,
          dbStatus: clientData.status
        }
      });
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

    // Add real-time status for each client
    const clientsWithStatus = clients.map(client => {
      const connectionStatus = clientService.getConnectionStatus(client._id.toString());
      return {
        ...client.toObject(),
        realTimeStatus: connectionStatus
      };
    });

    res.status(StatusCodes.OK).json({ success: true, clients: clientsWithStatus });
  } catch (error) {
    handleError(res, error, 'Failed to retrieve clients.');
  }
};

export const deleteClient = async (req: AuthRequest, res: Response) => {
  console.log("DELETE /api/client/:clientId");
  try {
    const { clientId } = req.params;

    // Validate if the ID is a valid MongoDB ObjectId
    if (!mongoose.Types.ObjectId.isValid(clientId)) {
      return res.status(StatusCodes.BAD_REQUEST).json({ success: false, error: 'Invalid client ID format.' });
    }

    const client = await ClientData.findById(clientId);
    if (!client) {
      return res.status(StatusCodes.NOT_FOUND).json({ success: false, error: 'Client not found.' });
    }

    await clientService.disconnectClient(clientId);
    await ClientData.findByIdAndDelete(clientId);

    res.status(StatusCodes.OK).json({ success: true, message: 'Client deleted successfully.' });
  } catch (error) {
    handleError(res, error, 'Failed to delete client.');
  }
};

export const syncClientStatuses = async (req: AuthRequest, res: Response) => {
  console.log("POST /api/client/sync-statuses");
  try {
    await clientService.syncAllClientStatuses();
    res.status(StatusCodes.OK).json({
      success: true,
      message: 'Client statuses synchronized successfully.'
    });
  } catch (error) {
    handleError(res, error, 'Failed to sync client statuses.');
  }
};

export const getClientById = async (req: AuthRequest, res: Response) => {
  console.log("GET /api/client/:clientId");
  try {
    const { clientId } = req.params;

    // Validate if the ID is a valid MongoDB ObjectId
    if (!mongoose.Types.ObjectId.isValid(clientId)) {
      return res.status(StatusCodes.BAD_REQUEST).json({ success: false, error: 'Invalid client ID format.' });
    }

    const client = await ClientData.findById(clientId).select('-session');

    if (!client) {
      return res.status(StatusCodes.NOT_FOUND).json({ success: false, error: 'Client not found.' });
    }

    // Get real-time connection status
    const connectionStatus = clientService.getConnectionStatus(clientId);

    res.status(StatusCodes.OK).json({
      success: true,
      client: {
        ...client.toObject(),
        realTimeStatus: connectionStatus
      }
    });
  } catch (error) {
    handleError(res, error, 'Failed to retrieve client.');
  }
};