"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const config_1 = __importDefault(require("../config"));
const userSchema = new mongoose_1.default.Schema({
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
}, { timestamps: true });
const UserData = mongoose_1.default.model('UserData', userSchema, config_1.default.mongodb_user_collection);
exports.default = UserData;
