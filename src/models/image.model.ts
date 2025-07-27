import mongoose from 'mongoose';
import config from '../config';

const ImageSchema = new mongoose.Schema({
  data: Buffer, // Binary image data
  contentType: String, // e.g., 'image/png'
  filename: String, // Optional: original filename
  name: String // Name for AI reference (e.g., "welcome_banner", "promo_image")
});

const collectionName = config.mongodb_image_collection || 'images';
const ImageModel = mongoose.model('Image', ImageSchema, collectionName);
export default ImageModel; 