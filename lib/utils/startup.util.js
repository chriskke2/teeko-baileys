"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.displayInstallationInstructions = exports.initializeApplication = void 0;
const media_processing_service_1 = __importDefault(require("../services/media-processing.service"));
/**
 * Initialize application dependencies and check system requirements
 */
const initializeApplication = async () => {
    console.log('🚀 Initializing application...');
    try {
        // Check FFmpeg availability
        await media_processing_service_1.default.initializeFFmpeg();
        console.log('✅ Application initialization complete');
    }
    catch (error) {
        console.error('❌ Application initialization failed:', error);
        // Don't exit the process, just log the error
        // The application can still run without FFmpeg for other features
    }
};
exports.initializeApplication = initializeApplication;
/**
 * Display installation instructions for missing dependencies
 */
const displayInstallationInstructions = () => {
    console.log('\n📋 FFmpeg Installation Instructions:');
    console.log('=====================================');
    console.log('\n🔧 Option 1: Install FFmpeg on your system');
    console.log('  Windows:');
    console.log('    1. Download from https://ffmpeg.org/download.html');
    console.log('    2. Extract to C:\\ffmpeg');
    console.log('    3. Add C:\\ffmpeg\\bin to your PATH environment variable');
    console.log('    4. Restart your terminal/IDE');
    console.log('\n  Linux (Ubuntu/Debian):');
    console.log('    sudo apt update && sudo apt install ffmpeg');
    console.log('\n  Linux (CentOS/RHEL):');
    console.log('    sudo yum install epel-release');
    console.log('    sudo yum install ffmpeg');
    console.log('\n  macOS:');
    console.log('    brew install ffmpeg');
    console.log('\n📦 Option 2: Use Node.js package (recommended for Node.js apps)');
    console.log('  npm install @ffmpeg-installer/ffmpeg');
    console.log('  # This will automatically download and use FFmpeg binaries');
    console.log('\n🐳 Option 3: Docker');
    console.log('  Add to your Dockerfile:');
    console.log('  RUN apt-get update && apt-get install -y ffmpeg');
    console.log('\n🔍 Verify installation:');
    console.log('  ffmpeg -version');
    console.log('\n⚠️  Note: The media conversion endpoint will not work without FFmpeg');
    console.log('   Other application features will continue to work normally.\n');
};
exports.displayInstallationInstructions = displayInstallationInstructions;
