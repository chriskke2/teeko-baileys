import mongoose from 'mongoose';
import config from '../config';

const clientDataSchema = new mongoose.Schema(
  {
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
    session: { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: true }
);

// Remove any unique indexes on fields that don't have values during creation
clientDataSchema.index({ phoneNumber: 1 }, { unique: true, sparse: true });

const ClientData = mongoose.model('ClientData', clientDataSchema, config.mongodb_collection);

export default ClientData; 