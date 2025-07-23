require('dotenv').config();
const mongoose = require('mongoose');

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
  
  console.log(`Looking up context for ${field}:${value}`);
  console.log('Context data found:', contextData ? 'yes' : 'no');
  
  if (contextData && contextData.contexts) {
    console.log(`Available values for ${field}:`, Object.keys(contextData.contexts));
    
    if (contextData.contexts[value]) {
      console.log(`Found context for ${field}:${value}:`, contextData.contexts[value]);
      
      // Update cache
      if (!contextCache.has(field)) {
        contextCache.set(field, {});
      }
      
      const fieldContexts = contextCache.get(field);
      fieldContexts[value] = contextData.contexts[value];
      
      return contextData.contexts[value];
    } else {
      console.log(`No context found for ${field}:${value}`);
    }
  } else {
    console.log(`No contexts found for field ${field}`);
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
  
  console.log('Generating context for segmentation:', segmentation);
  
  // Process each segmentation field
  for (const [field, value] of Object.entries(segmentation)) {
    // Skip null or undefined values
    if (value === null || value === undefined) {
      console.log(`Skipping ${field} because value is null or undefined`);
      continue;
    }
    
    console.log(`Processing ${field}:${value}`);
    const context = await getContext(contextCache, field, value.toString());
    if (context) {
      contextParts.push(context);
      console.log(`Added context for ${field}:${value}`);
    } else {
      console.log(`No context found for ${field}:${value}`);
    }
  }
  
  // Join all context parts with spaces
  const fullContext = contextParts.join(' ');
  console.log('Generated full context:', fullContext);
  return fullContext;
}

/**
 * Test context generation for a specific user
 */
async function testContextGeneration(userId) {
  try {
    // Load all contexts into cache
    const contextCache = new Map();
    const contexts = await ContextData.find().lean();
    
    console.log(`Found ${contexts.length} context definitions in database`);
    
    contexts.forEach(contextDoc => {
      contextCache.set(contextDoc.segmentation_field, contextDoc.contexts || {});
      console.log(`Cached contexts for ${contextDoc.segmentation_field}:`, Object.keys(contextDoc.contexts || {}));
    });
    
    // Find user
    const user = userId 
      ? await UserData.findById(userId).lean()
      : await UserData.findOne({ status: 'ACTIVE', segmentation: { $exists: true } }).lean();
    
    if (!user) {
      console.error('No active user with segmentation data found');
      return;
    }
    
    console.log(`Testing context generation for user ${user.wa_num}`);
    console.log('User segmentation:', user.segmentation);
    
    // Generate context
    if (user.segmentation) {
      const context = await generateFullContext(contextCache, user.segmentation);
      
      console.log('Generated context:', context);
      
      // Update user with generated context
      await UserData.updateOne(
        { _id: user._id },
        { $set: { context } }
      );
      
      console.log(`Updated user ${user.wa_num} with context`);
    } else {
      console.log('User has no segmentation data');
    }
  } catch (error) {
    console.error('Error testing context generation:', error);
  } finally {
    // Close MongoDB connection
    mongoose.connection.close();
    console.log('MongoDB connection closed');
  }
}

// Get user ID from command line arguments
const args = process.argv.slice(2);
const userId = args.length > 0 ? args[0] : null;

// Run the test
testContextGeneration(userId); 