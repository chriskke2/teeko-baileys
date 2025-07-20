import mongoose from 'mongoose';
import config from './index';

const connectDB = async () => {
  try {
    await mongoose.connect(config.mongodb_uri);
    console.log('Connected to MongoDB!');
  } catch (err) {
    console.error('MongoDB connection error:', err);
    process.exit(1); // Exit process with failure
  }
};

export default connectDB; 