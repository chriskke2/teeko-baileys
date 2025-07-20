"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getClientById = exports.deleteClient = exports.getAllClients = exports.logoutClient = exports.disconnectClient = exports.connectClient = exports.createClient = void 0;
const uuid_1 = require("uuid");
const client_model_1 = __importDefault(require("../../models/client.model"));
const http_status_codes_1 = require("http-status-codes");
const client_service_1 = __importDefault(require("../../services/client.service"));
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
        const uid = req.user?.uid;
        if (!uid) {
            return res.status(http_status_codes_1.StatusCodes.BAD_REQUEST).json({ success: false, error: 'User ID not found in token.' });
        }
        const clientId = (0, uuid_1.v4)();
        const newClient = new client_model_1.default({ uid, clientId, status: 'INITIALIZED' });
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
        const clientData = await client_model_1.default.findOne({ clientId, uid: req.user?.uid });
        if (!clientData) {
            return res.status(http_status_codes_1.StatusCodes.NOT_FOUND).json({ success: false, error: 'Client not found or permission denied.' });
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
        const uid = req.user?.uid;
        const clients = await client_model_1.default.find({ uid }).select('-session');
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
        const uid = req.user?.uid;
        const client = await client_model_1.default.findOne({ clientId, uid });
        if (!client) {
            return res.status(http_status_codes_1.StatusCodes.NOT_FOUND).json({ success: false, error: 'Client not found or permission denied.' });
        }
        await client_service_1.default.disconnectClient(clientId);
        await client_model_1.default.deleteOne({ clientId });
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
        const uid = req.user?.uid;
        const client = await client_model_1.default.findOne({ clientId, uid }).select('-session');
        if (!client) {
            return res.status(http_status_codes_1.StatusCodes.NOT_FOUND).json({ success: false, error: 'Client not found or permission denied.' });
        }
        res.status(http_status_codes_1.StatusCodes.OK).json({ success: true, client });
    }
    catch (error) {
        handleError(res, error, 'Failed to retrieve client.');
    }
};
exports.getClientById = getClientById;
