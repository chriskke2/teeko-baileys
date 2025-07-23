import mongoose from 'mongoose';
import config from '../config';
import countryService from './country.service';

// Define the schema for the PredefinedData model
const validationSchema = new mongoose.Schema({
  type: { type: String, required: true },
  error_message: { type: String, required: true },
  suggestion: { type: String }
}, { _id: false });

// Define schema for option object
const optionSchema = new mongoose.Schema({
  value: { type: String, required: true },
  display: { type: String },
  aliases: { type: [String] },
  mapping: { type: String }
}, { _id: false });

const predefinedSchema = new mongoose.Schema({
  type: { type: String, required: true },
  field: { type: String, required: true },
  message: { type: String, required: true },
  validation: [validationSchema],
  options: { type: [mongoose.Schema.Types.Mixed] } // Can be either string[] or option objects
}, { timestamps: true });

// Ensure uniqueness of type+field combination
predefinedSchema.index({ type: 1, field: 1 }, { unique: true });

// Create the model
const PredefinedData = mongoose.model('PredefinedData', predefinedSchema, 
  config.mongodb_predefined_collection);

interface ValidationError {
  error_message: string;
  suggestion?: string;
}

interface OptionObject {
  value: string;
  display?: string;
  aliases?: string[];
  mapping?: string;
}

interface PredefinedMessage {
  _id?: string | mongoose.Types.ObjectId;
  type: string;
  field: string;
  message: string;
  validation?: {
    type: string;
    error_message: string;
    suggestion?: string;
  }[];
  options?: (string | OptionObject)[]; // Can be array of strings or option objects
}

class PredefinedService {
  private static instance: PredefinedService;
  private messageCache: Map<string, PredefinedMessage> = new Map();
  private lastCacheRefresh: number = 0;
  private cacheExpiryMs: number = 5 * 60 * 1000; // 5 minutes cache expiry

  private constructor() {
    // Initialize the cache
    this.refreshCache();
  }

  public static getInstance(): PredefinedService {
    if (!PredefinedService.instance) {
      PredefinedService.instance = new PredefinedService();
    }
    return PredefinedService.instance;
  }

  /**
   * Get a predefined message by type and field
   * @param type The message type (e.g., 'users')
   * @param field The message field (e.g., 'activation')
   */
  public async getMessage(type: string, field: string): Promise<PredefinedMessage | null> {
    try {
      // Check if cache needs refresh
      if (Date.now() - this.lastCacheRefresh > this.cacheExpiryMs) {
        await this.refreshCache();
      }

      // Try to get from cache
      const cacheKey = `${type}:${field}`;
      if (this.messageCache.has(cacheKey)) {
        return this.messageCache.get(cacheKey) || null;
      }

      // If not in cache, try from database
      const message = await PredefinedData.findOne({ type, field }).lean();
      if (message) {
        // Update cache with this single message
        this.messageCache.set(cacheKey, message as unknown as PredefinedMessage);
      }

      return message as unknown as PredefinedMessage | null;
    } catch (error) {
      console.error(`Error retrieving predefined message for ${type}:${field}:`, error);
      return null;
    }
  }

  /**
   * Get display options for a specific message type and field
   * @param type The message type (e.g., 'onboarding')
   * @param field The message field (e.g., 'gender')
   */
  public async getDisplayOptions(type: string, field: string): Promise<string[] | null> {
    try {
      const message = await this.getMessage(type, field);
      if (!message || !message.options || message.options.length === 0) {
        return null;
      }

      // Convert options to display strings
      return message.options.map(option => {
        if (typeof option === 'string') {
          return option;
        } else if (option.display) {
          return option.display;
        } else {
          return option.value;
        }
      });
    } catch (error) {
      console.error(`Error retrieving display options for ${type}:${field}:`, error);
      return null;
    }
  }

  /**
   * Get option values for a specific message type and field
   * @param type The message type (e.g., 'onboarding')
   * @param field The message field (e.g., 'gender')
   */
  public async getOptionValues(type: string, field: string): Promise<string[] | null> {
    try {
      const message = await this.getMessage(type, field);
      if (!message || !message.options || message.options.length === 0) {
        return null;
      }

      // Extract values from options
      return message.options.map(option => {
        if (typeof option === 'string') {
          return option;
        } else {
          return option.value;
        }
      });
    } catch (error) {
      console.error(`Error retrieving option values for ${type}:${field}:`, error);
      return null;
    }
  }

  /**
   * Validate if a user's response matches one of the available options
   * This now supports numeric selection and country validation
   * @param messageType The message type (e.g., 'onboarding')
   * @param field The field name (e.g., 'gender')
   * @param userResponse The user's response to validate
   */
  public async validateOptionResponse(messageType: string, field: string, userResponse: string): Promise<boolean> {
    const message = await this.getMessage(messageType, field);
    if (!message) {
      return false;
    }

    // Handle country validation separately
    if (field === 'country') {
      const isValid = await countryService.isValidCountry(userResponse);
      console.log(`Country validation for "${userResponse}": ${isValid ? 'valid' : 'invalid'}`);
      return isValid;
    }
    
    // If no options defined, consider valid
    if (!message.options || message.options.length === 0) {
      return true;
    }

    // Normalize user input
    const normalizedInput = userResponse.toLowerCase().trim();

    // Check if input is a number and within valid range
    const numericInput = parseInt(normalizedInput);
    if (!isNaN(numericInput) && numericInput > 0 && numericInput <= message.options.length) {
      // Valid numeric selection
      return true;
    }
    
    // If not a valid number, check against actual option values
    const optionValues = await this.getOptionValues(messageType, field);
    if (optionValues && optionValues.some(option => option.toLowerCase() === normalizedInput)) {
      return true;
    }

    // Check against display text and aliases for complex options
    for (const option of message.options) {
      if (typeof option === 'object') {
        // Check value
        if (option.value.toLowerCase() === normalizedInput) {
          return true;
        }
        
        // Check display text
        if (option.display && option.display.toLowerCase() === normalizedInput) {
          return true;
        }
        
        // Check aliases
        if (option.aliases && option.aliases.some(alias => alias.toLowerCase() === normalizedInput)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Get the mapped value for a user response
   * Now supports numeric selection and country mapping
   * @param messageType The message type
   * @param field The field name
   * @param userResponse The user's response
   */
  public async getMappedValue(messageType: string, field: string, userResponse: string): Promise<string | null> {
    const message = await this.getMessage(messageType, field);
    
    // Special handling for country input
    if (field === 'country') {
      const isValid = await countryService.isValidCountry(userResponse);
      const mappedValue = await countryService.mapToMalaysianOrForeigner(userResponse);
      
      console.log(`Processing country for ${messageType}: "${userResponse}"`);
      console.log(`Country validation result: ${isValid ? 'valid' : 'invalid'}`);
      
      if (isValid) {
        console.log(`Country "${userResponse}" mapped to country value: ${mappedValue}`);
        return mappedValue;
      } else {
        console.log(`Country "${userResponse}" rejected as invalid`);
        return null;
      }
    }
    
    if (!message || !message.options || message.options.length === 0) {
      return null;
    }

    // Normalize user input
    const normalizedInput = userResponse.toLowerCase().trim();
    
    // Check if input is a number and within valid range
    const numericInput = parseInt(normalizedInput);
    if (!isNaN(numericInput) && numericInput > 0 && numericInput <= message.options.length) {
      // Get the option at the selected index (adjusting for 0-based array indexing)
      const selectedOption = message.options[numericInput - 1];
      
      if (typeof selectedOption === 'string') {
        // For simple string options
        return selectedOption;
      } else if (typeof selectedOption === 'object') {
        // For complex options, return the mapped value or value
        return selectedOption.mapping || selectedOption.value;
      }
    }
    
    // If not a valid number, proceed with existing logic
    // Find the matching option based on value, display text, or aliases
    for (const option of message.options) {
      if (typeof option === 'string' && option.toLowerCase() === normalizedInput) {
        return option;
      } else if (typeof option === 'object') {
        if (option.value.toLowerCase() === normalizedInput ||
            (option.display && option.display.toLowerCase() === normalizedInput) ||
            (option.aliases && option.aliases.some(alias => alias.toLowerCase() === normalizedInput))) {
          return option.mapping || option.value;
        }
      }
    }

    return null;
  }

  /**
   * Get error message for a specific validation type
   * @param messageType The message type (e.g., 'users')
   * @param field The message field (e.g., 'activation')
   * @param validationType The validation error type (e.g., 'invalid_format')
   */
  public async getValidationError(
    messageType: string, 
    field: string, 
    validationType: string
  ): Promise<ValidationError | null> {
    try {
      const message = await this.getMessage(messageType, field);
      if (!message || !message.validation) {
        return null;
      }

      const validation = message.validation.find(v => v.type === validationType);
      if (!validation) {
        return null;
      }

      return {
        error_message: validation.error_message,
        suggestion: validation.suggestion
      };
    } catch (error) {
      console.error(`Error retrieving validation error for ${messageType}:${field}:${validationType}:`, error);
      return null;
    }
  }

  /**
   * Refresh the message cache
   */
  private async refreshCache(): Promise<void> {
    try {
      const messages = await PredefinedData.find().lean();
      this.messageCache.clear();

      messages.forEach(message => {
        const cacheKey = `${message.type}:${message.field}`;
        this.messageCache.set(cacheKey, message as unknown as PredefinedMessage);
      });

      this.lastCacheRefresh = Date.now();
      console.log(`Predefined message cache refreshed with ${this.messageCache.size} messages.`);
    } catch (error) {
      console.error('Failed to refresh predefined message cache:', error);
    }
  }

  /**
   * Refresh the cache if it's expired
   */
  private async refreshCacheIfNeeded(): Promise<void> {
    if (Date.now() - this.lastCacheRefresh > this.cacheExpiryMs) {
      await this.refreshCache();
    }
  }

  /**
   * Get all messages of a specific type
   * @param type The message type to fetch
   */
  public async getAllByType(type: string): Promise<any[]> {
    try {
      await this.refreshCacheIfNeeded();
      
      // Filter cached messages by type
      const messagesOfType: any[] = [];
      this.messageCache.forEach((message) => {
        if (message.type === type) {
          messagesOfType.push(message);
        }
      });
      
      // If cache has messages of this type, return them
      if (messagesOfType.length > 0) {
        return messagesOfType;
      }
      
      // Otherwise fetch from database
      const messages = await PredefinedData.find({ type }).lean();
      return messages;
    } catch (error) {
      console.error(`Error getting messages of type ${type}:`, error);
      return [];
    }
  }
}

export default PredefinedService.getInstance(); 