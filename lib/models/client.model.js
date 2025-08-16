"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const config_1 = __importDefault(require("../config"));
const clientDataSchema = new mongoose_1.default.Schema({
    status: { type: String, required: true },
    client_type: {
        type: String,
        required: true,
        enum: ['chatbot', 'translate'],
        default: 'chatbot'
    },
    profileName: { type: String },
    phoneNumber: { type: String },
    webhookUrl: { type: String, default: null },
    session: { type: mongoose_1.default.Schema.Types.Mixed },
}, { timestamps: true });
// Remove any unique indexes on fields that don't have values during creation
clientDataSchema.index({ phoneNumber: 1 }, { unique: true, sparse: true });
const ClientData = mongoose_1.default.model('ClientData', clientDataSchema, config_1.default.mongodb_collection);
exports.default = ClientData;
