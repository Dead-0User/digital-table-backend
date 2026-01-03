const mongoose = require("mongoose");

const staffSchema = new mongoose.Schema({
  restaurantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Restaurant",
    required: true,
    index: true
  },
  username: {
    type: String,
    required: true,
    trim: true,
    minlength: 3,
    maxlength: 50
  },
  password: {
    type: String,
    required: true
  },
  fullName: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  role: {
    type: String,
    enum: ["waiter", "chef", "manager", "cashier"],
    required: true,
    index: true
  },
  email: {
    type: String,
    trim: true,
    lowercase: true,
    default: null
  },
  phone: {
    type: String,
    trim: true,
    default: null
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  // Shift and scheduling
  shift: {
    type: String,
    enum: ["morning", "afternoon", "evening", "night", "flexible"],
    default: "flexible"
  },
  // Performance tracking (for manager dashboard)
  stats: {
    ordersHandled: { type: Number, default: 0 },
    totalRevenue: { type: Number, default: 0 },
    averageRating: { type: Number, default: 0 }
  },
  lastLogin: {
    type: Date,
    default: null
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true
  }
}, {
  timestamps: true
});

// Compound index for unique username per restaurant
staffSchema.index({ restaurantId: 1, username: 1 }, { unique: true });

// Index for efficient role-based queries
staffSchema.index({ restaurantId: 1, role: 1, isActive: 1 });

module.exports = mongoose.model("Staff", staffSchema);