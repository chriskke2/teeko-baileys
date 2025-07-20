"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = __importDefault(require("mongoose"));
const clientDataSchema = new mongoose_1.default.Schema({
    clientId: { type: String, required: true, unique: true },
    status: { type: String, required: true },
    profileName: { type: String },
    phoneNumber: { type: String },
    webhookUrl: { type: String, default: null },
    session: { type: mongoose_1.default.Schema.Types.Mixed },
}, { timestamps: true });
const ClientData = mongoose_1.default.model('ClientData', clientDataSchema, 'clients');
exports.default = ClientData;
