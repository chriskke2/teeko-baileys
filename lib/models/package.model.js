"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const config_1 = __importDefault(require("../config"));
const packageSchema = new mongoose_1.default.Schema({
    name: { type: String, required: true },
    text_quota: { type: Number, required: true },
    aud_quota: { type: Number, required: true },
    img_quota: { type: Number, required: true },
    duration_days: { type: Number, required: true }, // Duration in days
}, { timestamps: true });
const PackageData = mongoose_1.default.model('PackageData', packageSchema, config_1.default.mongodb_package_collection);
exports.default = PackageData;
