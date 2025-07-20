"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteUser = exports.getAllUsers = exports.activateUser = exports.addUser = void 0;
const http_status_codes_1 = require("http-status-codes");
const user_service_1 = __importDefault(require("../../services/user.service"));
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
const addUser = async (req, res) => {
    console.log("POST /api/users/subscribe");
    try {
        const { wa_num, package_id, clientId } = req.body;
        // Validate required fields
        if (!wa_num) {
            return res.status(http_status_codes_1.StatusCodes.BAD_REQUEST).json({ success: false, error: 'WhatsApp number is required.' });
        }
        if (!package_id) {
            return res.status(http_status_codes_1.StatusCodes.BAD_REQUEST).json({ success: false, error: 'Package ID is required.' });
        }
        if (!clientId) {
            return res.status(http_status_codes_1.StatusCodes.BAD_REQUEST).json({ success: false, error: 'Client ID is required.' });
        }
        // Check if the client is connected
        const isClientConnected = await user_service_1.default.isClientConnected(clientId);
        if (!isClientConnected) {
            return res.status(http_status_codes_1.StatusCodes.SERVICE_UNAVAILABLE).json({
                success: false,
                error: 'WhatsApp client is not connected. Please connect the client first.'
            });
        }
        // Validate package ID format
        if (!mongoose_1.default.Types.ObjectId.isValid(package_id)) {
            return res.status(http_status_codes_1.StatusCodes.BAD_REQUEST).json({
                success: false,
                error: 'Invalid package ID format.'
            });
        }
        // Convert wa_num to number if it's a string
        const waNumber = typeof wa_num === 'string' ? parseInt(wa_num, 10) : wa_num;
        // Validate that wa_num is a valid number
        if (isNaN(waNumber)) {
            return res.status(http_status_codes_1.StatusCodes.BAD_REQUEST).json({ success: false, error: 'WhatsApp number must be a valid number.' });
        }
        try {
            const newUser = await user_service_1.default.addUser({
                wa_num: waNumber,
                package_id,
                clientId // Pass clientId if provided for sending activation message
            });
            res.status(http_status_codes_1.StatusCodes.CREATED).json({
                success: true,
                message: 'User created successfully',
                user: {
                    id: newUser._id,
                    wa_num: newUser.wa_num,
                    code: newUser.code
                }
            });
        }
        catch (error) {
            // Check for user existence errors
            if (error.message && (error.message.includes("already exists") ||
                error.message.includes("already subscribed"))) {
                return res.status(http_status_codes_1.StatusCodes.CONFLICT).json({
                    success: false,
                    error: error.message
                });
            }
            // Check for package not found error
            if (error.message && error.message.includes("not found")) {
                return res.status(http_status_codes_1.StatusCodes.BAD_REQUEST).json({
                    success: false,
                    error: error.message
                });
            }
            throw error; // Re-throw for the outer catch block
        }
    }
    catch (error) {
        // Handle duplicate key error
        if (error.code === 11000) {
            return handleError(res, error, 'User with this WhatsApp number already exists.', http_status_codes_1.StatusCodes.CONFLICT);
        }
        handleError(res, error, 'Failed to add user.');
    }
};
exports.addUser = addUser;
const activateUser = async (req, res) => {
    console.log("POST /api/users/activate");
    try {
        const { wa_num, code, clientId } = req.body;
        // Validate required fields
        if (!wa_num) {
            return res.status(http_status_codes_1.StatusCodes.BAD_REQUEST).json({ success: false, error: 'WhatsApp number is required.' });
        }
        if (!code) {
            return res.status(http_status_codes_1.StatusCodes.BAD_REQUEST).json({ success: false, error: 'Verification code is required.' });
        }
        if (!clientId) {
            return res.status(http_status_codes_1.StatusCodes.BAD_REQUEST).json({ success: false, error: 'Client ID is required.' });
        }
        // Check if the client is connected
        const isClientConnected = await user_service_1.default.isClientConnected(clientId);
        if (!isClientConnected) {
            return res.status(http_status_codes_1.StatusCodes.SERVICE_UNAVAILABLE).json({
                success: false,
                error: 'WhatsApp client is not connected. Please connect the client first.'
            });
        }
        // Convert wa_num to number if it's a string
        const waNumber = typeof wa_num === 'string' ? parseInt(wa_num, 10) : wa_num;
        // Validate that wa_num is a valid number
        if (isNaN(waNumber)) {
            return res.status(http_status_codes_1.StatusCodes.BAD_REQUEST).json({ success: false, error: 'WhatsApp number must be a valid number.' });
        }
        try {
            const updatedUser = await user_service_1.default.activateUser({ wa_num: waNumber, code });
            // Format the dates for the response
            const subscriptionStart = updatedUser.subscription_start ?
                updatedUser.subscription_start.toISOString() : null;
            const subscriptionEnd = updatedUser.subscription_end ?
                updatedUser.subscription_end.toISOString() : null;
            res.status(http_status_codes_1.StatusCodes.OK).json({
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
        }
        catch (error) {
            // Return error with BAD_REQUEST status for subscription-specific errors
            return res.status(http_status_codes_1.StatusCodes.BAD_REQUEST).json({
                success: false,
                error: error.message
            });
        }
    }
    catch (error) {
        handleError(res, error, 'Failed to activate subscription.');
    }
};
exports.activateUser = activateUser;
const getAllUsers = async (req, res) => {
    console.log("GET /api/users/");
    try {
        const users = await user_service_1.default.getAllUsers();
        res.status(http_status_codes_1.StatusCodes.OK).json({ success: true, users });
    }
    catch (error) {
        handleError(res, error, 'Failed to retrieve users.');
    }
};
exports.getAllUsers = getAllUsers;
const deleteUser = async (req, res) => {
    console.log("DELETE /api/users/:userId");
    try {
        const { userId } = req.params;
        // Validate if the ID is a valid MongoDB ObjectId
        if (!mongoose_1.default.Types.ObjectId.isValid(userId)) {
            return res.status(http_status_codes_1.StatusCodes.BAD_REQUEST).json({ success: false, error: 'Invalid user ID format.' });
        }
        const result = await user_service_1.default.deleteUser(userId);
        if (!result) {
            return res.status(http_status_codes_1.StatusCodes.NOT_FOUND).json({ success: false, error: 'User not found.' });
        }
        res.status(http_status_codes_1.StatusCodes.OK).json({ success: true, message: 'User deleted successfully.' });
    }
    catch (error) {
        handleError(res, error, 'Failed to delete user.');
    }
};
exports.deleteUser = deleteUser;
