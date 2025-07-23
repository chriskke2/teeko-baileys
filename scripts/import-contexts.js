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

// Create the model using the environment variable for collection name
const ContextData = mongoose.model('ContextData', contextSchema, 
  process.env.MONGODB_CONTEXT_COLLECTION || 'contexts');

/**
 * Import context definitions from a JSON file
 * @param {string} filePath Path to the JSON file
 */
async function importContexts(filePath) {
  try {
    // Read and parse the JSON file
    const fileContent = fs.readFileSync(filePath, 'utf8');
    const contextData = JSON.parse(fileContent);
    
    console.log(`Importing contexts from ${filePath}...`);
    
    // Check if the JSON has the expected structure
    if (!contextData.segmentation_field || !contextData.contexts) {
      console.error('Invalid format: expected an object with segmentation_field and contexts properties');
      return false;
    }
    
    // Upsert the context data
    await ContextData.updateOne(
      { segmentation_field: contextData.segmentation_field },
      { $set: { contexts: contextData.contexts } },
      { upsert: true }
    );
    
    console.log(`Imported contexts for field: ${contextData.segmentation_field} with ${Object.keys(contextData.contexts).length} values`);
    
    return true;
  } catch (error) {
    console.error(`Error importing contexts from ${filePath}:`, error);
    return false;
  }
}

/**
 * Import all context files from the contexts directory
 */
async function importAllContexts() {
  const contextsDir = path.join(__dirname, 'contexts');
  
  try {
    // Get all JSON files in the contexts directory
    const files = fs.readdirSync(contextsDir)
      .filter(file => file.endsWith('.json'))
      .map(file => path.join(contextsDir, file));
    
    console.log(`Found ${files.length} context files to import`);
    
    // Import each file
    for (const file of files) {
      await importContexts(file);
    }
    
    console.log('All context files imported successfully');
  } catch (error) {
    console.error('Error importing context files:', error);
  } finally {
    // Close MongoDB connection
    mongoose.connection.close();
    console.log('MongoDB connection closed');
  }
}

// Check command line arguments
const args = process.argv.slice(2);
if (args.length > 0) {
  // Import a specific file
  importContexts(args[0]).finally(() => {
    mongoose.connection.close();
    console.log('MongoDB connection closed');
  });
} else {
  // Import all files
  importAllContexts();
} 