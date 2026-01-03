const express = require("express");
const router = express.Router();
const User = require("../models/User");
const Restaurant = require("../models/Restaurant");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { sendOTPEmail } = require("../config/nodemailer");

const JWT_SECRET = process.env.JWT_SECRET || "your_jwt_secret_key";

// Create uploads directory if it doesn't exist
const uploadDir = path.join(__dirname, "..", "uploads", "logos");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure multer for logo uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, "logo-" + uniqueSuffix + ext);
  },
});

const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif|webp/;
  const extname = allowedTypes.test(
    path.extname(file.originalname).toLowerCase()
  );
  const mimetype = allowedTypes.test(file.mimetype);

  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb(new Error("Only image files are allowed!"));
  }
};

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: fileFilter,
});

// ============================================
// ✅ SIGNUP WITH OTP VERIFICATION
// ============================================

/**
 * @route   POST /api/auth/send-signup-otp
 * @desc    Send OTP for email verification during signup
 */
router.post("/send-signup-otp", async (req, res) => {
  const { email, restaurantName } = req.body;

  if (!email || !restaurantName) {
    return res.status(400).json({
      success: false,
      message: "Email and restaurant name are required",
    });
  }

  try {
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "Email is already registered",
      });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpires = Date.now() + 10 * 60 * 1000;

    if (!global.signupOTPs) {
      global.signupOTPs = new Map();
    }

    global.signupOTPs.set(email.toLowerCase(), {
      otp,
      otpExpires,
      restaurantName,
    });

    setTimeout(() => {
      global.signupOTPs.delete(email.toLowerCase());
    }, 10 * 60 * 1000);

    const emailResult = await sendOTPEmail(email, otp, restaurantName);

    if (!emailResult.success) {
      return res.status(500).json({
        success: false,
        message: "Failed to send OTP email. Try again later.",
      });
    }

    res.json({
      success: true,
      message: "OTP sent to your email. Valid for 10 minutes.",
    });
  } catch (err) {
    console.error("Send Signup OTP Error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/**
 * @route   POST /api/auth/verify-signup-otp
 * @desc    Verify OTP before allowing registration
 */
router.post("/verify-signup-otp", async (req, res) => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    return res.status(400).json({
      success: false,
      message: "Email and OTP are required",
    });
  }

  try {
    if (!global.signupOTPs) {
      return res.status(400).json({
        success: false,
        message: "No OTP found. Please request a new one.",
      });
    }

    const storedData = global.signupOTPs.get(email.toLowerCase());

    if (!storedData) {
      return res.status(400).json({
        success: false,
        message: "No OTP found for this email",
      });
    }

    if (Date.now() > storedData.otpExpires) {
      global.signupOTPs.delete(email.toLowerCase());
      return res.status(400).json({
        success: false,
        message: "OTP has expired. Please request a new one.",
      });
    }

    if (storedData.otp !== otp) {
      return res.status(400).json({
        success: false,
        message: "Invalid OTP",
      });
    }

    res.json({
      success: true,
      message: "Email verified successfully. You can now complete signup.",
    });
  } catch (err) {
    console.error("Verify Signup OTP Error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/**
 * @route   POST /api/auth/register
 * @desc    Register a new user and create their first restaurant
 */
router.post("/register", upload.single("logo"), async (req, res) => {
  const { restaurantName, name, email, password, otp } = req.body;

  if (!restaurantName || !name || !email || !password || !otp) {
    if (req.file) {
      fs.unlinkSync(req.file.path);
    }
    return res.status(400).json({
      success: false,
      message: "All fields including OTP are required",
    });
  }

  try {
    // Verify OTP
    if (!global.signupOTPs) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(400).json({
        success: false,
        message: "OTP verification required. Please verify your email first.",
      });
    }

    const storedData = global.signupOTPs.get(email.toLowerCase());

    if (!storedData) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(400).json({
        success: false,
        message: "OTP not found. Please verify your email first.",
      });
    }

    if (Date.now() > storedData.otpExpires) {
      global.signupOTPs.delete(email.toLowerCase());
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(400).json({
        success: false,
        message: "OTP has expired. Please request a new one.",
      });
    }

    if (storedData.otp !== otp) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(400).json({
        success: false,
        message: "Invalid OTP",
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(400).json({
        success: false,
        message: "Email already in use",
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create new user
    const newUser = new User({
      name,
      email: email.toLowerCase(),
      password: hashedPassword,
    });
    await newUser.save();

    // ✅ CREATE RESTAURANT AUTOMATICALLY
    const restaurantData = {
      ownerId: newUser._id,
      restaurantName,
    };

    if (req.file) {
      restaurantData.logo = `/src/uploads/logos/${req.file.filename}`;
    }

    const newRestaurant = new Restaurant(restaurantData);
    await newRestaurant.save();

    // Clean up OTP
    global.signupOTPs.delete(email.toLowerCase());

    res.status(201).json({
      success: true,
      message: "User and restaurant registered successfully",
      restaurant: {
        id: newRestaurant._id,
        restaurantName: newRestaurant.restaurantName,
        logo: newRestaurant.logo || null,
      },
    });
  } catch (err) {
    console.error("Register Error:", err);
    if (req.file) fs.unlinkSync(req.file.path);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ============================================
// ✅ LOGIN
// ============================================

/**
 * @route   POST /api/auth/login
 * @desc    Authenticate user and return token + user + restaurant info
 */
router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res
      .status(400)
      .json({ success: false, message: "Email and password are required" });
  }

  try {
    // Find user
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid email or password" });
    }

    // Compare password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid email or password" });
    }

    // Update last login
    user.lastLogin = Date.now();
    await user.save();

    // ✅ FETCH USER'S RESTAURANT (for now, just get the first one)
    const restaurant = await Restaurant.findOne({ ownerId: user._id, isActive: true });

    // Create token (only user info, no restaurant info)
    const token = jwt.sign({ id: user._id, email: user.email }, JWT_SECRET, {
      expiresIn: "7d",
    });

    // Return user + restaurant separately
    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
      },
      restaurant: restaurant
        ? {
            id: restaurant._id,
            restaurantName: restaurant.restaurantName,
            logo: restaurant.logo || null,
            currency: restaurant.currency,
            googleMapsUrl: restaurant.googleMapsUrl,
            operationalHours: restaurant.operationalHours,
            templateStyle: restaurant.templateStyle,
          }
        : null,
    });
  } catch (err) {
    console.error("Login Error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ============================================
// ✅ AUTH MIDDLEWARE
// ============================================

const authMiddleware = (req, res, next) => {
  const token = req.header("Authorization")?.replace("Bearer ", "");
  if (!token) {
    return res
      .status(401)
      .json({ success: false, message: "No token provided" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded; // { id, email }
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: "Invalid token" });
  }
};

// ============================================
// ✅ PROTECTED ROUTES
// ============================================

/**
 * @route   GET /api/auth/me
 * @desc    Get current logged-in user + their restaurant
 */
router.get("/me", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    // ✅ FETCH USER'S RESTAURANT
    const restaurant = await Restaurant.findOne({ ownerId: user._id, isActive: true });

    res.json({
      success: true,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        restaurantId: restaurant?._id?.toString() || null, // Include restaurantId for socket connections
      },
      restaurant: restaurant
        ? {
            id: restaurant._id,
            restaurantName: restaurant.restaurantName,
            logo: restaurant.logo || null,
            currency: restaurant.currency,
            googleMapsUrl: restaurant.googleMapsUrl,
            operationalHours: restaurant.operationalHours,
            templateStyle: restaurant.templateStyle,
          }
        : null,
    });
  } catch (err) {
    console.error("Get Me Error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// ============================================
// ✅ FORGOT PASSWORD ROUTES
// ============================================

/**
 * @route   POST /api/auth/forgot-password
 * @desc    Generate OTP and send to user's email
 */
router.post("/forgot-password", async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res
      .status(400)
      .json({ success: false, message: "Email is required" });
  }

  try {
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(200).json({
        success: true,
        message: "If this email exists, an OTP has been sent",
      });
    }

    // Get restaurant name for email personalization
    const restaurant = await Restaurant.findOne({ ownerId: user._id });
    const restaurantName = restaurant ? restaurant.restaurantName : "User";

    const otp = user.generateOTP();
    await user.save();

    const emailResult = await sendOTPEmail(user.email, otp, restaurantName);

    if (!emailResult.success) {
      return res.status(500).json({
        success: false,
        message: "Failed to send OTP email. Try again later.",
      });
    }

    res.json({
      success: true,
      message: "OTP sent to your email. Valid for 5 minutes.",
    });
  } catch (err) {
    console.error("Forgot Password Error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/**
 * @route   POST /api/auth/verify-otp
 * @desc    Verify OTP entered by user (for password reset)
 */
router.post("/verify-otp", async (req, res) => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    return res
      .status(400)
      .json({ success: false, message: "Email and OTP are required" });
  }

  try {
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    const verification = user.verifyOTP(otp);
    if (!verification.valid) {
      return res.status(400).json({
        success: false,
        message: verification.message,
      });
    }

    res.json({
      success: true,
      message: "OTP verified successfully. You can now reset your password.",
    });
  } catch (err) {
    console.error("Verify OTP Error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/**
 * @route   POST /api/auth/reset-password
 * @desc    Reset password after OTP verification
 */
router.post("/reset-password", async (req, res) => {
  const { email, otp, newPassword } = req.body;

  if (!email || !otp || !newPassword) {
    return res.status(400).json({
      success: false,
      message: "Email, OTP, and new password are required",
    });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({
      success: false,
      message: "Password must be at least 6 characters",
    });
  }

  try {
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "User not found" });
    }

    const verification = user.verifyOTP(otp);
    if (!verification.valid) {
      return res.status(400).json({
        success: false,
        message: verification.message,
      });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    user.clearOTP();
    await user.save();

    res.json({
      success: true,
      message: "Password reset successfully. You can now login.",
    });
  } catch (err) {
    console.error("Reset Password Error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

module.exports = router;