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

/**
 * Check the context collection structure
 */
async function checkContextCollection() {
  try {
    // Get collection name
    const collectionName = process.env.MONGODB_CONTEXT_COLLECTION || 'contexts';
    console.log(`Checking context collection: ${collectionName}`);
    
    // Check if collection exists
    const collections = await mongoose.connection.db.listCollections({ name: collectionName }).toArray();
    if (collections.length === 0) {
      console.error(`Collection ${collectionName} does not exist`);
      return;
    }
    
    console.log(`Collection ${collectionName} exists`);
    
    // Get all documents in the collection
    const contexts = await ContextData.find().lean();
    console.log(`Found ${contexts.length} context documents`);
    
    // Check each document
    contexts.forEach(context => {
      console.log(`\nDocument for segmentation_field: ${context.segmentation_field}`);
      console.log('Document structure:', JSON.stringify(context, null, 2));
      
      if (context.contexts) {
        console.log('Contexts type:', typeof context.contexts);
        console.log('Contexts instanceof Map:', context.contexts instanceof Map);
        console.log('Contexts keys:', Object.keys(context.contexts));
        
        // Check each context value
        Object.entries(context.contexts).forEach(([key, value]) => {
          console.log(`Context ${key}:`, value);
          console.log(`Type of ${key}:`, typeof value);
        });
      } else {
        console.log('No contexts field found');
      }
    });
    
    // Check raw MongoDB documents
    const rawContexts = await mongoose.connection.db.collection(collectionName).find().toArray();
    console.log(`\nFound ${rawContexts.length} raw context documents`);
    
    rawContexts.forEach(context => {
      console.log(`\nRaw document for segmentation_field: ${context.segmentation_field}`);
      console.log('Raw document structure:', JSON.stringify(context, null, 2));
    });
  } catch (error) {
    console.error('Error checking context collection:', error);
  } finally {
    // Close MongoDB connection
    mongoose.connection.close();
    console.log('MongoDB connection closed');
  }
}

// Run the check
checkContextCollection();  