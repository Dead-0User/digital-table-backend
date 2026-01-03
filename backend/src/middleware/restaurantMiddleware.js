const Restaurant = require("../models/Restaurant");

/**
 * Middleware: Attach restaurantId to request
 * 
 * This middleware makes it easy to transition from userId-as-restaurantId
 * to proper restaurant IDs without breaking existing code.
 * 
 * CURRENT BEHAVIOR (Single Restaurant Mode):
 *   - Automatically fetches the user's first restaurant
 *   - Attaches req.restaurantId and req.restaurant
 * 
 * FUTURE BEHAVIOR (Multi-Restaurant Mode):
 *   - Accept restaurantId from query/body/params
 *   - Verify user owns that restaurant
 *   - Attach to request
 * 
 * Usage:
 *   router.get('/menu', authMiddleware, attachRestaurantId, async (req, res) => {
 *     const menus = await Menu.find({ restaurantId: req.restaurantId });
 *   });
 */
async function attachRestaurantId(req, res, next) {
  try {
    // Try to get restaurantId from different sources (future-ready)
    let restaurantId =
      req.params.restaurantId ||
      req.query.restaurantId ||
      req.body.restaurantId ||
      null;

    // If no restaurantId provided, get user's first restaurant (current mode)
    if (!restaurantId) {
      const restaurant = await Restaurant.findOne({
        ownerId: req.user.id,
        isActive: true,
      });

      if (!restaurant) {
        return res.status(404).json({
          success: false,
          message: "No restaurant found for this user",
        });
      }

      restaurantId = restaurant._id;
    }

    // Verify the restaurant exists and user owns it
    const restaurant = await Restaurant.findOne({
      _id: restaurantId,
      ownerId: req.user.id,
      isActive: true,
    });

    if (!restaurant) {
      return res.status(403).json({
        success: false,
        message: "Unauthorized access to this restaurant",
      });
    }

    // Attach to request for use in route handlers
    req.restaurantId = restaurant._id;
    req.restaurant = restaurant;

    next();
  } catch (err) {
    console.error("Restaurant Middleware Error:", err);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching restaurant",
    });
  }
}

/**
 * Optional Middleware: Attach restaurantId without requiring it
 * 
 * Use this for routes where restaurant context is optional
 * (e.g., admin routes, user profile routes)
 */
async function attachRestaurantIdOptional(req, res, next) {
  try {
    let restaurantId =
      req.params.restaurantId ||
      req.query.restaurantId ||
      req.body.restaurantId ||
      null;

    if (!restaurantId) {
      const restaurant = await Restaurant.findOne({
        ownerId: req.user.id,
        isActive: true,
      });

      if (restaurant) {
        req.restaurantId = restaurant._id;
        req.restaurant = restaurant;
      }
    } else {
      const restaurant = await Restaurant.findOne({
        _id: restaurantId,
        ownerId: req.user.id,
        isActive: true,
      });

      if (restaurant) {
        req.restaurantId = restaurant._id;
        req.restaurant = restaurant;
      }
    }

    // Continue even if no restaurant found
    next();
  } catch (err) {
    console.error("Restaurant Middleware Error:", err);
    next(); // Continue even on error
  }
}

/**
 * Utility: Get all restaurants for a user
 * 
 * Useful for routes that need to list/manage multiple restaurants
 */
async function getUserRestaurants(userId) {
  try {
    const restaurants = await Restaurant.find({
      ownerId: userId,
      isActive: true,
    }).sort({ createdAt: -1 });

    return restaurants;
  } catch (err) {
    console.error("Get User Restaurants Error:", err);
    return [];
  }
}

/**
 * Utility: Check if user owns a specific restaurant
 */
async function verifyRestaurantOwnership(userId, restaurantId) {
  try {
    const restaurant = await Restaurant.findOne({
      _id: restaurantId,
      ownerId: userId,
      isActive: true,
    });

    return !!restaurant;
  } catch (err) {
    console.error("Verify Restaurant Ownership Error:", err);
    return false;
  }
}

module.exports = {
  attachRestaurantId,
  attachRestaurantIdOptional,
  getUserRestaurants,
  verifyRestaurantOwnership,
};