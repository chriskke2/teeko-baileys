"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMediaInfo = exports.downloadMedia = void 0;
const http_status_codes_1 = require("http-status-codes");
const axios_1 = __importDefault(require("axios"));
const handleError = (res, error, defaultMessage) => {
    console.error('Media Controller Error:', error);
    const statusCode = error.response?.status || http_status_codes_1.StatusCodes.INTERNAL_SERVER_ERROR;
    const message = error.message || defaultMessage;
    res.status(statusCode).json({
        success: false,
        error: message,
    });
};
/**
 * Download media file from WhatsApp URL and return as binary response
 * POST /api/media/download
 */
const downloadMedia = async (req, res) => {
    console.log("POST /api/media/download");
    try {
        const { url } = req.body;
        // Validate URL parameter
        if (!url) {
            return res.status(http_status_codes_1.StatusCodes.BAD_REQUEST).json({
                success: false,
                error: 'URL is required in request body.'
            });
        }
        // Validate URL format
        if (typeof url !== 'string' || !url.startsWith('https://')) {
            return res.status(http_status_codes_1.StatusCodes.BAD_REQUEST).json({
                success: false,
                error: 'Invalid URL format. Must be a valid HTTPS URL.'
            });
        }
        console.log(`Downloading media from URL: ${url}`);
        // Download the file from WhatsApp servers
        const response = await axios_1.default.get(url, {
            responseType: 'arraybuffer',
            timeout: 30000, // 30 second timeout
            headers: {
                'User-Agent': 'WhatsApp/2.23.24.76 A',
                'Accept': '*/*',
            }
        });
        // Get content type from response headers
        const contentType = response.headers['content-type'] || 'application/octet-stream';
        // Get content length
        const contentLength = response.headers['content-length'];
        console.log(`Media downloaded successfully. Content-Type: ${contentType}, Size: ${contentLength} bytes`);
        // Set appropriate headers for binary response
        res.set({
            'Content-Type': contentType,
            'Content-Length': contentLength,
            'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization'
        });
        // Send the binary data
        res.send(Buffer.from(response.data));
    }
    catch (error) {
        console.error('Error downloading media:', error);
        if (axios_1.default.isAxiosError(error)) {
            if (error.code === 'ECONNABORTED') {
                return res.status(http_status_codes_1.StatusCodes.REQUEST_TIMEOUT).json({
                    success: false,
                    error: 'Request timeout while downloading media file.'
                });
            }
            if (error.response?.status === 404) {
                return res.status(http_status_codes_1.StatusCodes.NOT_FOUND).json({
                    success: false,
                    error: 'Media file not found or URL has expired.'
                });
            }
            if (error.response?.status === 403) {
                return res.status(http_status_codes_1.StatusCodes.FORBIDDEN).json({
                    success: false,
                    error: 'Access denied to media file.'
                });
            }
        }
        handleError(res, error, 'Failed to download media file.');
    }
};
exports.downloadMedia = downloadMedia;
/**
 * Get media file info without downloading the full file
 * POST /api/media/info
 */
const getMediaInfo = async (req, res) => {
    console.log("POST /api/media/info");
    try {
        const { url } = req.body;
        // Validate URL parameter
        if (!url) {
            return res.status(http_status_codes_1.StatusCodes.BAD_REQUEST).json({
                success: false,
                error: 'URL is required in request body.'
            });
        }
        // Validate URL format
        if (typeof url !== 'string' || !url.startsWith('https://')) {
            return res.status(http_status_codes_1.StatusCodes.BAD_REQUEST).json({
                success: false,
                error: 'Invalid URL format. Must be a valid HTTPS URL.'
            });
        }
        console.log(`Getting media info for URL: ${url}`);
        // Make a HEAD request to get file info without downloading
        const response = await axios_1.default.head(url, {
            timeout: 10000, // 10 second timeout
            headers: {
                'User-Agent': 'WhatsApp/2.23.24.76 A',
                'Accept': '*/*',
            }
        });
        // Extract file information
        const mediaInfo = {
            contentType: response.headers['content-type'] || 'unknown',
            contentLength: response.headers['content-length'] ? parseInt(response.headers['content-length']) : null,
            lastModified: response.headers['last-modified'] || null,
            etag: response.headers['etag'] || null,
            cacheControl: response.headers['cache-control'] || null,
            status: response.status,
            url: url
        };
        console.log(`Media info retrieved:`, mediaInfo);
        res.status(http_status_codes_1.StatusCodes.OK).json({
            success: true,
            data: mediaInfo
        });
    }
    catch (error) {
        console.error('Error getting media info:', error);
        if (axios_1.default.isAxiosError(error)) {
            if (error.code === 'ECONNABORTED') {
                return res.status(http_status_codes_1.StatusCodes.REQUEST_TIMEOUT).json({
                    success: false,
                    error: 'Request timeout while getting media info.'
                });
            }
            if (error.response?.status === 404) {
                return res.status(http_status_codes_1.StatusCodes.NOT_FOUND).json({
                    success: false,
                    error: 'Media file not found or URL has expired.'
                });
            }
            if (error.response?.status === 403) {
                return res.status(http_status_codes_1.StatusCodes.FORBIDDEN).json({
                    success: false,
                    error: 'Access denied to media file.'
                });
            }
        }
        handleError(res, error, 'Failed to get media file info.');
    }
};
exports.getMediaInfo = getMediaInfo;
