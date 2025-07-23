import mongoose from 'mongoose';
import config from '../config';

// Define the schema for validation object
const validationSchema = new mongoose.Schema({
  type: { type: String, required: true },
  error_message: { type: String, required: true },
  suggestion: { type: String }
}, { _id: false });

// Define schema for option object
const optionSchema = new mongoose.Schema({
  value: { type: String, required: true },
  display: { type: String },
  aliases: { type: [String] },
  mapping: { type: String }
}, { _id: false });

// Define the main predefined message schema
const predefinedSchema = new mongoose.Schema({
  type: { type: String, required: true },
  field: { type: String, required: true },
  message: { type: String, required: true },
  validation: [validationSchema],
  options: { 
    type: [mongoose.Schema.Types.Mixed], // Can be either string[] or option objects
    validate: {
      validator: function(options: any[]) {
        // Options can be either string array or option objects with value property
        return !options.length || options.every(opt => 
          typeof opt === 'string' || 
          (typeof opt === 'object' && opt !== null && opt.value)
        );
      },
      message: "Options must be either strings or objects with 'value' property"
    }
  }
}, { timestamps: true });

// Compound index to ensure uniqueness of type+field combination
predefinedSchema.index({ type: 1, field: 1 }, { unique: true });

const PredefinedData = mongoose.model('PredefinedData', predefinedSchema, config.mongodb_predefined_collection);

export default PredefinedData; 