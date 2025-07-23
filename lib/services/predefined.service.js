"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const config_1 = __importDefault(require("../config"));
// Define the schema for the PredefinedData model
const validationSchema = new mongoose_1.default.Schema({
    type: { type: String, required: true },
    error_message: { type: String, required: true },
    suggestion: { type: String }
}, { _id: false });
// Define schema for option object
const optionSchema = new mongoose_1.default.Schema({
    value: { type: String, required: true },
    display: { type: String },
    aliases: { type: [String] },
    mapping: { type: String }
}, { _id: false });
const predefinedSchema = new mongoose_1.default.Schema({
    type: { type: String, required: true },
    field: { type: String, required: true },
    message: { type: String, required: true },
    validation: [validationSchema],
    options: { type: [mongoose_1.default.Schema.Types.Mixed] } // Can be either string[] or option objects
}, { timestamps: true });
// Ensure uniqueness of type+field combination
predefinedSchema.index({ type: 1, field: 1 }, { unique: true });
// Create the model
const PredefinedData = mongoose_1.default.model('PredefinedData', predefinedSchema, config_1.default.mongodb_predefined_collection);
class PredefinedService {
    constructor() {
        this.messageCache = new Map();
        this.lastCacheRefresh = 0;
        this.cacheExpiryMs = 5 * 60 * 1000; // 5 minutes cache expiry
        /**
         * Common country names and their mapping to malaysian/foreigner
         * This allows flexible validation of user input
         */
        this.countryMappings = {
            // Malaysian entries
            'malaysia': 'malaysian',
            'malaysian': 'malaysian',
            'my': 'malaysian',
            'msia': 'malaysian',
            // Common foreigner countries - Southeast Asia
            'singapore': 'foreigner',
            'sg': 'foreigner',
            'singaporean': 'foreigner',
            'thailand': 'foreigner',
            'thai': 'foreigner',
            'indonesia': 'foreigner',
            'indonesian': 'foreigner',
            'philippines': 'foreigner',
            'filipino': 'foreigner',
            'vietnam': 'foreigner',
            'vietnamese': 'foreigner',
            'cambodia': 'foreigner',
            'cambodian': 'foreigner',
            'laos': 'foreigner',
            'laotian': 'foreigner',
            'myanmar': 'foreigner',
            'burmese': 'foreigner',
            'brunei': 'foreigner',
            // Common foreigner countries - East Asia
            'china': 'foreigner',
            'chinese': 'foreigner',
            'prc': 'foreigner',
            'japan': 'foreigner',
            'japanese': 'foreigner',
            'korea': 'foreigner',
            'south korea': 'foreigner',
            'korean': 'foreigner',
            'taiwan': 'foreigner',
            'taiwanese': 'foreigner',
            'hong kong': 'foreigner',
            // Other common foreigner entries
            'usa': 'foreigner',
            'us': 'foreigner',
            'united states': 'foreigner',
            'america': 'foreigner',
            'american': 'foreigner',
            'uk': 'foreigner',
            'united kingdom': 'foreigner',
            'british': 'foreigner',
            'england': 'foreigner',
            'australia': 'foreigner',
            'australian': 'foreigner',
            'canada': 'foreigner',
            'canadian': 'foreigner',
            'germany': 'foreigner',
            'german': 'foreigner',
            'france': 'foreigner',
            'french': 'foreigner',
            'italy': 'foreigner',
            'italian': 'foreigner',
            'spain': 'foreigner',
            'spanish': 'foreigner',
            'india': 'foreigner',
            'indian': 'foreigner',
            // Additional European countries
            'netherlands': 'foreigner',
            'dutch': 'foreigner',
            'belgium': 'foreigner',
            'belgian': 'foreigner',
            'sweden': 'foreigner',
            'swedish': 'foreigner',
            'norway': 'foreigner',
            'norwegian': 'foreigner',
            'denmark': 'foreigner',
            'danish': 'foreigner',
            'finland': 'foreigner',
            'finnish': 'foreigner',
            'poland': 'foreigner',
            'polish': 'foreigner',
            'portugal': 'foreigner',
            'portuguese': 'foreigner',
            'switzerland': 'foreigner',
            'swiss': 'foreigner',
            'austria': 'foreigner',
            'austrian': 'foreigner',
            'ireland': 'foreigner',
            'irish': 'foreigner',
            'greece': 'foreigner',
            'greek': 'foreigner',
            // Additional Asian countries
            'bangladesh': 'foreigner',
            'bangladeshi': 'foreigner',
            'pakistan': 'foreigner',
            'pakistani': 'foreigner',
            'nepal': 'foreigner',
            'nepalese': 'foreigner',
            'sri lanka': 'foreigner',
            'sri lankan': 'foreigner',
            'maldives': 'foreigner',
            'maldivian': 'foreigner',
            // Middle East
            'uae': 'foreigner',
            'united arab emirates': 'foreigner',
            'saudi arabia': 'foreigner',
            'saudi': 'foreigner',
            'qatar': 'foreigner',
            'qatari': 'foreigner',
            'bahrain': 'foreigner',
            'kuwait': 'foreigner',
            'oman': 'foreigner',
            'iran': 'foreigner',
            'iranian': 'foreigner',
            'iraq': 'foreigner',
            'iraqi': 'foreigner',
            'israel': 'foreigner',
            'israeli': 'foreigner',
            'turkey': 'foreigner',
            'turkish': 'foreigner',
            // Africa
            'egypt': 'foreigner',
            'egyptian': 'foreigner',
            'south africa': 'foreigner',
            'nigeria': 'foreigner',
            'nigerian': 'foreigner',
            'kenya': 'foreigner',
            'kenyan': 'foreigner',
            'morocco': 'foreigner',
            'moroccan': 'foreigner',
            // Oceania
            'new zealand': 'foreigner',
            'kiwi': 'foreigner',
            'nz': 'foreigner',
            'fiji': 'foreigner',
            'fijian': 'foreigner',
            // Americas
            'brazil': 'foreigner',
            'brazilian': 'foreigner',
            'mexico': 'foreigner',
            'mexican': 'foreigner',
            'argentina': 'foreigner',
            'argentinian': 'foreigner',
            'chile': 'foreigner',
            'chilean': 'foreigner',
            'colombia': 'foreigner',
            'colombian': 'foreigner',
            'peru': 'foreigner',
            'peruvian': 'foreigner',
            // Generic
            'other': 'foreigner',
            'others': 'foreigner',
            'foreigner': 'foreigner',
            'foreign': 'foreigner'
        };
        // Initialize the cache
        this.refreshCache();
    }
    static getInstance() {
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
    async getMessage(type, field) {
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
                this.messageCache.set(cacheKey, message);
            }
            return message;
        }
        catch (error) {
            console.error(`Error retrieving predefined message for ${type}:${field}:`, error);
            return null;
        }
    }
    /**
     * Get display options for a specific message type and field
     * @param type The message type (e.g., 'onboarding')
     * @param field The message field (e.g., 'gender')
     */
    async getDisplayOptions(type, field) {
        try {
            const message = await this.getMessage(type, field);
            if (!message || !message.options || message.options.length === 0) {
                return null;
            }
            // Convert options to display strings
            return message.options.map(option => {
                if (typeof option === 'string') {
                    return option;
                }
                else if (option.display) {
                    return option.display;
                }
                else {
                    return option.value;
                }
            });
        }
        catch (error) {
            console.error(`Error retrieving display options for ${type}:${field}:`, error);
            return null;
        }
    }
    /**
     * Validate a country input and check if it's a known country
     * @param input User's country input
     * @returns Whether the input is a valid country
     */
    isValidCountry(input) {
        const normalized = input.toLowerCase().trim();
        // Only accept countries we explicitly have in our mapping
        // This is more restrictive but ensures only valid countries are accepted
        return normalized in this.countryMappings;
    }
    /**
     * Map a country input to malaysian/foreigner classification
     * @param input User's country input
     * @returns 'malaysian' or 'foreigner'
     */
    mapCountryValue(input) {
        const normalized = input.toLowerCase().trim();
        return this.countryMappings[normalized] || 'foreigner';
    }
    /**
     * Get option values for a specific message type and field
     * @param type The message type (e.g., 'onboarding')
     * @param field The message field (e.g., 'gender')
     */
    async getOptionValues(type, field) {
        try {
            const message = await this.getMessage(type, field);
            if (!message || !message.options || message.options.length === 0) {
                return null;
            }
            // Extract values from options
            return message.options.map(option => {
                if (typeof option === 'string') {
                    return option;
                }
                else {
                    return option.value;
                }
            });
        }
        catch (error) {
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
    async validateOptionResponse(messageType, field, userResponse) {
        const message = await this.getMessage(messageType, field);
        if (!message) {
            return false;
        }
        // Handle country validation separately
        if (field === 'country') {
            const isValid = this.isValidCountry(userResponse);
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
    async getMappedValue(messageType, field, userResponse) {
        const message = await this.getMessage(messageType, field);
        // Special handling for country input
        if (field === 'country') {
            const normalized = userResponse.toLowerCase().trim();
            const isValid = this.isValidCountry(userResponse);
            const mappedValue = this.mapCountryValue(userResponse);
            console.log(`Processing country for ${messageType}: "${userResponse}"`);
            console.log(`Country validation result: ${isValid ? 'valid' : 'invalid'}`);
            if (isValid) {
                console.log(`Country "${userResponse}" mapped to country value: ${mappedValue}`);
                return mappedValue;
            }
            else {
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
            }
            else if (typeof selectedOption === 'object') {
                // For complex options, return the mapped value or value
                return selectedOption.mapping || selectedOption.value;
            }
        }
        // If not a valid number, proceed with existing logic
        // Find the matching option based on value, display text, or aliases
        for (const option of message.options) {
            if (typeof option === 'string' && option.toLowerCase() === normalizedInput) {
                return option;
            }
            else if (typeof option === 'object') {
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
    async getValidationError(messageType, field, validationType) {
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
        }
        catch (error) {
            console.error(`Error retrieving validation error for ${messageType}:${field}:${validationType}:`, error);
            return null;
        }
    }
    /**
     * Refresh the message cache
     */
    async refreshCache() {
        try {
            const messages = await PredefinedData.find().lean();
            this.messageCache.clear();
            messages.forEach(message => {
                const cacheKey = `${message.type}:${message.field}`;
                this.messageCache.set(cacheKey, message);
            });
            this.lastCacheRefresh = Date.now();
            console.log(`Predefined message cache refreshed with ${this.messageCache.size} messages.`);
        }
        catch (error) {
            console.error('Failed to refresh predefined message cache:', error);
        }
    }
    /**
     * Refresh the cache if it's expired
     */
    async refreshCacheIfNeeded() {
        if (Date.now() - this.lastCacheRefresh > this.cacheExpiryMs) {
            await this.refreshCache();
        }
    }
    /**
     * Get all messages of a specific type
     * @param type The message type to fetch
     */
    async getAllByType(type) {
        try {
            await this.refreshCacheIfNeeded();
            // Filter cached messages by type
            const messagesOfType = [];
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
        }
        catch (error) {
            console.error(`Error getting messages of type ${type}:`, error);
            return [];
        }
    }
}
exports.default = PredefinedService.getInstance();
