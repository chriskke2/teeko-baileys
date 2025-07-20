"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getClientById = exports.deleteClient = exports.getAllClients = exports.logoutClient = exports.disconnectClient = exports.connectClient = exports.createClient = void 0;
const client_model_1 = __importDefault(require("../../models/client.model"));
const http_status_codes_1 = require("http-status-codes");
const client_service_1 = __importDefault(require("../../services/client.service"));
const mongoose_1 = __importDefault(require("mongoose"));
// Standardized error handler
const handleError = (res, error, defaultMessage, statusCode = http_status_codes_1.StatusCodes.INTERNAL_SERVER_ERROR) => {
    console.error(defaultMessage, error);
    const message = error.message || defaultMessage;
    res.status(statusCode).json({
        success: false,
        error: message,
    });
};
const createClient = async (req, res) => {
    console.log("POST /api/client/create");
    try {
        const newClient = new client_model_1.default({ status: 'INITIALIZED' });
        await newClient.save();
        res.status(http_status_codes_1.StatusCodes.CREATED).json({ success: true, client: newClient });
    }
    catch (error) {
        handleError(res, error, 'Failed to create new client.');
    }
};
exports.createClient = createClient;
const connectClient = async (req, res) => {
    console.log("POST /api/client/connect");
    try {
        const { clientId } = req.body;
        if (!clientId) {
            return res.status(http_status_codes_1.StatusCodes.BAD_REQUEST).json({ success: false, error: 'clientId is required.' });
        }
        // Validate if the ID is a valid MongoDB ObjectId
        if (!mongoose_1.default.Types.ObjectId.isValid(clientId)) {
            return res.status(http_status_codes_1.StatusCodes.BAD_REQUEST).json({ success: false, error: 'Invalid client ID format.' });
        }
        const clientData = await client_model_1.default.findById(clientId);
        if (!clientData) {
            return res.status(http_status_codes_1.StatusCodes.NOT_FOUND).json({ success: false, error: 'Client not found.' });
        }
        await client_service_1.default.initializeClient(clientId);
        res.status(http_status_codes_1.StatusCodes.OK).json({ success: true, message: 'Client connection initiated. Listen for QR code and status updates.' });
    }
    catch (error) {
        handleError(res, error, 'Failed to initiate client connection.');
    }
};
exports.connectClient = connectClient;
const disconnectClient = async (req, res) => {
    console.log("POST /api/client/disconnect");
    try {
        const { clientId } = req.body;
        if (!clientId) {
            return res.status(http_status_codes_1.StatusCodes.BAD_REQUEST).json({ success: false, error: 'clientId is required.' });
        }
        await client_service_1.default.disconnectClient(clientId);
        res.status(http_status_codes_1.StatusCodes.OK).json({ success: true, message: 'Client disconnected successfully.' });
    }
    catch (error) {
        handleError(res, error, 'Failed to disconnect client.');
    }
};
exports.disconnectClient = disconnectClient;
const logoutClient = async (req, res) => {
    console.log("POST /api/client/logout");
    try {
        const { clientId } = req.body;
        if (!clientId) {
            return res.status(http_status_codes_1.StatusCodes.BAD_REQUEST).json({ success: false, error: 'clientId is required.' });
        }
        await client_service_1.default.logoutClient(clientId);
        res.status(http_status_codes_1.StatusCodes.OK).json({ success: true, message: 'Client logged out successfully and session data has been cleared.' });
    }
    catch (error) {
        handleError(res, error, 'Failed to logout client.');
    }
};
exports.logoutClient = logoutClient;
const getAllClients = async (req, res) => {
    console.log("GET /api/client/");
    try {
        const clients = await client_model_1.default.find().select('-session');
        res.status(http_status_codes_1.StatusCodes.OK).json({ success: true, clients });
    }
    catch (error) {
        handleError(res, error, 'Failed to retrieve clients.');
    }
};
exports.getAllClients = getAllClients;
const deleteClient = async (req, res) => {
    console.log("DELETE /api/client/:clientId");
    try {
        const { clientId } = req.params;
        // Validate if the ID is a valid MongoDB ObjectId
        if (!mongoose_1.default.Types.ObjectId.isValid(clientId)) {
            return res.status(http_status_codes_1.StatusCodes.BAD_REQUEST).json({ success: false, error: 'Invalid client ID format.' });
        }
        const client = await client_model_1.default.findById(clientId);
        if (!client) {
            return res.status(http_status_codes_1.StatusCodes.NOT_FOUND).json({ success: false, error: 'Client not found.' });
        }
        await client_service_1.default.disconnectClient(clientId);
        await client_model_1.default.findByIdAndDelete(clientId);
        res.status(http_status_codes_1.StatusCodes.OK).json({ success: true, message: 'Client deleted successfully.' });
    }
    catch (error) {
        handleError(res, error, 'Failed to delete client.');
    }
};
exports.deleteClient = deleteClient;
const getClientById = async (req, res) => {
    console.log("GET /api/client/:clientId");
    try {
        const { clientId } = req.params;
        // Validate if the ID is a valid MongoDB ObjectId
        if (!mongoose_1.default.Types.ObjectId.isValid(clientId)) {
            return res.status(http_status_codes_1.StatusCodes.BAD_REQUEST).json({ success: false, error: 'Invalid client ID format.' });
        }
        const client = await client_model_1.default.findById(clientId).select('-session');
        if (!client) {
            return res.status(http_status_codes_1.StatusCodes.NOT_FOUND).json({ success: false, error: 'Client not found.' });
        }
        res.status(http_status_codes_1.StatusCodes.OK).json({ success: true, client });
    }
    catch (error) {
        handleError(res, error, 'Failed to retrieve client.');
    }
};
exports.getClientById = getClientById;
