const express = require("express");
const mongoose = require("mongoose");
const Section = require("../models/Section");
const MenuItem = require("../models/MenuItem");
const Restaurant = require("../models/Restaurant");
const authMiddleware = require("../middleware/authMiddleware");

const router = express.Router();

// Apply authentication middleware to all routes
router.use(authMiddleware);

// Helper function to get the Restaurant ID
// req.restaurantId is set by authMiddleware for both owners and staff
const getRestaurantId = (req) => {
  if (!req.restaurantId) {
    throw new Error("Restaurant not found for this user");
  }
  return req.restaurantId;
};

// ==== REORDER Sections ====
router.post("/reorder", async (req, res) => {
  try {
    const { sections } = req.body;

    if (!Array.isArray(sections)) {
      return res.status(400).json({
        success: false,
        message: "Sections array is required",
      });
    }

    const restaurantId = getRestaurantId(req);

    // Verify all sections belong to this restaurant
    const sectionIds = sections.map((s) => s.id);
    const existingSections = await Section.find({
      _id: { $in: sectionIds },
      restaurantId: restaurantId,
    });

    if (existingSections.length !== sections.length) {
      return res.status(403).json({
        success: false,
        message: "One or more sections do not belong to your restaurant",
      });
    }

    // Update sequences
    const updatePromises = sections.map((section) =>
      Section.findByIdAndUpdate(section.id, { sequence: section.sequence })
    );

    await Promise.all(updatePromises);

    res.json({
      success: true,
      message: "Section order updated successfully",
    });
  } catch (err) {
    console.error("Reorder sections error:", err);
    res.status(500).json({
      success: false,
      message: "Server error while reordering sections",
      error: err.message,
    });
  }
});

// ==== READ All Sections ====
router.get("/", async (req, res) => {
  try {
    const restaurantId = getRestaurantId(req);

    // Only get sections for this restaurant, sorted by sequence
    const sections = await Section.find({
      restaurantId: restaurantId,
      isActive: true,
    }).sort({ sequence: 1, createdAt: -1 });

    res.json({
      success: true,
      data: sections,
      count: sections.length,
    });
  } catch (err) {
    console.error("Get sections error:", err);
    res.status(500).json({
      success: false,
      message: "Server error while fetching sections",
      error: err.message,
    });
  }
});

// ==== CREATE Section ====
router.post("/", async (req, res) => {
  try {
    const { name } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        message: "Section name is required",
      });
    }

    const restaurantId = getRestaurantId(req);

    // Check if section name already exists for this restaurant
    const existingSection = await Section.findOne({
      restaurantId: restaurantId,
      name: name.trim(),
      isActive: true,
    });

    if (existingSection) {
      return res.status(400).json({
        success: false,
        message: "Section with this name already exists",
      });
    }

    // Get the highest sequence number for this restaurant
    const maxSequenceSection = await Section.findOne({
      restaurantId: restaurantId,
    }).sort({ sequence: -1 });

    const nextSequence = maxSequenceSection
      ? maxSequenceSection.sequence + 1
      : 0;

    // Create section with restaurantId set to owner's User ID
    const section = new Section({
      name: name.trim(),
      restaurantId: restaurantId,
      sequence: nextSequence,
    });

    await section.save();

    res.status(201).json({
      success: true,
      message: "Section created successfully",
      data: section,
    });
  } catch (err) {
    console.error("Create section error:", err);
    res.status(500).json({
      success: false,
      message: "Server error while creating section",
      error: err.message,
    });
  }
});

// ==== UPDATE Section ====
router.put("/:id", async (req, res) => {
  try {
    const { name, isActive } = req.body;
    const { id } = req.params;

    if (name && name.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "Section name cannot be empty",
      });
    }

    const restaurantId = getRestaurantId(req);

    // Find section and verify ownership
    const section = await Section.findOne({
      _id: id,
      restaurantId: restaurantId,
    });

    if (!section) {
      return res.status(404).json({
        success: false,
        message: "Section not found or you don't have permission to edit it",
      });
    }

    // Check if new name already exists (excluding current section)
    if (name && name.trim() !== section.name) {
      const existingSection = await Section.findOne({
        restaurantId: restaurantId,
        name: name.trim(),
        isActive: true,
        _id: { $ne: id },
      });

      if (existingSection) {
        return res.status(400).json({
          success: false,
          message: "Section with this name already exists",
        });
      }
    }

    // Update fields
    if (name) section.name = name.trim();
    if (typeof isActive === "boolean") section.isActive = isActive;

    await section.save();

    res.json({
      success: true,
      message: "Section updated successfully",
      data: section,
    });
  } catch (err) {
    console.error("Update section error:", err);
    res.status(500).json({
      success: false,
      message: "Server error while updating section",
      error: err.message,
    });
  }
});

// ==== DELETE Section (hard delete with safety check) ====
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const restaurantId = getRestaurantId(req);

    // Find section and verify ownership
    const section = await Section.findOne({
      _id: id,
      restaurantId: restaurantId,
      isActive: true,
    });

    if (!section) {
      return res.status(404).json({
        success: false,
        message: "Section not found or you don't have permission to delete it",
      });
    }

    // Check if section has menu items (including inactive ones to prevent orphans)
    const menuItemCount = await MenuItem.countDocuments({
      sectionId: id,
      isActive: true,
    });

    if (menuItemCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete section. It contains ${menuItemCount} menu item(s). Please delete or move the items first.`,
      });
    }

    // Hard delete - permanently remove from database
    await Section.findByIdAndDelete(id);

    res.json({
      success: true,
      message: "Section deleted successfully",
    });
  } catch (err) {
    console.error("Delete section error:", err);
    res.status(500).json({
      success: false,
      message: "Server error while deleting section",
      error: err.message,
    });
  }
});

module.exports = router;
