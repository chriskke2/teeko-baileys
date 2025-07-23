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

async function checkSegmentationData() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

    const UserCollection = mongoose.model('UserData', userSchema, MONGODB_USER_COLLECTION);
    
    // Find users with segmentation data
    const users = await UserCollection.find({ "segmentation": { $exists: true } });
    
    console.log(`Found ${users.length} users with segmentation field`);
    
    // Display segmentation data for each user
    users.forEach(user => {
      console.log(`\n--- User: ${user.wa_num} (${user.status}) ---`);
      console.log(`Legacy gender field: ${user.gender || 'not set'}`);
      
      if (user.segmentation) {
        console.log('Segmentation data:');
        console.log(`- Gender: ${user.segmentation.gender || 'not set'}`);
        console.log(`- Country: ${user.segmentation.country || 'not set'}`);
      } else {
        console.log('No segmentation data');
      }
    });
    
    // Find users without any segmentation data
    const usersWithoutSegmentation = await UserCollection.find({ 
      $or: [
        { "segmentation": { $exists: false } },
        { "segmentation": null }
      ]
    });
    
    console.log(`\n${usersWithoutSegmentation.length} users without segmentation data`);
    
  } catch (error) {
    console.error('Script failed:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  }
}

checkSegmentationData(); 