import mongoose from 'mongoose';
import config from '../config';

const userSchema = new mongoose.Schema(
  {
    wa_num: { type: Number, required: true, unique: true },
    package_id: { type: String, required: true },
    code: { type: String, required: true, length: 6 },
    status: { type: String, required: true, enum: ['PENDING_ACTIVATION', 'ONBOARDING', 'EXPIRED'], default: 'PENDING_ACTIVATION' },
    gender: { type: String, enum: ['male', 'female', 'not_specified'], default: 'not_specified' },
    text_quota: { type: Number, default: 0 },
    aud_quota: { type: Number, default: 0 },
    img_quota: { type: Number, default: 0 },
    subscription_start: { type: Date },
    subscription_end: { type: Date },
  },
  { timestamps: true }
);

const UserData = mongoose.model('UserData', userSchema, config.mongodb_user_collection);

export default UserData; 