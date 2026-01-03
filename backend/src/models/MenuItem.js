const mongoose = require("mongoose");

const addonItemSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 50 },
  price: { type: Number, required: true, min: 0, default: 0 }
}, { _id: false });

const addonGroupSchema = new mongoose.Schema({
  title: { 
    type: String, 
    required: true, 
    trim: true, 
    maxlength: 100,
    default: "Add-ons" 
  },
  multiSelect: { 
    type: Boolean, 
    default: false 
  },
  items: [addonItemSchema]
}, { _id: true });

const menuItemSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 100 },
  description: { type: String, required: true, maxlength: 500 },
  price: { type: Number, required: true, min: 0.01 },
  isVeg: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },
  image: { type: String },
  
  // New addon groups structure
  addonGroups: [addonGroupSchema],
  
  // Keep old addons for backward compatibility (will be migrated)
  addons: [{
    name: { type: String, trim: true, maxlength: 50 },
    price: { type: Number, min: 0, default: 0 }
  }],
  
  sequence: {
    type: Number,
    default: 0
  },
  
  sectionId: { type: mongoose.Schema.Types.ObjectId, ref: "Section", required: true },
  restaurantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Restaurant",
    required: true
  }
}, { timestamps: true });

menuItemSchema.index({ sectionId: 1, sequence: 1 });
menuItemSchema.index({ restaurantId: 1, isActive: 1 });

module.exports = mongoose.model("MenuItem", menuItemSchema);