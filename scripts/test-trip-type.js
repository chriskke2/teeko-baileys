#!/usr/bin/env node
require('dotenv').config({ path: '.env.local' });
const mongoose = require('mongoose');

// Connect to MongoDB
const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_PREDEFINED_COLLECTION = process.env.MONGODB_PREDEFINED_COLLECTION || 'predefined_messages';

if (!MONGODB_URI) {
  console.error('MONGODB_URI environment variable is required');
  process.exit(1);
}

// Define predefined message schema
const predefinedSchema = new mongoose.Schema(
  {
    type: String,
    field: String,
    message: String,
    sequence: Number,
    options: mongoose.Schema.Types.Mixed,
    metadata: mongoose.Schema.Types.Mixed
  },
  { timestamps: true, strict: false }
);

async function testTripTypeMessage() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

    const PredefinedCollection = mongoose.model('PredefinedData', predefinedSchema, MONGODB_PREDEFINED_COLLECTION);
    
    // Find the trip_type message
    const tripTypeMessage = await PredefinedCollection.findOne({ 
      type: 'onboarding', 
      field: 'trip_type' 
    });
    
    if (tripTypeMessage) {
      console.log('Found trip_type message:');
      console.log(JSON.stringify(tripTypeMessage, null, 2));
      
      // Check sequence
      console.log(`\nSequence: ${tripTypeMessage.sequence}`);
      
      // Check options
      if (tripTypeMessage.options && tripTypeMessage.options.length > 0) {
        console.log('\nOptions:');
        tripTypeMessage.options.forEach((option, index) => {
          if (typeof option === 'string') {
            console.log(`${index + 1}. ${option}`);
          } else {
            console.log(`${index + 1}. ${option.display} (value: ${option.value})`);
          }
        });
      }
      
      // Check if previous step exists
      const previousStep = await PredefinedCollection.findOne({ 
        type: 'onboarding', 
        sequence: { $lt: tripTypeMessage.sequence } 
      }).sort({ sequence: -1 });
      
      if (previousStep) {
        console.log(`\nPrevious step: ${previousStep.field} (sequence ${previousStep.sequence})`);
      } else {
        console.log('\nNo previous step found.');
      }
      
      // Check if next step exists
      const nextStep = await PredefinedCollection.findOne({ 
        type: 'onboarding', 
        sequence: { $gt: tripTypeMessage.sequence } 
      }).sort({ sequence: 1 });
      
      if (nextStep) {
        console.log(`Next step: ${nextStep.field} (sequence ${nextStep.sequence})`);
      } else {
        console.log('No next step found. This is the last step.');
      }
    } else {
      console.log('Trip type message not found. Please upsert it first using the manage-predefined-messages script:');
      console.log('npm run messages upsert --file ./scripts/messages/trip_type.json');
    }
  } catch (error) {
    console.error('Script failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  }
}

testTripTypeMessage(); 