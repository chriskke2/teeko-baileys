"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const path_1 = __importDefault(require("path"));
const env = process.env.NODE_ENV || 'local';
const envPath = path_1.default.resolve(__dirname, `../../.env.${env}`);
console.log(`Loading environment variables from: ${envPath}`);
require('dotenv').config({ path: envPath });
if (!process.env.MONGODB_URI) {
    throw new Error('Missing MONGODB_URI environment variable. Please check your .env file.');
}
if (!process.env.JWTKEY) {
    throw new Error('Missing JWTKEY environment variable. Please check your .env file.');
}
const config = {
    port: process.env.PORT || 3000,
    mongodb_uri: process.env.MONGODB_URI,
    jwt_key: process.env.JWTKEY,
};
exports.default = config;
