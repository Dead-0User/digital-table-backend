const jwt = require("jsonwebtoken");
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET || "your_jwt_secret_key";

/**
 * Middleware to verify staff authentication
 * Attaches staffId, role, and restaurantId to req object
 */
const staffAuthMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ 
      success: false,
      message: "Staff authentication required. Please login." 
    });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Check if this is a staff token (not owner token)
    if (!decoded.staffId || !decoded.role) {
      return res.status(401).json({ 
        success: false,
        message: "Invalid staff credentials. Please login as staff." 
      });
    }
    
    req.staffId = decoded.staffId;
    req.role = decoded.role;
    req.restaurantId = decoded.restaurantId;
    req.username = decoded.username;
    
    next();
  } catch (err) {
    return res.status(401).json({ 
      success: false,
      message: "Invalid or expired token. Please login again." 
    });
  }
};

/**
 * Middleware to verify specific staff role(s)
 * Usage: roleMiddleware(['chef', 'manager'])
 */
const roleMiddleware = (allowedRoles) => {
  return (req, res, next) => {
    if (!req.role) {
      return res.status(401).json({
        success: false,
        message: "Authentication required"
      });
    }

    if (!allowedRoles.includes(req.role)) {
      return res.status(403).json({
        success: false,
        message: `Access denied. Required role: ${allowedRoles.join(" or ")}`
      });
    }

    next();
  };
};

module.exports = { 
  staffAuthMiddleware, 
  roleMiddleware 
};