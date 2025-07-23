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
  country: String
}, { _id: false, strict: false });

const userSchema = new mongoose.Schema(
  {
    wa_num: Number,
    status: String,
    gender: String,
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
  { timestamps: true, strict: false }
);

async function updateToActiveStatus() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

    const UserCollection = mongoose.model('UserData', userSchema, MONGODB_USER_COLLECTION);
    const PredefinedCollection = mongoose.model('PredefinedData', predefinedSchema, MONGODB_PREDEFINED_COLLECTION);
    
    // Get all onboarding fields from predefined messages
    const onboardingMessages = await PredefinedCollection.find({ type: 'onboarding' }).lean();
    const requiredFields = onboardingMessages
      .filter(msg => msg.metadata && msg.metadata.user_field)
      .map(msg => msg.metadata.user_field);
    
    console.log(`Found ${requiredFields.length} onboarding fields: ${requiredFields.join(', ')}`);
    
    // Find users with ONBOARDING status
    const onboardingUsers = await UserCollection.find({ status: 'ONBOARDING' });
    
    console.log(`Found ${onboardingUsers.length} users with ONBOARDING status`);
    let updatedCount = 0;

    for (const user of onboardingUsers) {
      // Check if all required fields are completed
      let allFieldsCompleted = true;
      
      for (const field of requiredFields) {
        // Check in both legacy fields and segmentation
        const legacyValue = user[field];
        const segmentValue = user.segmentation && user.segmentation[field];
        
        if (
          (!segmentValue || segmentValue === null) && 
          (!legacyValue || legacyValue === 'not_specified')
        ) {
          allFieldsCompleted = false;
          break;
        }
      }
      
      // If all fields are completed, update to ACTIVE
      if (allFieldsCompleted) {
        await UserCollection.updateOne({ _id: user._id }, { status: 'ACTIVE' });
        updatedCount++;
        console.log(`Updated user ${user.wa_num} from ONBOARDING to ACTIVE status`);
      }
    }
    
    console.log(`Migration completed. ${updatedCount} users updated to ACTIVE status.`);
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

updateToActiveStatus(); 