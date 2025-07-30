// scripts/list-images.js
import mongoose from 'mongoose';
import ImageModelModule from '../lib/models/image.model.js';

let ImageModel = ImageModelModule.default || ImageModelModule;

async function listImages() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/yourdb');
    
    const images = await ImageModel.find({}, '_id name filename contentType createdAt');
    
    console.log('\n=== Available Images ===');
    if (images.length === 0) {
      console.log('No images found in database.');
    } else {
      images.forEach((image, index) => {
        console.log(`${index + 1}. ID: ${image._id}`);
        console.log(`   Name: ${image.name || 'N/A'}`);
        console.log(`   Filename: ${image.filename || 'N/A'}`);
        console.log(`   Type: ${image.contentType || 'N/A'}`);
        console.log(`   Created: ${image.createdAt || 'N/A'}`);
        console.log('');
      });
    }
    
    await mongoose.disconnect();
  } catch (error) {
    console.error('Error listing images:', error);
    process.exit(1);
  }
}

listImages(); 