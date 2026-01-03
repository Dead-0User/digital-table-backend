const mongoose = require("mongoose");

const sectionSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 50 },
    restaurantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Restaurant',
      required: true,
      index: true
    },
    sequence: {
      type: Number,
      default: 0
    },
    isActive: {
      type: Boolean,
      default: true
    }
  },
  { timestamps: true }
);

// Compound index for efficient queries by restaurant
sectionSchema.index({ restaurantId: 1, isActive: 1 });
sectionSchema.index({ restaurantId: 1, sequence: 1 });

module.exports = mongoose.model("Section", sectionSchema);