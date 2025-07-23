#!/usr/bin/env node
require('dotenv').config({ path: '.env.local' });
const mongoose = require('mongoose');

// Connect to MongoDB
const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_USER_COLLECTION = process.env.MONGODB_USER_COLLECTION || 'users';
const MONGODB_PREDEFINED_COLLECTION = process.env.MONGODB_PREDEFINED_COLLECTION || 'predefined_messages';

if (!MONGODB_URI) {
  console.error('MONGODB_URI environment variable is required');
  process.exit(1);
}

// Define schemas
const segmentationSchema = new mongoose.Schema({
  gender: String,
  country: String,
  trip_type: String
}, { _id: false, strict: false });

const userSchema = new mongoose.Schema(
  {
    wa_num: Number,
    status: String,
    current_step: String,
    segmentation: segmentationSchema
  },
  { timestamps: true, strict: false }
);

const predefinedSchema = new mongoose.Schema(
  {
    type: String,
    field: String,
    sequence: Number,
    metadata: {
      user_field: String
    }
  },
  { strict: false }
);

async function fixOnboardingSteps() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

    const UserCollection = mongoose.model('UserData', userSchema, MONGODB_USER_COLLECTION);
    const PredefinedCollection = mongoose.model('PredefinedData', predefinedSchema, MONGODB_PREDEFINED_COLLECTION);
    
    // Get all onboarding messages
    const onboardingSteps = await PredefinedCollection.find({ type: 'onboarding' }).sort({ sequence: 1 });
    
    if (!onboardingSteps.length) {
      console.log('No onboarding steps found in the database');
      return;
    }

    console.log(`Found ${onboardingSteps.length} onboarding steps`);
    
    // Get all ONBOARDING users
    const onboardingUsers = await UserCollection.find({ status: 'ONBOARDING' });
    console.log(`Found ${onboardingUsers.length} users in ONBOARDING state`);
    
    let updatedCount = 0;
    
    for (const user of onboardingUsers) {
      // Determine which step the user should be on
      let currentStepField = null;
      
      for (const step of onboardingSteps) {
        const fieldName = step.metadata?.user_field;
        if (!fieldName) continue;
        
        const segmentValue = user.segmentation && user.segmentation[fieldName];
        
        if (!segmentValue || segmentValue === null) {
          currentStepField = step.field;
          break;
        }
      }
      
      // If all steps are completed, user should be ACTIVE
      if (!currentStepField) {
        console.log(`User ${user.wa_num} has completed all onboarding steps, setting to ACTIVE`);
        await UserCollection.updateOne(
          { _id: user._id },
          { status: 'ACTIVE', current_step: null }
        );
        updatedCount++;
      }
      // If current_step doesn't match determined step, update it
      else if (user.current_step !== currentStepField) {
        console.log(`Updating user ${user.wa_num} current_step from ${user.current_step || 'none'} to ${currentStepField}`);
        await UserCollection.updateOne(
          { _id: user._id },
          { current_step: currentStepField }
        );
        updatedCount++;
      }
    }
    
    console.log(`Updated ${updatedCount} users`);
    
  } catch (error) {
    console.error('Script failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

fixOnboardingSteps(); 