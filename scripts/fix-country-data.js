#!/usr/bin/env node
require('dotenv').config({ path: '.env.local' });
const mongoose = require('mongoose');

// Connect to MongoDB
const MONGODB_URI = process.env.MONGODB_URI;
const MONGODB_USER_COLLECTION = process.env.MONGODB_USER_COLLECTION || 'users';

if (!MONGODB_URI) {
  console.error('MONGODB_URI environment variable is required');
  process.exit(1);
}

// Define user schema (simplified version of what's in the model)
const userSchema = new mongoose.Schema(
  {
    wa_num: Number,
    segmentation: mongoose.Schema.Types.Mixed // Use Mixed type to allow any structure
  },
  { timestamps: true, strict: false }
);

async function fixCountryData() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

    const UserCollection = mongoose.model('UserData', userSchema, MONGODB_USER_COLLECTION);
    
    // Find users with nationality in segmentation but no country
    const users = await UserCollection.find({
      "segmentation.nationality": { $exists: true },
      "segmentation.country": { $exists: false }
    });
    
    console.log(`Found ${users.length} users with nationality field but no country field`);
    let fixedCount = 0;

    for (const user of users) {
      const nationality = user.segmentation?.nationality;
      
      if (nationality) {
        // Copy nationality value to country
        await UserCollection.updateOne(
          { _id: user._id }, 
          { $set: { "segmentation.country": nationality } }
        );
        fixedCount++;
        console.log(`Fixed user ${user.wa_num}: nationality "${nationality}" → country "${nationality}"`);
      }
    }
    
    console.log(`Fixed ${fixedCount} users.`);
    
    // Also check for users with country data already
    const usersWithCountry = await UserCollection.find({
      "segmentation.country": { $exists: true }
    });
    
    console.log(`${usersWithCountry.length} users already have country data.`);
    
  } catch (error) {
    console.error('Script failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

fixCountryData(); 