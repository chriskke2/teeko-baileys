#!/usr/bin/env node

/**
 * Script to manage predefined messages in the database
 * 
 * Usage:
 * - List all messages: node manage-predefined-messages.js list
 * - Get a specific message: node manage-predefined-messages.js get --type users --field activation
 * - Create/Update a message: node manage-predefined-messages.js upsert --file ./messages/activation.json
 * - Delete a message: node manage-predefined-messages.js delete --type users --field activation
 * - Export all messages: node manage-predefined-messages.js export --output ./backup.json
 * - Import messages: node manage-predefined-messages.js import --file ./backup.json
 */

require('dotenv').config({ path: '.env.local' });
const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');
const { program } = require('commander');

// MongoDB connection
const MONGODB_URI = process.env.MONGODB_URI;
const COLLECTION_NAME = process.env.MONGODB_PREDEFINED_COLLECTION || 'predefined_messages';

if (!MONGODB_URI) {
  console.error('Missing MONGODB_URI environment variable');
  process.exit(1);
}

// Define the schema for the PredefinedData model
const validationSchema = new mongoose.Schema({
  type: { type: String, required: true },
  error_message: { type: String, required: true },
  suggestion: { type: String }
}, { _id: false });

const predefinedSchema = new mongoose.Schema({
  type: { type: String, required: true },
  field: { type: String, required: true },
  message: { type: String, required: true },
  validation: [validationSchema]
}, { timestamps: true });

// Ensure uniqueness of type+field combination
predefinedSchema.index({ type: 1, field: 1 }, { unique: true });

// Create the model
const PredefinedData = mongoose.model('PredefinedData', predefinedSchema, COLLECTION_NAME);

// Connect to MongoDB
async function connectDB() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');
  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  }
}

// List all messages
async function listMessages() {
  try {
    const messages = await PredefinedData.find().lean();
    console.log('\nPredefined Messages:');
    console.log('===================\n');
    
    if (messages.length === 0) {
      console.log('No messages found in the database.');
      return;
    }
    
    // Group by type
    const groupedMessages = messages.reduce((acc, msg) => {
      if (!acc[msg.type]) {
        acc[msg.type] = [];
      }
      acc[msg.type].push(msg);
      return acc;
    }, {});
    
    // Display messages by type
    for (const [type, messages] of Object.entries(groupedMessages)) {
      console.log(`Type: ${type}`);
      console.log('-'.repeat(type.length + 6));
      
      for (const msg of messages) {
        console.log(`  Field: ${msg.field}`);
        console.log(`  Message: ${msg.message.substring(0, 50)}${msg.message.length > 50 ? '...' : ''}`);
        console.log(`  Validations: ${msg.validation ? msg.validation.length : 0}`);
        if (msg.options && msg.options.length > 0) {
          if (typeof msg.options[0] === 'string') {
            console.log(`  Options: ${msg.options.join(', ')}`);
          } else {
            console.log(`  Options: ${msg.options.length} advanced options`);
          }
        }
        console.log(`  Last updated: ${new Date(msg.updatedAt).toLocaleString()}`);
        console.log();
      }
    }
  } catch (error) {
    console.error('Error listing messages:', error);
  }
}

// Get a specific message
async function getMessage(type, field) {
  try {
    const message = await PredefinedData.findOne({ type, field }).lean();
    
    if (!message) {
      console.log(`\nNo message found with type '${type}' and field '${field}'.`);
      return;
    }
    
    console.log('\nMessage Details:');
    console.log('===============\n');
    console.log(`Type: ${message.type}`);
    console.log(`Field: ${message.field}`);
    console.log(`Message:\n${message.message}`);
    
    if (message.options && message.options.length > 0) {
      console.log('\nOptions:');
      message.options.forEach((option, i) => {
        if (typeof option === 'string') {
          console.log(`  [${i + 1}] ${option}`);
        } else {
          console.log(`  [${i + 1}] Value: ${option.value}`);
          if (option.display) console.log(`      Display: ${option.display}`);
          if (option.mapping) console.log(`      Mapping: ${option.mapping}`);
          if (option.aliases && option.aliases.length > 0) {
            console.log(`      Aliases: ${option.aliases.join(', ')}`);
          }
        }
      });
    }
    
    if (message.validation && message.validation.length > 0) {
      console.log('\nValidations:');
      message.validation.forEach((v, i) => {
        console.log(`\n  [${i + 1}] Type: ${v.type}`);
        console.log(`      Error: ${v.error_message}`);
        if (v.suggestion) {
          console.log(`      Suggestion: ${v.suggestion}`);
        }
      });
    }
    
    console.log(`\nCreated: ${new Date(message.createdAt).toLocaleString()}`);
    console.log(`Updated: ${new Date(message.updatedAt).toLocaleString()}`);
  } catch (error) {
    console.error('Error getting message:', error);
  }
}

// Create or update a message from a JSON file
async function upsertMessage(filePath) {
  try {
    // Read the JSON file
    const fullPath = path.resolve(process.cwd(), filePath);
    if (!fs.existsSync(fullPath)) {
      console.error(`File not found: ${fullPath}`);
      return;
    }
    
    const fileContent = fs.readFileSync(fullPath, 'utf8');
    let messageData;
    
    try {
      messageData = JSON.parse(fileContent);
    } catch (parseError) {
      console.error('Error parsing JSON file:', parseError);
      return;
    }
    
    // Validate required fields
    if (!messageData.type || !messageData.field || !messageData.message) {
      console.error('Missing required fields: type, field, and message are required');
      return;
    }
    
    // Check if message already exists
    const existingMessage = await PredefinedData.findOne({
      type: messageData.type,
      field: messageData.field
    });
    
    let result;
    if (existingMessage) {
      // Update existing message
      result = await PredefinedData.findOneAndUpdate(
        { type: messageData.type, field: messageData.field },
        messageData,
        { new: true }
      );
      console.log(`\nMessage updated successfully:\nType: ${result.type}\nField: ${result.field}`);
    } else {
      // Create new message
      result = await PredefinedData.create(messageData);
      console.log(`\nMessage created successfully:\nType: ${result.type}\nField: ${result.field}`);
    }
  } catch (error) {
    console.error('Error upserting message:', error);
  }
}

// Delete a message
async function deleteMessage(type, field) {
  try {
    const result = await PredefinedData.findOneAndDelete({ type, field });
    
    if (!result) {
      console.log(`\nNo message found with type '${type}' and field '${field}'.`);
      return;
    }
    
    console.log(`\nMessage deleted successfully:\nType: ${type}\nField: ${field}`);
  } catch (error) {
    console.error('Error deleting message:', error);
  }
}

// Export all messages to a JSON file
async function exportMessages(outputPath) {
  try {
    const messages = await PredefinedData.find().lean();
    
    if (messages.length === 0) {
      console.log('No messages found in the database.');
      return;
    }
    
    // Clean up MongoDB specific fields
    const cleanedMessages = messages.map(msg => {
      const { _id, __v, createdAt, updatedAt, ...cleanMessage } = msg;
      return cleanMessage;
    });
    
    const fullPath = path.resolve(process.cwd(), outputPath);
    fs.writeFileSync(fullPath, JSON.stringify(cleanedMessages, null, 2));
    
    console.log(`\nExported ${messages.length} messages to ${fullPath}`);
  } catch (error) {
    console.error('Error exporting messages:', error);
  }
}

// Import messages from a JSON file
async function importMessages(filePath) {
  try {
    const fullPath = path.resolve(process.cwd(), filePath);
    if (!fs.existsSync(fullPath)) {
      console.error(`File not found: ${fullPath}`);
      return;
    }
    
    const fileContent = fs.readFileSync(fullPath, 'utf8');
    let messages;
    
    try {
      messages = JSON.parse(fileContent);
    } catch (parseError) {
      console.error('Error parsing JSON file:', parseError);
      return;
    }
    
    if (!Array.isArray(messages)) {
      console.error('Invalid import format. Expected an array of messages.');
      return;
    }
    
    let created = 0;
    let updated = 0;
    let failed = 0;
    
    for (const msg of messages) {
      try {
        // Check for required fields
        if (!msg.type || !msg.field || !msg.message) {
          console.error(`Skipping message with missing required fields: ${JSON.stringify(msg)}`);
          failed++;
          continue;
        }
        
        // Check if message already exists
        const existing = await PredefinedData.findOne({
          type: msg.type,
          field: msg.field
        });
        
        if (existing) {
          // Update
          await PredefinedData.updateOne(
            { type: msg.type, field: msg.field },
            msg
          );
          updated++;
        } else {
          // Create
          await PredefinedData.create(msg);
          created++;
        }
      } catch (error) {
        console.error(`Error processing message: ${JSON.stringify(msg)}`, error);
        failed++;
      }
    }
    
    console.log(`\nImport completed:`);
    console.log(`- Created: ${created} messages`);
    console.log(`- Updated: ${updated} messages`);
    console.log(`- Failed: ${failed} messages`);
  } catch (error) {
    console.error('Error importing messages:', error);
  }
}

// Create a sample template message
async function createTemplate(outputPath) {
  const template = {
    type: "sample_type",
    field: "sample_field",
    message: "This is a sample message template.\n\nYou can use markdown formatting like *bold* or _italic_.\n\nUse {placeholders} that can be replaced when the message is sent.",
    validation: [
      {
        type: "error_type",
        error_message: "This is an error message shown when validation fails.",
        suggestion: "This is an optional suggestion to help resolve the error."
      }
    ],
    options: [
      "Simple Option 1",
      "Simple Option 2",
      {
        "value": "advanced_option",
        "display": "Advanced Option 3",
        "aliases": ["alias1", "alias2"],
        "mapping": "mapped_value"
      }
    ]
  };
  
  const fullPath = path.resolve(process.cwd(), outputPath);
  fs.writeFileSync(fullPath, JSON.stringify(template, null, 2));
  
  console.log(`\nSample template created at ${fullPath}`);
}

// Main program definition
program
  .name('manage-predefined-messages')
  .description('CLI tool to manage predefined messages for Teko chatbot')
  .version('1.0.0');

program
  .command('list')
  .description('List all predefined messages')
  .action(async () => {
    await connectDB();
    await listMessages();
    await mongoose.disconnect();
  });

program
  .command('get')
  .description('Get a specific predefined message')
  .requiredOption('--type <type>', 'Message type (e.g., users)')
  .requiredOption('--field <field>', 'Message field (e.g., activation)')
  .action(async (options) => {
    await connectDB();
    await getMessage(options.type, options.field);
    await mongoose.disconnect();
  });

program
  .command('upsert')
  .description('Create or update a predefined message from a JSON file')
  .requiredOption('--file <path>', 'Path to JSON file containing message data')
  .action(async (options) => {
    await connectDB();
    await upsertMessage(options.file);
    await mongoose.disconnect();
  });

program
  .command('delete')
  .description('Delete a predefined message')
  .requiredOption('--type <type>', 'Message type (e.g., users)')
  .requiredOption('--field <field>', 'Message field (e.g., activation)')
  .action(async (options) => {
    await connectDB();
    await deleteMessage(options.type, options.field);
    await mongoose.disconnect();
  });

program
  .command('export')
  .description('Export all predefined messages to a JSON file')
  .requiredOption('--output <path>', 'Path to output JSON file')
  .action(async (options) => {
    await connectDB();
    await exportMessages(options.output);
    await mongoose.disconnect();
  });

program
  .command('import')
  .description('Import predefined messages from a JSON file')
  .requiredOption('--file <path>', 'Path to JSON file containing messages')
  .action(async (options) => {
    await connectDB();
    await importMessages(options.file);
    await mongoose.disconnect();
  });

program
  .command('template')
  .description('Create a sample template message file')
  .requiredOption('--output <path>', 'Path to output JSON file')
  .action(async (options) => {
    await createTemplate(options.output);
  });

// Parse command line arguments
program.parse(process.argv); 