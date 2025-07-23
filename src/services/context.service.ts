import mongoose from 'mongoose';
import config from '../config';

// Define the schema for the Context model
// Each document represents a segmentation field with all its possible values and contexts
const contextSchema = new mongoose.Schema({
  segmentation_field: { type: String, required: true, unique: true },
  contexts: {
    type: Map,
    of: String,
    default: new Map()
  }
}, { timestamps: true });

// Create the model using the config for collection name
const ContextData = mongoose.model('ContextData', contextSchema, 
  config.mongodb_context_collection);

/**
 * Interface for context definition
 */
interface ContextMapping {
  segmentation_field: string;
  contexts: Record<string, string>;
}

/**
 * ContextService handles the generation and management of user context
 * based on segmentation data
 */
class ContextService {
  private static instance: ContextService;
  private contextCache: Map<string, Map<string, string>> = new Map();
  private lastCacheRefresh: number = 0;
  private cacheExpiryMs: number = 5 * 60 * 1000; // 5 minutes cache expiry

  private constructor() {
    // Initialize the cache
    this.refreshCache();
    
    // Log collection name
    console.log(`Using context collection: ${config.mongodb_context_collection}`);
    
    // Check if contexts exist and log warning if not
    this.checkContextsExist();
  }
  
  /**
   * Check if any contexts exist in the database
   */
  private async checkContextsExist(): Promise<void> {
    try {
      const count = await ContextData.countDocuments();
      if (count === 0) {
        console.warn('No contexts found in the database. Context generation will not work.');
        console.warn('Please import context definitions using the scripts/import-contexts.js script.');
      } else {
        console.log(`Found ${count} context definitions in the database.`);
      }
    } catch (error) {
      console.error('Error checking contexts:', error);
    }
  }

  public static getInstance(): ContextService {
    if (!ContextService.instance) {
      ContextService.instance = new ContextService();
    }
    return ContextService.instance;
  }

  /**
   * Refresh the context cache
   */
  private async refreshCache(): Promise<void> {
    try {
      const contexts = await ContextData.find().lean();
      this.contextCache.clear();

      console.log(`Found ${contexts.length} context documents in database`);

      // Process each segmentation field's contexts
      contexts.forEach(contextDoc => {
        const fieldMap = new Map<string, string>();
        
        // Convert the MongoDB Map to a JavaScript Map
        if (contextDoc.contexts) {
          // When using lean(), MongoDB returns a plain object for Map type
          const contextEntries = Object.entries(contextDoc.contexts);
          console.log(`Found ${contextEntries.length} contexts for ${contextDoc.segmentation_field}`);
          
          contextEntries.forEach(([key, value]) => {
            if (typeof value === 'string') {
              fieldMap.set(key, value);
              console.log(`Cached context for ${contextDoc.segmentation_field}:${key}: ${value}`);
            } else {
              console.log(`Skipping non-string context for ${contextDoc.segmentation_field}:${key}: ${typeof value}`);
            }
          });
        } else {
          console.log(`No contexts found for ${contextDoc.segmentation_field}`);
        }
        
        // Store in cache
        this.contextCache.set(contextDoc.segmentation_field, fieldMap);
        console.log(`Cached ${fieldMap.size} contexts for ${contextDoc.segmentation_field}`);
      });

      this.lastCacheRefresh = Date.now();
      console.log(`Context cache refreshed with data for ${this.contextCache.size} segmentation fields.`);
    } catch (error) {
      console.error('Failed to refresh context cache:', error);
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
   * Get context for a specific segmentation field and value
   * @param field The segmentation field
   * @param value The field value
   */
  public async getContext(field: string, value: string): Promise<string | null> {
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
          this.contextCache.set(field, new Map<string, string>());
        }
        
        const fieldMap = this.contextCache.get(field);
        if (fieldMap) {
          fieldMap.set(value, contextValue);
        }
        
        console.log(`Found context for ${field}:${value}: ${contextValue}`);
        return contextValue;
      }
    }

    console.log(`No context found for ${field}:${value}`);
    return null;
  }

  /**
   * Generate a full context description based on user's segmentation data
   * @param segmentation The user's segmentation object
   */
  public async generateFullContext(segmentation: Record<string, any>): Promise<string> {
    try {
      await this.refreshCacheIfNeeded();
      
      const contextParts: string[] = [];
      
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
          console.log(`Found context in database for ${field}:${value}: "${contextValue}"`);
        } else {
          // Try from cache as fallback
          const fieldMap = this.contextCache.get(field);
          if (fieldMap && fieldMap.has(value)) {
            contextValue = fieldMap.get(value);
            console.log(`Found context in cache for ${field}:${value}: "${contextValue}"`);
          } else {
            console.log(`No context found for ${field}:${value}`);
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
    } catch (error) {
      console.error('Error generating full context:', error);
      return ''; // Return empty string on error
    }
  }

  /**
   * Upsert context mappings for a segmentation field
   * @param contextMapping The context mapping to upsert
   */
  public async upsertContextMapping(contextMapping: ContextMapping): Promise<boolean> {
    try {
      await ContextData.updateOne(
        { segmentation_field: contextMapping.segmentation_field },
        { $set: { contexts: contextMapping.contexts } },
        { upsert: true }
      );
      
      // Refresh cache after update
      this.refreshCache();
      return true;
    } catch (error) {
      console.error('Error upserting context mapping:', error);
      return false;
    }
  }
}

export default ContextService.getInstance(); 