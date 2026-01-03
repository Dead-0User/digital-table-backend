const jwt = require("jsonwebtoken");
const Restaurant = require("../models/Restaurant");
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET || "your_jwt_secret_key";

const authMiddleware = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ 
      success: false,
      message: "Authentication required. Please login." 
    });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    
    console.log("Auth Middleware - Decoded token:", decoded);
    
    // Accept both owner tokens (id) and staff tokens (staffId + restaurantId)
    if (decoded.id) {
      // Owner token - userId is the actual User ID
      req.userId = decoded.id;
      req.isOwner = true;
      req.isStaff = false;
      
      // Get the restaurant for this owner
      const restaurant = await Restaurant.findOne({
        ownerId: req.userId,
        isActive: true,
      });
      
      if (restaurant) {
        req.restaurantId = restaurant._id.toString();
      } else {
        console.warn("No active restaurant found for owner:", req.userId);
      }
      
      console.log("Owner authenticated - userId:", req.userId, "restaurantId:", req.restaurantId);
    } else if (decoded.staffId && decoded.restaurantId) {
      // Staff token - restaurantId is the Restaurant ID
      req.restaurantId = decoded.restaurantId.toString();
      req.isStaff = true;
      req.isOwner = false;
      req.staffId = decoded.staffId;
      req.staffRole = decoded.role;
      
      // Get the owner's User ID from the restaurant (for future multi-dashboard)
      const restaurant = await Restaurant.findById(req.restaurantId);
      if (restaurant) {
        req.userId = restaurant.ownerId.toString();
      }
      
      console.log("Staff authenticated - staffId:", decoded.staffId, "restaurantId:", req.restaurantId, "userId:", req.userId, "role:", decoded.role);
    } else {
      console.error("Invalid token structure - missing required fields. Decoded:", decoded);
      throw new Error("Invalid token structure");
    }
    
    next();
  } catch (err) {
    console.error("Auth middleware error:", err.message);
    console.error("Token that failed:", token ? token.substring(0, 20) + "..." : "null");
    return res.status(401).json({ 
      success: false,
      message: "Invalid token. Please login again." 
    });
  }
};

module.exports = authMiddleware;