"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const config_1 = __importDefault(require("../config"));
// Define the segmentation schema
const segmentationSchema = new mongoose_1.default.Schema({
    gender: { type: String, enum: ['male', 'female', 'other'], default: null },
    country: { type: String, enum: ['malaysian', 'foreigner'], default: null },
    trip_type: { type: String, enum: ['holiday', 'business', 'transit'], default: null },
    travel_style: { type: String, enum: ['chill', 'see_do', 'hidden_gems', 'adventure', 'photos', 'culture'], default: null },
    social_type: { type: String, enum: ['solo', 'couple', 'group'], default: null },
}, { _id: false });
const userSchema = new mongoose_1.default.Schema({
    wa_num: { type: Number, required: true, unique: true },
    package_id: { type: String, required: true },
    code: { type: String, required: true, length: 6 },
    status: { type: String, required: true, enum: ['PENDING_ACTIVATION', 'ONBOARDING', 'ACTIVE', 'EXPIRED'], default: 'PENDING_ACTIVATION' },
    // Keep gender field for backward compatibility but mark as deprecated
    gender: { type: String, enum: ['male', 'female', 'not_specified'], default: 'not_specified' },
    // Add segmentation object to store user segmentation data
    segmentation: { type: segmentationSchema, default: () => ({}) },
    // Track the current onboarding step
    current_step: { type: String, default: null },
    text_quota: { type: Number, default: 0 },
    aud_quota: { type: Number, default: 0 },
    img_quota: { type: Number, default: 0 },
    subscription_start: { type: Date },
    subscription_end: { type: Date },
}, { timestamps: true });
const UserData = mongoose_1.default.model('UserData', userSchema, config_1.default.mongodb_user_collection);
exports.default = UserData;
