import mongoose from 'mongoose';

const clientDataSchema = new mongoose.Schema(
  {
    clientId: { type: String, required: true, unique: true },
    status: { type: String, required: true },
    profileName: { type: String },
    phoneNumber: { type: String },
    webhookUrl: { type: String, default: null },
    session: { type: mongoose.Schema.Types.Mixed },
  },
  { timestamps: true }
);

const ClientData = mongoose.model('ClientData', clientDataSchema, 'clients');

export default ClientData; 