"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updatePackage = exports.deletePackage = exports.getPackageById = exports.getAllPackages = exports.addPackage = void 0;
const http_status_codes_1 = require("http-status-codes");
const package_service_1 = __importDefault(require("../../services/package.service"));
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
const addPackage = async (req, res) => {
    console.log("POST /api/packages/add");
    try {
        const { name, text_quota, aud_quota, img_quota, duration_days } = req.body;
        // Validate required fields
        if (!name) {
            return res.status(http_status_codes_1.StatusCodes.BAD_REQUEST).json({ success: false, error: 'Package name is required.' });
        }
        if (!text_quota || !aud_quota || !img_quota || !duration_days) {
            return res.status(http_status_codes_1.StatusCodes.BAD_REQUEST).json({
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
        const newPackage = await package_service_1.default.addPackage(packageData);
        res.status(http_status_codes_1.StatusCodes.CREATED).json({
            success: true,
            message: 'Package created successfully',
            id: newPackage._id,
            createdAt: newPackage.createdAt
        });
    }
    catch (error) {
        handleError(res, error, 'Failed to add package.');
    }
};
exports.addPackage = addPackage;
const getAllPackages = async (req, res) => {
    console.log("GET /api/packages/");
    try {
        const packages = await package_service_1.default.getAllPackages();
        res.status(http_status_codes_1.StatusCodes.OK).json({ success: true, packages });
    }
    catch (error) {
        handleError(res, error, 'Failed to retrieve packages.');
    }
};
exports.getAllPackages = getAllPackages;
const getPackageById = async (req, res) => {
    console.log("GET /api/packages/:packageId");
    try {
        const { packageId } = req.params;
        // Validate if the ID is a valid MongoDB ObjectId
        if (!mongoose_1.default.Types.ObjectId.isValid(packageId)) {
            return res.status(http_status_codes_1.StatusCodes.BAD_REQUEST).json({ success: false, error: 'Invalid package ID format.' });
        }
        const packageData = await package_service_1.default.getPackageById(packageId);
        if (!packageData) {
            return res.status(http_status_codes_1.StatusCodes.NOT_FOUND).json({ success: false, error: 'Package not found.' });
        }
        res.status(http_status_codes_1.StatusCodes.OK).json({ success: true, package: packageData });
    }
    catch (error) {
        handleError(res, error, 'Failed to retrieve package.');
    }
};
exports.getPackageById = getPackageById;
const deletePackage = async (req, res) => {
    console.log("DELETE /api/packages/:packageId");
    try {
        const { packageId } = req.params;
        // Validate if the ID is a valid MongoDB ObjectId
        if (!mongoose_1.default.Types.ObjectId.isValid(packageId)) {
            return res.status(http_status_codes_1.StatusCodes.BAD_REQUEST).json({ success: false, error: 'Invalid package ID format.' });
        }
        const result = await package_service_1.default.deletePackage(packageId);
        if (!result) {
            return res.status(http_status_codes_1.StatusCodes.NOT_FOUND).json({ success: false, error: 'Package not found.' });
        }
        res.status(http_status_codes_1.StatusCodes.OK).json({ success: true, message: 'Package deleted successfully.' });
    }
    catch (error) {
        handleError(res, error, 'Failed to delete package.');
    }
};
exports.deletePackage = deletePackage;
const updatePackage = async (req, res) => {
    console.log("PUT /api/packages/:packageId");
    try {
        const { packageId } = req.params;
        const updateData = req.body;
        // Validate if the ID is a valid MongoDB ObjectId
        if (!mongoose_1.default.Types.ObjectId.isValid(packageId)) {
            return res.status(http_status_codes_1.StatusCodes.BAD_REQUEST).json({ success: false, error: 'Invalid package ID format.' });
        }
        // Convert numeric fields to numbers
        if (updateData.text_quota)
            updateData.text_quota = Number(updateData.text_quota);
        if (updateData.aud_quota)
            updateData.aud_quota = Number(updateData.aud_quota);
        if (updateData.img_quota)
            updateData.img_quota = Number(updateData.img_quota);
        if (updateData.duration_days)
            updateData.duration_days = Number(updateData.duration_days);
        const result = await package_service_1.default.updatePackage(packageId, updateData);
        if (!result) {
            return res.status(http_status_codes_1.StatusCodes.NOT_FOUND).json({ success: false, error: 'Package not found.' });
        }
        res.status(http_status_codes_1.StatusCodes.OK).json({ success: true, package: result });
    }
    catch (error) {
        handleError(res, error, 'Failed to update package.');
    }
};
exports.updatePackage = updatePackage;
