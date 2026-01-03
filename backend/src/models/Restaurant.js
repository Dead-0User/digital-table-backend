const mongoose = require("mongoose");

const restaurantSchema = new mongoose.Schema({
  // Reference to the user who owns this restaurant
  ownerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
    index: true, // For fast lookups
  },

  restaurantName: {
    type: String,
    required: true,
    trim: true,
  },

  logo: {
    type: String,
    default: null,
  },

  currency: {
    type: String,
    default: "INR",
    enum: [
      "USD", "EUR", "GBP", "INR", "AED", "AUD",
      "CAD", "SGD", "JPY", "CNY",
    ],
  },

  googleMapsUrl: {
    type: String,
    default: "",
    trim: true,
  },

  operationalHours: {
    type: String,
    default: "Mon-Sun: 9:00 AM - 10:00 PM",
  },

  address: {
    type: String,
    default: "",
    trim: true,
  },

  fssai: {
    type: String,
    default: "",
    trim: true,
  },

  gstNo: {
    type: String,
    default: "",
    trim: true,
  },

  receiptFooter: {
    type: String,
    default: "Thank You Visit Again",
    trim: true,
  },

  taxes: [{
    name: {
      type: String,
      required: true,
      trim: true
    },
    rate: {
      type: Number,
      required: true,
      min: 0,
      max: 100
    }
  }],

  templateStyle: {
    type: String,
    enum: ["classic", "modern", "minimal", "TemplateBurgerBooch"],
    default: "classic",
  },

  // For future features
  isActive: {
    type: Boolean,
    default: true,
  },

  createdAt: {
    type: Date,
    default: Date.now,
  },

  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// Update the updatedAt timestamp before saving
restaurantSchema.pre("save", function (next) {
  this.updatedAt = Date.now();
  next();
});

// Index for efficient queries
restaurantSchema.index({ ownerId: 1, isActive: 1 });

module.exports = mongoose.model("Restaurant", restaurantSchema);