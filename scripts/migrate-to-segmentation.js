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
    gender: String,
    segmentation: {
      gender: String,
      country: String
    }
  },
  { timestamps: true, strict: false }
);

async function migrateToSegmentation() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

    const UserCollection = mongoose.model('UserData', userSchema, MONGODB_USER_COLLECTION);
    
    // Find all users without segmentation field
    const users = await UserCollection.find({});
    
    console.log(`Found ${users.length} users to check for migration`);
    let migratedCount = 0;

    for (const user of users) {
      const updateData = { segmentation: {} };
      let needsUpdate = false;
      
      // Check if user has gender but segmentation doesn't
      if (user.gender && (!user.segmentation || !user.segmentation.gender)) {
        updateData.segmentation.gender = user.gender === 'not_specified' ? null : user.gender;
        needsUpdate = true;
      }
      
      // Check if user has nationality but segmentation doesn't have country
      if (user.nationality && (!user.segmentation || !user.segmentation.country)) {
        updateData.segmentation.country = user.nationality;
        needsUpdate = true;
      }
      
      if (needsUpdate) {
        await UserCollection.updateOne({ _id: user._id }, { $set: updateData });
        migratedCount++;
        console.log(`Migrated user ${user.wa_num}`);
      }
    }
    
    console.log(`Migration completed. ${migratedCount} users updated.`);
  } catch (error) {
    console.error('Migration failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

migrateToSegmentation(); 