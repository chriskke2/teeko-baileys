require('dotenv').config();
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => {
  console.log('Connected to MongoDB');
}).catch(err => {
  console.error('MongoDB connection error:', err);
  process.exit(1);
});

// Define the Context schema
const contextSchema = new mongoose.Schema({
  segmentation_field: { type: String, required: true, unique: true },
  contexts: {
    type: Map,
    of: String,
    default: new Map()
  }
}, { timestamps: true });

// Create the context model
const ContextData = mongoose.model('ContextData', contextSchema, 
  process.env.MONGODB_CONTEXT_COLLECTION || 'contexts');

// Define the segmentation schema
const segmentationSchema = new mongoose.Schema({
  gender: { type: String, enum: ['male', 'female', 'other'], default: null },
  country: { type: String, enum: ['malaysian', 'foreigner'], default: null },
  trip_type: { type: String, enum: ['holiday', 'business', 'transit'], default: null },
  travel_style: { type: String, enum: ['chill', 'see_do', 'hidden_gems', 'adventure', 'photos', 'culture'], default: null },
  social_type: { type: String, enum: ['solo', 'couple', 'group'], default: null },
}, { _id: false });

// Define the user schema
const userSchema = new mongoose.Schema(
  {
    wa_num: { type: Number, required: true, unique: true },
    status: { type: String, required: true, enum: ['PENDING_ACTIVATION', 'ONBOARDING', 'ACTIVE', 'EXPIRED'] },
    segmentation: { type: segmentationSchema },
    context: { type: String, default: '' },
  },
  { timestamps: true }
);

// Create the user model
const UserData = mongoose.model('UserData', userSchema, 
  process.env.MONGODB_USER_COLLECTION || 'users');

/**
 * Get context for a specific segmentation field and value
 * @param {Map<string, Object>} contextCache The context cache
 * @param {string} field The segmentation field
 * @param {string} value The field value
 */
async function getContext(contextCache, field, value) {
  // Try to get from cache
  if (contextCache.has(field) && contextCache.get(field)[value]) {
    return contextCache.get(field)[value];
  }

  // If not in cache, try from database
  const contextData = await ContextData.findOne({ 
    segmentation_field: field
  }).lean();
  
  if (contextData && contextData.contexts && contextData.contexts[value]) {
    // Update cache
    if (!contextCache.has(field)) {
      contextCache.set(field, {});
    }
    
    const fieldContexts = contextCache.get(field);
    fieldContexts[value] = contextData.contexts[value];
    
    return contextData.contexts[value];
  }

  return null;
}

/**
 * Generate a full context description based on user's segmentation data
 * @param {Map<string, Object>} contextCache The context cache
 * @param {Object} segmentation The user's segmentation object
 */
async function generateFullContext(contextCache, segmentation) {
  const contextParts = [];
  
  // Process each segmentation field
  for (const [field, value] of Object.entries(segmentation)) {
    // Skip null or undefined values
    if (value === null || value === undefined) {
      continue;
    }
    
    const context = await getContext(contextCache, field, value.toString());
    if (context) {
      contextParts.push(context);
    }
  }
  
  // Join all context parts with spaces
  return contextParts.join(' ');
}

/**
 * Update all active users with context
 */
async function updateUserContexts() {
  try {
    // Load all contexts into cache
    const contextCache = new Map();
    const contexts = await ContextData.find().lean();
    
    contexts.forEach(contextDoc => {
      contextCache.set(contextDoc.segmentation_field, contextDoc.contexts || {});
    });
    
    console.log(`Loaded ${contexts.length} segmentation fields with contexts into cache`);
    
    // Find all active users with segmentation data
    const users = await UserData.find({ 
      status: 'ACTIVE',
      segmentation: { $exists: true }
    }).lean();
    
    console.log(`Found ${users.length} active users to update`);
    
    // Update each user with context
    let updatedCount = 0;
    
    for (const user of users) {
      if (!user.segmentation) {
        continue;
      }
      
      const context = await generateFullContext(contextCache, user.segmentation);
      
      if (context) {
        await UserData.updateOne(
          { _id: user._id },
          { $set: { context } }
        );
        
        updatedCount++;
        console.log(`Updated user ${user.wa_num} with context: ${context}`);
      }
    }
    
    console.log(`Updated ${updatedCount} users with context`);
  } catch (error) {
    console.error('Error updating user contexts:', error);
  } finally {
    // Close MongoDB connection
    mongoose.connection.close();
    console.log('MongoDB connection closed');
  }
}

// Run the update
updateUserContexts(); 