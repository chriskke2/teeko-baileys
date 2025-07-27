// scripts/upload-image.js
import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import ImageModelModule from '../lib/models/image.model.js';
console.log('ImageModelModule:', ImageModelModule);
let ImageModel = ImageModelModule.default || ImageModelModule;
console.log('ImageModel:', ImageModel);

async function uploadImage(filePath, imageName) {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/yourdb');

  const img = fs.readFileSync(filePath);
  const ext = path.extname(filePath).toLowerCase();
  let contentType = 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';
  if (ext === '.webp') contentType = 'image/webp';

  const imageDoc = new ImageModel({
    data: img,
    contentType,
    filename: path.basename(filePath),
    name: imageName || path.basename(filePath, path.extname(filePath)) // Use filename without extension as default name
  });

  await imageDoc.save();
  console.log('Image saved with ID:', imageDoc._id, 'and name:', imageDoc.name);

  await mongoose.disconnect();
}

// Usage: node scripts/upload-image.js path/to/image.png [image_name]
const filePath = process.argv[2];
const imageName = process.argv[3]; // Optional name parameter

if (!filePath) {
  console.error('Usage: node scripts/upload-image.js path/to/image.png [image_name]');
  console.error('Example: node scripts/upload-image.js C:\\Users\\chris\\Pictures\\test.png "welcome_banner"');
  process.exit(1);
}

uploadImage(filePath, imageName); 