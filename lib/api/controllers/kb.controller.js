"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadDocument = void 0;
const http_status_codes_1 = require("http-status-codes");
const multer_1 = __importDefault(require("multer"));
const axios_1 = __importDefault(require("axios"));
const form_data_1 = __importDefault(require("form-data"));
const config_1 = __importDefault(require("../../config"));
const upload = (0, multer_1.default)({
    storage: multer_1.default.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit
    },
    fileFilter: (req, file, cb) => {
        // Allow common document formats
        const allowedMimeTypes = [
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'text/plain',
            'text/csv',
            'application/vnd.ms-excel',
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/vnd.ms-powerpoint',
            'application/vnd.openxmlformats-officedocument.presentationml.presentation'
        ];
        if (allowedMimeTypes.includes(file.mimetype)) {
            cb(null, true);
        }
        else {
            cb(new Error('Invalid file type. Only document files are allowed.'), false);
        }
    }
});
// Standardized error handler
const handleError = (res, error, defaultMessage, statusCode = http_status_codes_1.StatusCodes.INTERNAL_SERVER_ERROR) => {
    console.error(defaultMessage, error);
    const message = error.message || defaultMessage;
    res.status(statusCode).json({
        success: false,
        error: message,
    });
};
exports.uploadDocument = [
    upload.single('document'),
    async (req, res) => {
        console.log("POST /api/kb/upload");
        try {
            // Check if file was uploaded
            if (!req.file) {
                return res.status(http_status_codes_1.StatusCodes.BAD_REQUEST).json({
                    success: false,
                    error: 'No document file provided.'
                });
            }
            // Check if type field is provided
            if (!req.body.type) {
                return res.status(http_status_codes_1.StatusCodes.BAD_REQUEST).json({
                    success: false,
                    error: 'Type field is required.'
                });
            }
            // Check if webhook URL is configured
            if (!config_1.default.kb_webhook_url) {
                return res.status(http_status_codes_1.StatusCodes.SERVICE_UNAVAILABLE).json({
                    success: false,
                    error: 'Knowledge base webhook URL not configured. Please contact administrator.'
                });
            }
            // Prepare the document data
            const documentData = {
                filename: req.file.originalname,
                mimetype: req.file.mimetype,
                size: req.file.size,
                buffer: req.file.buffer.toString('base64'), // Convert buffer to base64
                uploadTimestamp: new Date().toISOString(),
                metadata: {
                    fieldname: req.file.fieldname,
                    encoding: req.file.encoding
                }
            };
            // Add any additional form data
            if (req.body) {
                documentData.formData = req.body;
            }
            // Send to webhook
            try {
                // Create FormData to send file as binary
                const formData = new form_data_1.default();
                // Add the file as binary data
                formData.append('document', req.file.buffer, {
                    filename: req.file.originalname,
                    contentType: req.file.mimetype
                });
                // Add individual metadata fields
                formData.append('type', 'kb_upload');
                formData.append('documentType', req.body.type);
                formData.append('filename', req.file.originalname);
                formData.append('mimetype', req.file.mimetype);
                formData.append('size', req.file.size.toString());
                formData.append('uploadTimestamp', new Date().toISOString());
                formData.append('fieldname', req.file.fieldname);
                formData.append('encoding', req.file.encoding);
                // Add any additional form data fields
                Object.keys(req.body).forEach(key => {
                    if (key !== 'type') { // Don't duplicate the type field
                        formData.append(key, req.body[key]);
                    }
                });
                const webhookResponse = await axios_1.default.post(config_1.default.kb_webhook_url, formData, {
                    headers: {
                        ...formData.getHeaders(),
                        'User-Agent': 'Teko-Chatbot-KB-Upload/1.0'
                    },
                    timeout: 120000 // 2 minute timeout
                });
                console.log('Document successfully forwarded to webhook');
                res.status(http_status_codes_1.StatusCodes.OK).json({
                    success: true,
                    message: 'Document uploaded and processed successfully',
                    filename: req.file.originalname,
                    size: req.file.size,
                    webhookStatus: webhookResponse.status
                });
            }
            catch (webhookError) {
                console.error('Webhook request failed:', webhookError);
                // Return error but don't fail the request completely
                res.status(http_status_codes_1.StatusCodes.ACCEPTED).json({
                    success: true,
                    message: 'Document uploaded but webhook delivery failed',
                    filename: req.file.originalname,
                    size: req.file.size,
                    warning: 'Webhook delivery failed. Document may not be processed immediately.'
                });
            }
        }
        catch (error) {
            // Handle multer errors specifically
            if (error.code === 'LIMIT_FILE_SIZE') {
                return res.status(http_status_codes_1.StatusCodes.BAD_REQUEST).json({
                    success: false,
                    error: 'File too large. Maximum size is 10MB.'
                });
            }
            if (error.message && error.message.includes('Invalid file type')) {
                return res.status(http_status_codes_1.StatusCodes.BAD_REQUEST).json({
                    success: false,
                    error: error.message
                });
            }
            handleError(res, error, 'Failed to upload document.');
        }
    }
];
