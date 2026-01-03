const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const Staff = require("../models/Staff");
const Restaurant = require("../models/Restaurant");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const authMiddleware = require("../middleware/authMiddleware"); // Owner auth
const { staffAuthMiddleware, roleMiddleware } = require("../middleware/staffAuthMiddleware");
const { sendStaffCredentials } = require("../config/nodemailer");

const JWT_SECRET = process.env.JWT_SECRET || "your_jwt_secret_key";

// ============= PUBLIC ROUTES (No Authentication) =============

/**
 * @route   POST /api/staff/login
 * @desc    Staff login (by username and restaurantId)
 * @access  Public
 */
router.post("/login", async (req, res) => {
  try {
    const { username, password, restaurantId } = req.body;

    if (!username || !password || !restaurantId) {
      return res.status(400).json({
        success: false,
        message: "Username, password, and restaurant ID are required"
      });
    }

    // Convert restaurantId string to ObjectId
    let restaurantObjectId;
    try {
      restaurantObjectId = new mongoose.Types.ObjectId(restaurantId.trim());
    } catch (err) {
      return res.status(400).json({
        success: false,
        message: "Invalid restaurant ID format"
      });
    }

    // Find active staff member
    const staff = await Staff.findOne({
      username: username.trim(),
      restaurantId: restaurantObjectId,
      isActive: true
    }).populate("restaurantId", "restaurantName");

    if (!staff) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials or account inactive"
      });
    }

    // Verify password
    const isMatch = await bcrypt.compare(password, staff.password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials"
      });
    }

    // Update last login
    staff.lastLogin = new Date();
    await staff.save();

    // Create token with staff info
    const token = jwt.sign(
      {
        staffId: staff._id,
        username: staff.username,
        role: staff.role,
        restaurantId: staff.restaurantId._id
      },
      JWT_SECRET,
      { expiresIn: "12h" }
    );

    res.json({
      success: true,
      message: "Login successful",
      token,
      staff: {
        id: staff._id,
        username: staff.username,
        fullName: staff.fullName,
        role: staff.role,
        restaurantId: staff.restaurantId._id,
        restaurantName: staff.restaurantId.restaurantName
      }
    });
  } catch (err) {
    console.error("Staff login error:", err);
    res.status(500).json({
      success: false,
      message: "Server error during login"
    });
  }
});

// ============= OWNER ROUTES (Require Owner Authentication) =============

/**
 * @route   POST /api/staff/create
 * @desc    Create new staff member (Owner only)
 * @access  Private (Owner)
 */
router.post("/create", authMiddleware, async (req, res) => {
  try {
    const { username, password, fullName, role, email, phone, shift } = req.body;

    // Validation
    if (!username || !password || !fullName || !role) {
      return res.status(400).json({
        success: false,
        message: "Username, password, full name, and role are required"
      });
    }

    const validRoles = ["waiter", "chef", "manager", "cashier"];
    if (!validRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        message: `Invalid role. Must be one of: ${validRoles.join(", ")}`
      });
    }

    // Use restaurantId from authMiddleware
    if (!req.restaurantId) {
      return res.status(404).json({
        success: false,
        message: "No restaurant found for this user"
      });
    }

    // Check if username already exists for this restaurant
    const existingStaff = await Staff.findOne({
      restaurantId: req.restaurantId,
      username: username.trim()
    });

    if (existingStaff) {
      return res.status(400).json({
        success: false,
        message: "Username already exists for this restaurant"
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create staff member
    const staff = new Staff({
      restaurantId: req.restaurantId,
      username: username.trim(),
      password: hashedPassword,
      fullName: fullName.trim(),
      role,
      email: email?.trim() || null,
      phone: phone?.trim() || null,
      shift: shift || "flexible",
      createdBy: req.userId // Keep userId for createdBy (actual User ID for future multi-dashboard)
    });

    await staff.save();

    // Send credentials via email if email is provided
    if (staff.email) {
      try {
        const restaurant = await Restaurant.findById(req.restaurantId);
        await sendStaffCredentials(staff.email, {
          username: staff.username,
          password: password, // Send original password
          restaurantName: restaurant ? restaurant.restaurantName : "Our Restaurant",
          restaurantId: req.restaurantId,
          role: staff.role
        });
      } catch (emailErr) {
        console.error("Failed to send staff credentials email:", emailErr);
        // Don't fail the request if email fails, but log it
      }
    }

    res.status(201).json({
      success: true,
      message: "Staff member created successfully",
      staff: {
        id: staff._id,
        username: staff.username,
        fullName: staff.fullName,
        role: staff.role,
        email: staff.email,
        phone: staff.phone,
        shift: staff.shift,
        isActive: staff.isActive,
        createdAt: staff.createdAt
      }
    });
  } catch (err) {
    console.error("Create staff error:", err);
    res.status(500).json({
      success: false,
      message: "Server error while creating staff member"
    });
  }
});

/**
 * @route   GET /api/staff/list
 * @desc    Get all staff members for restaurant (Owner or Manager)
 * @access  Private (Owner or Manager)
 */
router.get("/list", authMiddleware, async (req, res) => {
  try {
    const { role, isActive } = req.query;

    // Use restaurantId from authMiddleware (set for both owners and staff)
    if (!req.restaurantId) {
      return res.status(404).json({
        success: false,
        message: "No restaurant found for this user"
      });
    }

    const restaurantId = req.restaurantId;

    const query = { restaurantId: restaurantId };

    if (role) {
      query.role = role;
    }

    if (isActive !== undefined) {
      query.isActive = isActive === "true";
    }

    const staffMembers = await Staff.find(query)
      .select("-password")
      .sort({ role: 1, fullName: 1 });

    res.json({
      success: true,
      data: staffMembers,
      count: staffMembers.length
    });
  } catch (err) {
    console.error("Get staff list error:", err);
    res.status(500).json({
      success: false,
      message: "Server error while fetching staff"
    });
  }
});

/**
 * @route   GET /api/staff/:staffId
 * @desc    Get single staff member details (Owner or Manager)
 * @access  Private (Owner or Manager)
 */
router.get("/:staffId", authMiddleware, async (req, res) => {
  try {
    const { staffId } = req.params;

    let restaurantId;

    // Use restaurantId from authMiddleware (set for both owners and staff)
    if (!req.restaurantId) {
      return res.status(404).json({
        success: false,
        message: "No restaurant found for this user"
      });
    }

    const staff = await Staff.findOne({
      _id: staffId,
      restaurantId: req.restaurantId
    }).select("-password");

    if (!staff) {
      return res.status(404).json({
        success: false,
        message: "Staff member not found"
      });
    }

    res.json({
      success: true,
      data: staff
    });
  } catch (err) {
    console.error("Get staff error:", err);
    res.status(500).json({
      success: false,
      message: "Server error while fetching staff member"
    });
  }
});

/**
 * @route   PUT /api/staff/:staffId
 * @desc    Update staff member (Owner or Manager - with restrictions for managers)
 * @access  Private (Owner or Manager)
 */
router.put("/:staffId", authMiddleware, async (req, res) => {
  try {
    const { staffId } = req.params;
    const { fullName, email, phone, shift, isActive, password, role } = req.body;

    // Use restaurantId from authMiddleware (set for both owners and staff)
    if (!req.restaurantId) {
      return res.status(404).json({
        success: false,
        message: "No restaurant found for this user"
      });
    }

    const restaurantId = req.restaurantId;
    const isManager = req.isStaff && req.staffRole === "manager";

    const staff = await Staff.findOne({
      _id: staffId,
      restaurantId: restaurantId
    });

    if (!staff) {
      return res.status(404).json({
        success: false,
        message: "Staff member not found"
      });
    }

    // Managers cannot change role or deactivate/activate staff (sensitive operations)
    if (isManager) {
      // Managers can only update basic info: fullName, email, phone, shift
      // They cannot change: role, isActive, password
      if (role !== undefined) {
        return res.status(403).json({
          success: false,
          message: "Managers cannot change staff roles"
        });
      }
      if (isActive !== undefined) {
        return res.status(403).json({
          success: false,
          message: "Managers cannot activate or deactivate staff accounts"
        });
      }
      if (password && password.trim()) {
        return res.status(403).json({
          success: false,
          message: "Managers cannot change staff passwords"
        });
      }
    }

    // Update fields
    if (fullName !== undefined) staff.fullName = fullName.trim();
    if (email !== undefined) staff.email = email?.trim() || null;
    if (phone !== undefined) staff.phone = phone?.trim() || null;
    if (shift !== undefined) staff.shift = shift;

    // Only owners can update these fields
    if (!isManager) {
      if (isActive !== undefined) staff.isActive = isActive;
      if (role !== undefined) staff.role = role;
      // Update password if provided (owners only)
      if (password && password.trim()) {
        staff.password = await bcrypt.hash(password, 10);
      }
    }

    await staff.save();

    res.json({
      success: true,
      message: "Staff member updated successfully",
      staff: {
        id: staff._id,
        username: staff.username,
        fullName: staff.fullName,
        role: staff.role,
        email: staff.email,
        phone: staff.phone,
        shift: staff.shift,
        isActive: staff.isActive
      }
    });
  } catch (err) {
    console.error("Update staff error:", err);
    res.status(500).json({
      success: false,
      message: "Server error while updating staff member"
    });
  }
});

/**
 * @route   DELETE /api/staff/:staffId
 * @desc    Delete staff member (Owner only)
 * @access  Private (Owner)
 */
router.delete("/:staffId", authMiddleware, async (req, res) => {
  try {
    const { staffId } = req.params;

    // Use restaurantId from authMiddleware
    if (!req.restaurantId) {
      return res.status(404).json({
        success: false,
        message: "No restaurant found for this user"
      });
    }

    const staff = await Staff.findOne({
      _id: staffId,
      restaurantId: req.restaurantId
    });

    if (!staff) {
      return res.status(404).json({
        success: false,
        message: "Staff member not found"
      });
    }

    await Staff.deleteOne({ _id: staffId });

    res.json({
      success: true,
      message: "Staff member deleted successfully"
    });
  } catch (err) {
    console.error("Delete staff error:", err);
    res.status(500).json({
      success: false,
      message: "Server error while deleting staff member"
    });
  }
});

// ============= STAFF AUTHENTICATED ROUTES =============

/**
 * @route   GET /api/staff/me
 * @desc    Get current staff member info
 * @access  Private (Staff)
 */
router.get("/auth/me", staffAuthMiddleware, async (req, res) => {
  try {
    const staff = await Staff.findById(req.staffId)
      .select("-password")
      .populate("restaurantId", "restaurantName logo currency");

    if (!staff) {
      return res.status(404).json({
        success: false,
        message: "Staff member not found"
      });
    }

    res.json({
      success: true,
      data: staff
    });
  } catch (err) {
    console.error("Get staff me error:", err);
    res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
});

/**
 * @route   POST /api/staff/change-password
 * @desc    Change own password
 * @access  Private (Staff)
 */
router.post("/change-password", staffAuthMiddleware, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: "Current and new password are required"
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: "New password must be at least 6 characters"
      });
    }

    const staff = await Staff.findById(req.staffId);

    if (!staff) {
      return res.status(404).json({
        success: false,
        message: "Staff member not found"
      });
    }

    // Verify current password
    const isMatch = await bcrypt.compare(currentPassword, staff.password);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: "Current password is incorrect"
      });
    }

    // Update password
    staff.password = await bcrypt.hash(newPassword, 10);
    await staff.save();

    res.json({
      success: true,
      message: "Password changed successfully"
    });
  } catch (err) {
    console.error("Change password error:", err);
    res.status(500).json({
      success: false,
      message: "Server error while changing password"
    });
  }
});

module.exports = router;