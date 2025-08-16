"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const axios_1 = __importDefault(require("axios"));
const child_process_1 = require("child_process");
const stream_1 = require("stream");
// Try to import ffmpeg-installer if available
let ffmpegPath;
try {
    const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
    ffmpegPath = ffmpegInstaller.path;
    console.log('[MediaProcessingService] Using @ffmpeg-installer/ffmpeg:', ffmpegPath);
}
catch (error) {
    console.log('[MediaProcessingService] @ffmpeg-installer/ffmpeg not found, using system FFmpeg');
}
/**
 * MediaProcessingService handles media file processing and conversion
 */
class MediaProcessingService {
    constructor() { }
    static getInstance() {
        if (!MediaProcessingService.instance) {
            MediaProcessingService.instance = new MediaProcessingService();
        }
        return MediaProcessingService.instance;
    }
    /**
     * Download media from URL and convert to OGG format
     * @param url The media URL to download
     * @returns Promise<Buffer> The converted OGG audio data
     */
    async downloadAndConvertToOgg(url) {
        try {
            console.log(`[MediaProcessingService] Downloading and converting media from: ${url}`);
            // Download the original file
            const response = await axios_1.default.get(url, {
                responseType: 'arraybuffer',
                timeout: 30000, // 30 second timeout
                headers: {
                    'User-Agent': 'WhatsApp/2.23.24.76 A',
                    'Accept': '*/*',
                }
            });
            const inputBuffer = Buffer.from(response.data);
            console.log(`[MediaProcessingService] Downloaded ${inputBuffer.length} bytes, converting to OGG...`);
            // Convert to OGG using FFmpeg
            const oggBuffer = await this.convertToOgg(inputBuffer);
            console.log(`[MediaProcessingService] Conversion complete. Output size: ${oggBuffer.length} bytes`);
            return oggBuffer;
        }
        catch (error) {
            console.error('[MediaProcessingService] Error downloading and converting media:', error);
            throw error;
        }
    }
    /**
     * Convert audio buffer to OGG format using FFmpeg
     * @param inputBuffer The input audio buffer
     * @returns Promise<Buffer> The converted OGG audio data
     */
    async convertToOgg(inputBuffer) {
        return new Promise((resolve, reject) => {
            const chunks = [];
            // Spawn FFmpeg process
            const ffmpeg = (0, child_process_1.spawn)(ffmpegPath || 'ffmpeg', [
                '-i', 'pipe:0', // Input from stdin
                '-f', 'ogg', // Output format OGG
                '-c:a', 'libvorbis', // Audio codec Vorbis
                '-q:a', '4', // Audio quality (0-10, 4 is good balance)
                '-ar', '44100', // Sample rate
                '-ac', '1', // Mono audio
                '-y', // Overwrite output
                'pipe:1' // Output to stdout
            ]);
            // Handle FFmpeg stdout (converted audio data)
            ffmpeg.stdout.on('data', (chunk) => {
                chunks.push(chunk);
            });
            // Handle FFmpeg stderr (logs and errors)
            ffmpeg.stderr.on('data', (data) => {
                console.log(`[FFmpeg] ${data.toString()}`);
            });
            // Handle process completion
            ffmpeg.on('close', (code) => {
                if (code === 0) {
                    const outputBuffer = Buffer.concat(chunks);
                    console.log(`[MediaProcessingService] FFmpeg conversion successful. Output size: ${outputBuffer.length} bytes`);
                    resolve(outputBuffer);
                }
                else {
                    console.error(`[MediaProcessingService] FFmpeg process exited with code ${code}`);
                    reject(new Error(`FFmpeg conversion failed with exit code ${code}`));
                }
            });
            // Handle process errors
            ffmpeg.on('error', (error) => {
                console.error('[MediaProcessingService] FFmpeg process error:', error);
                reject(new Error(`FFmpeg process error: ${error.message}`));
            });
            // Write input data to FFmpeg stdin
            const inputStream = new stream_1.Readable();
            inputStream.push(inputBuffer);
            inputStream.push(null); // End of stream
            inputStream.pipe(ffmpeg.stdin);
            // Handle stdin errors
            ffmpeg.stdin.on('error', (error) => {
                console.error('[MediaProcessingService] FFmpeg stdin error:', error);
                reject(new Error(`FFmpeg stdin error: ${error.message}`));
            });
        });
    }
    /**
     * Check if FFmpeg is available on the system and get version info
     * @returns Promise<{available: boolean, version?: string, error?: string}> FFmpeg availability info
     */
    async checkFFmpegAvailability() {
        return new Promise((resolve) => {
            const ffmpeg = (0, child_process_1.spawn)(ffmpegPath || 'ffmpeg', ['-version']);
            let output = '';
            let errorOutput = '';
            ffmpeg.stdout.on('data', (data) => {
                output += data.toString();
            });
            ffmpeg.stderr.on('data', (data) => {
                errorOutput += data.toString();
            });
            ffmpeg.on('close', (code) => {
                if (code === 0) {
                    // Extract version from output
                    const versionMatch = output.match(/ffmpeg version ([^\s]+)/);
                    const version = versionMatch ? versionMatch[1] : 'unknown';
                    console.log(`[MediaProcessingService] FFmpeg is available - Version: ${version}`);
                    resolve({ available: true, version });
                }
                else {
                    console.error(`[MediaProcessingService] FFmpeg check failed with code ${code}`);
                    resolve({ available: false, error: `Exit code: ${code}` });
                }
            });
            ffmpeg.on('error', (error) => {
                console.error(`[MediaProcessingService] FFmpeg not found:`, error.message);
                resolve({
                    available: false,
                    error: error.message.includes('ENOENT')
                        ? 'FFmpeg not found in PATH. Please install FFmpeg.'
                        : error.message
                });
            });
        });
    }
    /**
     * Initialize and verify FFmpeg installation
     * Call this during application startup
     */
    async initializeFFmpeg() {
        console.log('[MediaProcessingService] Checking FFmpeg installation...');
        const ffmpegInfo = await this.checkFFmpegAvailability();
        if (ffmpegInfo.available) {
            console.log(`[MediaProcessingService] ✅ FFmpeg is ready - Version: ${ffmpegInfo.version}`);
        }
        else {
            console.error(`[MediaProcessingService] ❌ FFmpeg is not available: ${ffmpegInfo.error}`);
            console.error('[MediaProcessingService] Installation instructions:');
            console.error('  Windows: Download from https://ffmpeg.org/download.html and add to PATH');
            console.error('  Linux: sudo apt install ffmpeg (Ubuntu/Debian) or sudo yum install ffmpeg (CentOS/RHEL)');
            console.error('  macOS: brew install ffmpeg');
            console.error('  Docker: Add RUN apt-get update && apt-get install -y ffmpeg to your Dockerfile');
            console.error('  Node.js: npm install @ffmpeg-installer/ffmpeg (alternative approach)');
        }
    }
    /**
     * Get media file information
     * @param url The media URL
     * @returns Promise<any> Media information
     */
    async getMediaInfo(url) {
        try {
            console.log(`[MediaProcessingService] Getting media info for: ${url}`);
            const response = await axios_1.default.head(url, {
                timeout: 10000, // 10 second timeout
                headers: {
                    'User-Agent': 'WhatsApp/2.23.24.76 A',
                    'Accept': '*/*',
                }
            });
            return {
                contentType: response.headers['content-type'] || 'unknown',
                contentLength: response.headers['content-length'] ? parseInt(response.headers['content-length']) : null,
                lastModified: response.headers['last-modified'] || null,
                etag: response.headers['etag'] || null,
                cacheControl: response.headers['cache-control'] || null,
                status: response.status,
                url: url
            };
        }
        catch (error) {
            console.error('[MediaProcessingService] Error getting media info:', error);
            throw error;
        }
    }
}
exports.default = MediaProcessingService.getInstance();
