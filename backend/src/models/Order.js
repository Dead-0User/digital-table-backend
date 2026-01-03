const mongoose = require("mongoose");

const orderItemSchema = new mongoose.Schema(
  {
    menuItemId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "MenuItem",
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    price: {
      type: Number,
      required: true,
      min: 0.01,
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
      default: 1,
    },
    // UPDATED: Support both string (old) and object (new) addon formats
    addons: {
      type: mongoose.Schema.Types.Mixed,
      default: [],
    },
    specialInstructions: {
      type: String,
      trim: true,
      maxlength: 200,
      default: "",
    },
    isNew: {
      type: Boolean,
      default: false,
    },
    isRemoved: {
      type: Boolean,
      default: false,
    },
    status: {
      type: String,
      enum: ["pending", "preparing", "ready", "served", "cancelled"],
      default: "pending",
    },
  },
  { _id: true }
);

// NEW: Update History Schema
const updateHistorySchema = new mongoose.Schema(
  {
    timestamp: {
      type: Date,
      default: Date.now,
      required: true,
    },
    changeType: {
      type: String,
      enum: [
        "item_added",
        "item_removed",
        "quantity_increased",
        "quantity_decreased",
        "item_modified",
      ],
      required: true,
    },
    itemName: {
      type: String,
      required: true,
    },
    oldQuantity: {
      type: Number,
      default: null,
    },
    newQuantity: {
      type: Number,
      default: null,
    },
    changedBy: {
      type: String,
      enum: ["customer", "staff"],
      required: true,
    },
    details: {
      type: String,
      default: "",
    },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    tableId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Table",
      required: true,
      index: true,
    },
    restaurantId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Restaurant",
      required: true,
      index: true,
    },
    customerName: {
      type: String,
      trim: true,
      maxlength: 100,
      default: "Guest",
    },
    orderType: {
      type: String,
      enum: ["qr", "staff"],
      default: "staff",
      index: true,
    },
    items: {
      type: [orderItemSchema],
      required: true,
      validate: {
        validator: function (items) {
          return items && items.length > 0;
        },
        message: "Order must contain at least one item",
      },
    },
    totalPrice: {
      type: Number,
      required: true,
      min: 0.01,
    },
    specialInstructions: {
      type: String,
      trim: true,
      maxlength: 500,
      default: "",
    },
    status: {
      type: String,
      enum: ["pending", "preparing", "ready", "served", "paid", "cancelled"],
      default: "pending",
      index: true,
    },
    // Payment fields
    paymentMethod: {
      type: String,
      enum: ["upi", "card", "cash", null],
      default: null,
    },
    paymentCompletedAt: {
      type: Date,
      default: null,
    },
    // Update tracking fields
    isUpdated: {
      type: Boolean,
      default: false,
      index: true,
    },
    updateCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    originalItems: {
      type: [orderItemSchema],
      default: [],
    },
    // NEW: Update history and tracking
    updateHistory: {
      type: [updateHistorySchema],
      default: [],
    },
    // NEW: KOT History implementation
    kots: {
      type: [{
        kotNumber: { type: Number, required: true },
        items: [{
          itemId: { type: mongoose.Schema.Types.ObjectId, required: true },
          name: { type: String, required: true },
          quantity: { type: Number, required: true },
          addons: { type: mongoose.Schema.Types.Mixed, default: [] }
        }],
        printedAt: { type: Date, default: Date.now },
        printedBy: { type: String, default: "Staff" }
      }],
      default: []
    },
    // Per-batch status tracking for chef/owner views
    batchStatus: {
      type: Map,
      of: {
        type: String,
        enum: ["pending", "preparing", "ready", "served", "paid", "cancelled"],
        default: "pending",
      },
      default: {},
    },
    lastViewedByRestaurant: {
      type: Date,
      default: null,
    },
    hasUnseenChanges: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound indexes for efficient queries
orderSchema.index({ restaurantId: 1, status: 1, createdAt: -1 });
orderSchema.index({ tableId: 1, createdAt: -1 });
orderSchema.index({ restaurantId: 1, createdAt: -1 });
orderSchema.index({ restaurantId: 1, orderType: 1, createdAt: -1 });
orderSchema.index({ restaurantId: 1, isUpdated: -1, createdAt: -1 });
orderSchema.index({ restaurantId: 1, hasUnseenChanges: -1, createdAt: -1 });

module.exports = mongoose.model("Order", orderSchema);