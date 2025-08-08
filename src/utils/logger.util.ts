/**
 * Simple logging utility to control console output based on environment
 */

const isProduction = process.env.NODE_ENV === 'production';
const isVerbose = process.env.VERBOSE_LOGS === 'true';

export const logger = {
  /**
   * Log info messages (only in development or when verbose is enabled)
   */
  info: (message: string, ...args: any[]) => {
    if (!isProduction || isVerbose) {
      console.log(message, ...args);
    }
  },

  /**
   * Log warning messages (always shown)
   */
  warn: (message: string, ...args: any[]) => {
    console.warn(message, ...args);
  },

  /**
   * Log error messages (always shown)
   */
  error: (message: string, ...args: any[]) => {
    console.error(message, ...args);
  },

  /**
   * Log debug messages (only when verbose is enabled)
   */
  debug: (message: string, ...args: any[]) => {
    if (isVerbose) {
      console.log(`[DEBUG] ${message}`, ...args);
    }
  },

  /**
   * Log success messages (only in development or when verbose is enabled)
   */
  success: (message: string, ...args: any[]) => {
    if (!isProduction || isVerbose) {
      console.log(`✅ ${message}`, ...args);
    }
  }
};

export default logger;
