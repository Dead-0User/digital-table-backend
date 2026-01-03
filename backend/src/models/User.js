const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  // User personal information
  name: {
    type: String,
    required: true,
    trim: true,
  },

  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  },

  password: {
    type: String,
    required: true,
  },

  // OTP Fields for Password Reset
  otp: {
    type: String,
    default: null,
  },

  otpExpires: {
    type: Date,
    default: null,
  },

  // User metadata
  createdAt: {
    type: Date,
    default: Date.now,
  },

  lastLogin: {
    type: Date,
    default: null,
  },
});

// ============================================
// OTP METHODS
// ============================================

/**
 * Generate a 6-digit OTP for password reset
 */
userSchema.methods.generateOTP = function () {
  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  this.otp = otp;
  this.otpExpires = Date.now() + 5 * 60 * 1000; // 5 minutes
  return otp;
};

/**
 * Verify if the provided OTP is valid
 */
userSchema.methods.verifyOTP = function (candidateOTP) {
  if (!this.otp || !this.otpExpires) {
    return { valid: false, message: "No OTP found" };
  }

  if (Date.now() > this.otpExpires) {
    return { valid: false, message: "OTP has expired" };
  }

  if (this.otp !== candidateOTP) {
    return { valid: false, message: "Invalid OTP" };
  }

  return { valid: true, message: "OTP verified successfully" };
};

/**
 * Clear OTP after successful verification or expiry
 */
userSchema.methods.clearOTP = function () {
  this.otp = null;
  this.otpExpires = null;
};

module.exports = mongoose.model("User", userSchema);