"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const config_1 = __importDefault(require("../config"));
const ImageSchema = new mongoose_1.default.Schema({
    data: Buffer, // Binary image data
    contentType: String, // e.g., 'image/png'
    filename: String, // Optional: original filename
    name: String // Name for AI reference (e.g., "welcome_banner", "promo_image")
});
const collectionName = config_1.default.mongodb_image_collection || 'images';
const ImageModel = mongoose_1.default.model('Image', ImageSchema, collectionName);
exports.default = ImageModel;
