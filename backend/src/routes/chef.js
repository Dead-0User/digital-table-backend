const express = require("express");
const router = express.Router();
const Order = require("../models/Order");
const Restaurant = require("../models/Restaurant");
const {
  staffAuthMiddleware,
  roleMiddleware,
} = require("../middleware/staffAuthMiddleware");

// All routes require chef authentication
router.use(staffAuthMiddleware);
router.use(roleMiddleware(["chef", "manager"])); // Manager can also access

// Helper function to get the Restaurant ID
// req.restaurantId is set by staffAuthMiddleware
const getRestaurantId = (req) => {
  if (!req.restaurantId) {
    throw new Error("Restaurant not found for this user");
  }
  return req.restaurantId.toString();
};

/**
 * @route   GET /api/chef/orders/active
 * @desc    Get active orders for kitchen (pending, preparing)
 * @access  Private (Chef/Manager)
 */
router.get("/orders/active", async (req, res) => {
  try {
    const restaurantId = getRestaurantId(req);

    const orders = await Order.find({
      restaurantId: restaurantId,
      status: { $in: ["pending", "preparing"] },
    })
      .populate("tableId", "tableName seats")
      .sort({ createdAt: 1 }); // Oldest first (FIFO)

    // Calculate time elapsed for each order
    const ordersWithTime = orders.map((order) => {
      const elapsed = Math.floor((Date.now() - order.createdAt) / 1000); // seconds
      return {
        ...order.toObject(),
        timeElapsed: elapsed,
      };
    });

    res.json({
      success: true,
      data: ordersWithTime,
      count: ordersWithTime.length,
    });
  } catch (err) {
    console.error("Get active orders error:", err);
    res.status(500).json({
      success: false,
      message: "Server error while fetching orders",
    });
  }
});

/**
 * @route   GET /api/chef/orders/ready
 * @desc    Get ready orders (waiting to be served)
 * @access  Private (Chef/Manager)
 */
router.get("/orders/ready", async (req, res) => {
  try {
    const restaurantId = getRestaurantId(req);

    const orders = await Order.find({
      restaurantId: restaurantId,
      status: "ready",
    })
      .populate("tableId", "tableName seats")
      .sort({ updatedAt: -1 });

    res.json({
      success: true,
      data: orders,
      count: orders.length,
    });
  } catch (err) {
    console.error("Get ready orders error:", err);
    res.status(500).json({
      success: false,
      message: "Server error while fetching orders",
    });
  }
});

/**
 * @route   GET /api/chef/orders/completed
 * @desc    Get completed orders today (served, paid)
 * @access  Private (Chef/Manager)
 */
router.get("/orders/completed", async (req, res) => {
  try {
    const restaurantId = getRestaurantId(req);
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const orders = await Order.find({
      restaurantId: restaurantId,
      status: { $in: ["served", "paid"] },
      updatedAt: { $gte: startOfDay },
    })
      .populate("tableId", "tableName seats")
      .sort({ updatedAt: -1 })
      .limit(50);

    res.json({
      success: true,
      data: orders,
      count: orders.length,
    });
  } catch (err) {
    console.error("Get completed orders error:", err);
    res.status(500).json({
      success: false,
      message: "Server error while fetching orders",
    });
  }
});

/**
 * @route   PATCH /api/chef/orders/:orderId/start-preparing
 * @desc    Mark order as preparing
 * @access  Private (Chef/Manager)
 */
router.patch("/orders/:orderId/start-preparing", async (req, res) => {
  try {
    const { orderId } = req.params;
    const restaurantId = getRestaurantId(req);

    const order = await Order.findOne({
      _id: orderId,
      restaurantId: restaurantId,
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    if (order.status !== "pending") {
      return res.status(400).json({
        success: false,
        message: `Cannot start preparing. Order is ${order.status}`,
      });
    }

    order.status = "preparing";
    await order.save();

    await order.populate("tableId", "tableName seats");

    // Emit socket event
    const io = req.app.get("io");
    if (io) {
      io.to(`restaurant-${restaurantId}`).emit("order-status-updated", {
        orderId: order._id.toString(),
        status: "preparing",
        tableNumber: order.tableId.tableName,
        timestamp: new Date(),
      });
    }

    res.json({
      success: true,
      message: "Order marked as preparing",
      data: order,
    });
  } catch (err) {
    console.error("Start preparing error:", err);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
});

/**
 * @route   PATCH /api/chef/orders/:orderId/mark-ready
 * @desc    Mark order as ready
 * @access  Private (Chef/Manager)
 */
router.patch("/orders/:orderId/mark-ready", async (req, res) => {
  try {
    const { orderId } = req.params;
    const restaurantId = getRestaurantId(req);

    const order = await Order.findOne({
      _id: orderId,
      restaurantId: restaurantId,
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found",
      });
    }

    if (order.status !== "preparing") {
      return res.status(400).json({
        success: false,
        message: `Cannot mark as ready. Order is ${order.status}`,
      });
    }

    order.status = "ready";
    await order.save();

    await order.populate("tableId", "tableName seats");

    // Emit socket event
    const io = req.app.get("io");
    if (io) {
      io.to(`restaurant-${restaurantId}`).emit("order-status-updated", {
        orderId: order._id.toString(),
        status: "ready",
        tableNumber: order.tableId.tableName,
        timestamp: new Date(),
      });

      // Notify waiters
      io.to(`restaurant-${restaurantId}`).emit("order-ready-for-serving", {
        orderId: order._id.toString(),
        tableNumber: order.tableId.tableName,
        timestamp: new Date(),
      });
    }

    res.json({
      success: true,
      message: "Order marked as ready",
      data: order,
    });
  } catch (err) {
    console.error("Mark ready error:", err);
    res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
});

/**
 * @route   GET /api/chef/stats/today
 * @desc    Get today's kitchen stats
 * @access  Private (Chef/Manager)
 */
router.get("/stats/today", async (req, res) => {
  try {
    const restaurantId = getRestaurantId(req);
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const [pending, preparing, ready, completed] = await Promise.all([
      Order.countDocuments({
        restaurantId: restaurantId,
        status: "pending",
        createdAt: { $gte: startOfDay },
      }),
      Order.countDocuments({
        restaurantId: restaurantId,
        status: "preparing",
        createdAt: { $gte: startOfDay },
      }),
      Order.countDocuments({
        restaurantId: restaurantId,
        status: "ready",
        createdAt: { $gte: startOfDay },
      }),
      Order.countDocuments({
        restaurantId: restaurantId,
        status: { $in: ["served", "paid"] },
        createdAt: { $gte: startOfDay },
      }),
    ]);

    // Get average preparation time
    const completedOrders = await Order.find({
      restaurantId: restaurantId,
      status: { $in: ["served", "paid"] },
      createdAt: { $gte: startOfDay },
    }).select("createdAt updatedAt");

    let avgPrepTime = 0;
    if (completedOrders.length > 0) {
      const totalTime = completedOrders.reduce((sum, order) => {
        return sum + (order.updatedAt - order.createdAt);
      }, 0);
      avgPrepTime = Math.floor(totalTime / completedOrders.length / 1000 / 60); // minutes
    }

    res.json({
      success: true,
      data: {
        pending,
        preparing,
        ready,
        completed,
        total: pending + preparing + ready + completed,
        averagePrepTime: avgPrepTime,
      },
    });
  } catch (err) {
    console.error("Get stats error:", err);
    res.status(500).json({
      success: false,
      message: "Server error while fetching stats",
    });
  }
});

module.exports = router;
