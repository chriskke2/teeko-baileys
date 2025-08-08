"use strict";
/**
 * Simple logging utility to control console output based on environment
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
const isProduction = process.env.NODE_ENV === 'production';
const isVerbose = process.env.VERBOSE_LOGS === 'true';
exports.logger = {
    /**
     * Log info messages (only in development or when verbose is enabled)
     */
    info: (message, ...args) => {
        if (!isProduction || isVerbose) {
            console.log(message, ...args);
        }
    },
    /**
     * Log warning messages (always shown)
     */
    warn: (message, ...args) => {
        console.warn(message, ...args);
    },
    /**
     * Log error messages (always shown)
     */
    error: (message, ...args) => {
        console.error(message, ...args);
    },
    /**
     * Log debug messages (only when verbose is enabled)
     */
    debug: (message, ...args) => {
        if (isVerbose) {
            console.log(`[DEBUG] ${message}`, ...args);
        }
    },
    /**
     * Log success messages (only in development or when verbose is enabled)
     */
    success: (message, ...args) => {
        if (!isProduction || isVerbose) {
            console.log(`✅ ${message}`, ...args);
        }
    }
};
exports.default = exports.logger;
