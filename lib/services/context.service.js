"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const config_1 = __importDefault(require("../config"));
// Define the schema for the Context model
// Each document represents a segmentation field with all its possible values and contexts
const contextSchema = new mongoose_1.default.Schema({
    segmentation_field: { type: String, required: true, unique: true },
    contexts: {
        type: Map,
        of: String,
        default: new Map()
    }
}, { timestamps: true });
// Create the model using the config for collection name
const ContextData = mongoose_1.default.model('ContextData', contextSchema, config_1.default.mongodb_context_collection);
/**
 * ContextService handles the generation and management of user context
 * based on segmentation data
 */
class ContextService {
    constructor() {
        this.contextCache = new Map();
        this.lastCacheRefresh = 0;
        this.cacheExpiryMs = 5 * 60 * 1000; // 5 minutes cache expiry
        // Initialize the cache
        this.refreshCache();
        // Check if contexts exist and log warning if not
        this.checkContextsExist();
    }
    /**
     * Check if any contexts exist in the database
     */
    async checkContextsExist() {
        try {
            const count = await ContextData.countDocuments();
            if (count === 0) {
                console.warn('No contexts found in the database. Context generation will not work.');
                console.warn('Please import context definitions using the scripts/import-contexts.js script.');
            }
        }
        catch (error) {
            console.error('Error checking contexts:', error);
        }
    }
    static getInstance() {
        if (!ContextService.instance) {
            ContextService.instance = new ContextService();
        }
        return ContextService.instance;
    }
    /**
     * Refresh the context cache
     */
    async refreshCache() {
        try {
            const contexts = await ContextData.find().lean();
            this.contextCache.clear();
            // Process each segmentation field's contexts
            contexts.forEach(contextDoc => {
                const fieldMap = new Map();
                // Convert the MongoDB Map to a JavaScript Map
                if (contextDoc.contexts) {
                    // When using lean(), MongoDB returns a plain object for Map type
                    const contextEntries = Object.entries(contextDoc.contexts);
                    contextEntries.forEach(([key, value]) => {
                        if (typeof value === 'string') {
                            fieldMap.set(key, value);
                        }
                    });
                }
                // Store in cache
                this.contextCache.set(contextDoc.segmentation_field, fieldMap);
            });
            this.lastCacheRefresh = Date.now();
        }
        catch (error) {
            console.error('Failed to refresh context cache:', error);
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
     * Get context for a specific segmentation field and value
     * @param field The segmentation field
     * @param value The field value
     */
    async getContext(field, value) {
        await this.refreshCacheIfNeeded();
        // Try to get from cache
        const fieldMap = this.contextCache.get(field);
        if (fieldMap && fieldMap.has(value)) {
            return fieldMap.get(value) || null;
        }
        // If not in cache, try from database
        const contextDoc = await ContextData.findOne({
            segmentation_field: field
        }).lean();
        if (contextDoc && contextDoc.contexts) {
            // MongoDB returns a plain object for Map type when using lean()
            const contextValue = contextDoc.contexts[value];
            if (contextValue) {
                // Update cache
                if (!this.contextCache.has(field)) {
                    this.contextCache.set(field, new Map());
                }
                const fieldMap = this.contextCache.get(field);
                if (fieldMap) {
                    fieldMap.set(value, contextValue);
                }
                return contextValue;
            }
        }
        return null;
    }
    /**
     * Generate a full context description based on user's segmentation data
     * @param segmentation The user's segmentation object
     */
    async generateFullContext(segmentation) {
        try {
            await this.refreshCacheIfNeeded();
            const contextParts = [];
            console.log('Generating context for segmentation:', segmentation);
            // Process each segmentation field
            for (const [field, value] of Object.entries(segmentation)) {
                // Skip null or undefined values
                if (value === null || value === undefined) {
                    console.log(`Skipping ${field} because value is null or undefined`);
                    continue;
                }
                console.log(`Processing ${field}:${value}`);
                // Direct database lookup for this specific context to ensure we get the latest data
                const contextDoc = await ContextData.findOne({
                    segmentation_field: field
                }).lean();
                let contextValue = null;
                if (contextDoc && contextDoc.contexts && contextDoc.contexts[value]) {
                    contextValue = contextDoc.contexts[value];
                }
                else {
                    // Try from cache as fallback
                    const fieldMap = this.contextCache.get(field);
                    if (fieldMap && fieldMap.has(value)) {
                        contextValue = fieldMap.get(value);
                    }
                }
                if (contextValue) {
                    contextParts.push(contextValue);
                    console.log(`Added context for ${field}:${value}`);
                }
            }
            // Join all context parts with spaces
            const fullContext = contextParts.join(' ');
            console.log('Generated full context:', fullContext);
            return fullContext;
        }
        catch (error) {
            console.error('Error generating full context:', error);
            return ''; // Return empty string on error
        }
    }
    /**
     * Upsert context mappings for a segmentation field
     * @param contextMapping The context mapping to upsert
     */
    async upsertContextMapping(contextMapping) {
        try {
            await ContextData.updateOne({ segmentation_field: contextMapping.segmentation_field }, { $set: { contexts: contextMapping.contexts } }, { upsert: true });
            // Refresh cache after update
            this.refreshCache();
            return true;
        }
        catch (error) {
            console.error('Error upserting context mapping:', error);
            return false;
        }
    }
}
exports.default = ContextService.getInstance();
