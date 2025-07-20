import mongoose from 'mongoose';
import config from '../config';

const packageSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    text_quota: { type: Number, required: true },
    aud_quota: { type: Number, required: true },
    img_quota: { type: Number, required: true },
    duration_days: { type: Number, required: true }, // Duration in days
  },
  { timestamps: true }
);

const PackageData = mongoose.model('PackageData', packageSchema, config.mongodb_package_collection);

export default PackageData; 