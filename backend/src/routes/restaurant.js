const express = require("express");
const router = express.Router();
const User = require("../models/User");
const Restaurant = require("../models/Restaurant");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const JWT_SECRET = process.env.JWT_SECRET || "your_jwt_secret_key";

/**
 * Middleware: Verify JWT token
 */
const authMiddleware = (req, res, next) => {
  const token = req.header("Authorization")?.replace("Bearer ", "");
  if (!token) {
    return res.status(401).json({ success: false, message: "No token provided" });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded; // { id, email }
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: "Invalid token" });
  }
};

// Configure multer for logo uploads
const uploadDir = path.join(__dirname, "..", "uploads", "logos");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

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
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);

  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb(new Error("Only image files are allowed!"));
  }
};

const upload = multer({
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: fileFilter,
});

/**
 * Helper: Get user's restaurant (for single-restaurant mode)
 * In the future, this can accept a restaurantId parameter
 */
async function getUserRestaurant(userId, restaurantId = null) {
  if (restaurantId) {
    // Future: Multi-restaurant support
    const restaurant = await Restaurant.findOne({
      _id: restaurantId,
      ownerId: userId,
      isActive: true,
    });
    return restaurant;
  } else {
    // Current: Single restaurant per user
    const restaurant = await Restaurant.findOne({
      ownerId: userId,
      isActive: true,
    });
    return restaurant;
  }
}

/**
 * @route   GET /api/restaurant/current
 * @desc    Get current restaurant settings
 * @future  Can accept ?restaurantId=xxx query param for multi-restaurant
 */
router.get("/current", authMiddleware, async (req, res) => {
  try {
    const restaurantId = req.query.restaurantId || null;
    const restaurant = await getUserRestaurant(req.user.id, restaurantId);

    if (!restaurant) {
      return res.status(404).json({
        success: false,
        message: "Restaurant not found",
      });
    }

    res.json({
      success: true,
      restaurant: {
        id: restaurant._id,
        restaurantName: restaurant.restaurantName,
        currency: restaurant.currency,
        googleMapsUrl: restaurant.googleMapsUrl,
        operationalHours: restaurant.operationalHours,
        templateStyle: restaurant.templateStyle,
        logo: restaurant.logo || null,
        address: restaurant.address || "",
        fssai: restaurant.fssai || "",
        gstNo: restaurant.gstNo || "",
        receiptFooter: restaurant.receiptFooter || "Thank You Visit Again",
        taxes: restaurant.taxes || [],
      },
    });
  } catch (err) {
    console.error("Get Restaurant Error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/**
 * @route   PUT /api/restaurant/update
 * @desc    Update restaurant settings (including logo)
 * @future  Can accept restaurantId in body for multi-restaurant
 */
router.put("/update", authMiddleware, upload.single("logo"), async (req, res) => {
  try {
    const {
      restaurantId,
      restaurantName,
      currency,
      googleMapsUrl,
      operationalHours,
      templateStyle,
      removeLogo,
      address,
      fssai,
      gstNo,
      receiptFooter,
      taxes, // Expecting a JSON string if sent via FormData
    } = req.body;

    // Get the restaurant
    const restaurant = await getUserRestaurant(req.user.id, restaurantId);

    if (!restaurant) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(404).json({
        success: false,
        message: "Restaurant not found",
      });
    }

    // Verify ownership
    if (restaurant.ownerId.toString() !== req.user.id) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(403).json({
        success: false,
        message: "Unauthorized to update this restaurant",
      });
    }

    // Handle logo removal
    if (removeLogo === "true" && restaurant.logo) {
      const oldLogoPath = path.join(__dirname, "..", restaurant.logo);
      if (fs.existsSync(oldLogoPath)) {
        fs.unlinkSync(oldLogoPath);
      }
      restaurant.logo = null;
    }

    // Handle new logo upload
    if (req.file) {
      // Delete old logo if exists
      if (restaurant.logo) {
        const oldLogoPath = path.join(__dirname, "..", restaurant.logo);
        if (fs.existsSync(oldLogoPath)) {
          fs.unlinkSync(oldLogoPath);
        }
      }
      restaurant.logo = `/src/uploads/logos/${req.file.filename}`;
    }

    // Update other fields
    if (restaurantName !== undefined) restaurant.restaurantName = restaurantName;
    if (currency !== undefined) restaurant.currency = currency;
    if (googleMapsUrl !== undefined) restaurant.googleMapsUrl = googleMapsUrl;
    if (operationalHours !== undefined) restaurant.operationalHours = operationalHours;
    if (address !== undefined) restaurant.address = address;
    if (fssai !== undefined) restaurant.fssai = fssai;
    if (gstNo !== undefined) restaurant.gstNo = gstNo;
    if (receiptFooter !== undefined) restaurant.receiptFooter = receiptFooter;

    if (taxes !== undefined) {
      try {
        // taxes usually comes as a JSON string when using FormData
        const parsedTaxes = typeof taxes === 'string' ? JSON.parse(taxes) : taxes;
        if (Array.isArray(parsedTaxes)) {
          restaurant.taxes = parsedTaxes.map(t => ({
            name: t.name,
            rate: Number(t.rate)
          }));
        }
      } catch (e) {
        console.error("Error parsing taxes:", e);
      }
    }

    // Template validation and update
    if (templateStyle !== undefined) {
      const validTemplates = ["classic", "modern", "minimal", "TemplateBurgerBooch"];
      if (!validTemplates.includes(templateStyle)) {
        if (req.file) fs.unlinkSync(req.file.path);
        return res.status(400).json({
          success: false,
          message: "Invalid template style. Must be 'classic', 'modern', 'minimal' or 'TemplateBurgerBooch'",
        });
      }
      restaurant.templateStyle = templateStyle;
    }

    await restaurant.save();

    res.json({
      success: true,
      message: "Restaurant settings updated successfully",
      restaurant: {
        id: restaurant._id,
        restaurantName: restaurant.restaurantName,
        currency: restaurant.currency,
        googleMapsUrl: restaurant.googleMapsUrl,
        operationalHours: restaurant.operationalHours,
        templateStyle: restaurant.templateStyle,
        logo: restaurant.logo,
        address: restaurant.address,
        fssai: restaurant.fssai,
        gstNo: restaurant.gstNo,
        receiptFooter: restaurant.receiptFooter,
        taxes: restaurant.taxes,
      },
    });
  } catch (err) {
    console.error("Update Restaurant Error:", err);
    if (req.file) fs.unlinkSync(req.file.path);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/**
 * @route   GET /api/restaurant/list
 * @desc    Get all restaurants owned by the user
 * @future  This will be useful when multi-restaurant is enabled
 */
router.get("/list", authMiddleware, async (req, res) => {
  try {
    const restaurants = await Restaurant.find({
      ownerId: req.user.id,
      isActive: true,
    }).sort({ createdAt: -1 });

    res.json({
      success: true,
      count: restaurants.length,
      restaurants: restaurants.map((r) => ({
        id: r._id,
        restaurantName: r.restaurantName,
        logo: r.logo || null,
        currency: r.currency,
        templateStyle: r.templateStyle,
        createdAt: r.createdAt,
      })),
    });
  } catch (err) {
    console.error("List Restaurants Error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

module.exports = router;