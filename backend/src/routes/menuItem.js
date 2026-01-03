const express = require("express");
const mongoose = require("mongoose");
const MenuItem = require("../models/MenuItem");
const Section = require("../models/Section");
const Restaurant = require("../models/Restaurant");
const authMiddleware = require("../middleware/authMiddleware");
const upload = require("../middleware/upload");
const fs = require("fs");
const path = require("path");

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

// ==== REORDER Menu Items ====
router.post("/reorder", async (req, res) => {
  try {
    const { items } = req.body;

    if (!Array.isArray(items)) {
      return res.status(400).json({
        success: false,
        message: "Items array is required",
      });
    }

    const restaurantId = getRestaurantId(req);

    // Verify all items belong to this restaurant
    const itemIds = items.map((i) => i.id);
    const existingItems = await MenuItem.find({
      _id: { $in: itemIds },
      restaurantId: restaurantId,
    });

    if (existingItems.length !== items.length) {
      return res.status(403).json({
        success: false,
        message: "One or more items do not belong to your restaurant",
      });
    }

    // Update sequences
    const updatePromises = items.map((item) =>
      MenuItem.findByIdAndUpdate(item.id, { sequence: item.sequence })
    );

    await Promise.all(updatePromises);

    res.json({
      success: true,
      message: "Menu item order updated successfully",
    });
  } catch (err) {
    console.error("Reorder menu items error:", err);
    res.status(500).json({
      success: false,
      message: "Server error while reordering menu items",
      error: err.message,
    });
  }
});

// ==== READ All Menu Items (including inactive for restaurant owner) ====
router.get("/", async (req, res) => {
  try {
    const restaurantId = getRestaurantId(req);

    // Restaurant owners see ALL items (active and inactive)
    const menuItems = await MenuItem.find({
      restaurantId: restaurantId,
      // NO isActive filter - owners see everything
    })
      .populate("sectionId", "name")
      .sort({ sequence: 1, createdAt: -1 });

    // Migrate old addons to addonGroups for backward compatibility
    const itemsWithMigratedAddons = menuItems.map((item) => {
      const itemObj = item.toObject();

      // If there are old addons but no addon groups, migrate them
      if (
        (!itemObj.addonGroups || itemObj.addonGroups.length === 0) &&
        itemObj.addons &&
        itemObj.addons.length > 0
      ) {
        itemObj.addonGroups = [
          {
            title: "Add-ons",
            multiSelect: true,
            items: itemObj.addons,
          },
        ];
      }

      return itemObj;
    });

    res.json({
      success: true,
      data: itemsWithMigratedAddons,
      count: itemsWithMigratedAddons.length,
    });
  } catch (err) {
    console.error("Get menu items error:", err);
    res.status(500).json({
      success: false,
      message: "Server error while fetching menu items",
      error: err.message,
    });
  }
});

// ==== CREATE Menu Item ====
router.post("/", upload.single("image"), async (req, res) => {
  try {
    const {
      name,
      description,
      price,
      isVeg = false,
      sectionId,
      addonGroups = [],
    } = req.body;

    // Validation
    if (!name || name.trim() === "") {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(400).json({
        success: false,
        message: "Item name is required",
      });
    }

    if (!description || description.trim() === "") {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(400).json({
        success: false,
        message: "Description is required",
      });
    }

    if (!price || parseFloat(price) <= 0) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(400).json({
        success: false,
        message: "Valid price is required",
      });
    }

    if (!sectionId) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(400).json({
        success: false,
        message: "Section is required",
      });
    }

    // Parse addonGroups if it's a JSON string (from FormData)
    let parsedAddonGroups = [];
    if (addonGroups) {
      try {
        parsedAddonGroups =
          typeof addonGroups === "string"
            ? JSON.parse(addonGroups)
            : addonGroups;
      } catch (e) {
        if (req.file) fs.unlinkSync(req.file.path);
        return res.status(400).json({
          success: false,
          message: "Invalid addon groups format",
        });
      }
    }

    // Validate addon groups structure
    if (parsedAddonGroups && Array.isArray(parsedAddonGroups)) {
      for (const group of parsedAddonGroups) {
        if (!group.title || typeof group.title !== "string") {
          if (req.file) fs.unlinkSync(req.file.path);
          return res.status(400).json({
            success: false,
            message: "Each addon group must have a valid title",
          });
        }
        if (typeof group.multiSelect !== "boolean") {
          if (req.file) fs.unlinkSync(req.file.path);
          return res.status(400).json({
            success: false,
            message: "Each addon group must have multiSelect property",
          });
        }
        if (!Array.isArray(group.items)) {
          if (req.file) fs.unlinkSync(req.file.path);
          return res.status(400).json({
            success: false,
            message: "Each addon group must have an items array",
          });
        }
        for (const item of group.items) {
          if (!item.name || typeof item.name !== "string") {
            if (req.file) fs.unlinkSync(req.file.path);
            return res.status(400).json({
              success: false,
              message: "Each addon item must have a valid name",
            });
          }
          if (typeof item.price !== "number" || item.price < 0) {
            if (req.file) fs.unlinkSync(req.file.path);
            return res.status(400).json({
              success: false,
              message: "Each addon item must have a valid price (0 or greater)",
            });
          }
        }
      }
    }

    const restaurantId = getRestaurantId(req);

    // Verify that the section belongs to this restaurant
    const section = await Section.findOne({
      _id: sectionId,
      restaurantId: restaurantId,
      isActive: true,
    });

    if (!section) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(404).json({
        success: false,
        message: "Section not found or does not belong to your restaurant",
      });
    }

    // Check if menu item name already exists in this restaurant
    const existingItem = await MenuItem.findOne({
      restaurantId: restaurantId,
      name: name.trim(),
      isActive: true,
    });

    if (existingItem) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(400).json({
        success: false,
        message: "Menu item with this name already exists",
      });
    }

    // Get the highest sequence number for items in this section
    let nextSequence = 0;
    try {
      const maxSequenceItem = await MenuItem.findOne({
        sectionId: sectionId,
        restaurantId: restaurantId,
      })
        .sort({ sequence: -1 })
        .select("sequence");

      nextSequence =
        maxSequenceItem && typeof maxSequenceItem.sequence === "number"
          ? maxSequenceItem.sequence + 1
          : 0;
    } catch (seqError) {
      console.log("Sequence calculation error, using 0:", seqError);
      nextSequence = 0;
    }

    const menuItemData = {
      name: name.trim(),
      description: description.trim(),
      price: parseFloat(price),
      isVeg: isVeg === "true" || isVeg === true,
      sectionId,
      restaurantId: restaurantId,
      addonGroups: parsedAddonGroups,
      sequence: nextSequence,
    };

    // Add image path if uploaded
    if (req.file) {
      menuItemData.image = `/src/uploads/${req.file.filename}`;
    }

    const menuItem = new MenuItem(menuItemData);
    await menuItem.save();
    await menuItem.populate("sectionId", "name");

    res.status(201).json({
      success: true,
      message: "Menu item created successfully",
      data: menuItem,
    });
  } catch (err) {
    console.error("Create menu item error:", err);
    if (req.file && req.file.path) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (unlinkErr) {
        console.error("Error deleting uploaded file:", unlinkErr);
      }
    }
    res.status(500).json({
      success: false,
      message: "Server error while creating menu item",
      error: err.message,
    });
  }
});

// ==== UPDATE Menu Item ====
router.put("/:id", upload.single("image"), async (req, res) => {
  try {
    const {
      name,
      description,
      price,
      isVeg,
      sectionId,
      addonGroups,
      isActive,
    } = req.body;
    const { id } = req.params;

    // Validation
    if (name && name.trim() === "") {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(400).json({
        success: false,
        message: "Item name cannot be empty",
      });
    }

    if (description && description.trim() === "") {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(400).json({
        success: false,
        message: "Description cannot be empty",
      });
    }

    if (price && parseFloat(price) <= 0) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(400).json({
        success: false,
        message: "Price must be greater than 0",
      });
    }

    // Parse addonGroups if it's a JSON string (from FormData)
    let parsedAddonGroups = addonGroups;
    if (addonGroups && typeof addonGroups === "string") {
      try {
        parsedAddonGroups = JSON.parse(addonGroups);
      } catch (e) {
        if (req.file) fs.unlinkSync(req.file.path);
        return res.status(400).json({
          success: false,
          message: "Invalid addon groups format",
        });
      }
    }

    // Validate addon groups structure if provided
    if (parsedAddonGroups && Array.isArray(parsedAddonGroups)) {
      for (const group of parsedAddonGroups) {
        if (!group.title || typeof group.title !== "string") {
          if (req.file) fs.unlinkSync(req.file.path);
          return res.status(400).json({
            success: false,
            message: "Each addon group must have a valid title",
          });
        }
        if (typeof group.multiSelect !== "boolean") {
          if (req.file) fs.unlinkSync(req.file.path);
          return res.status(400).json({
            success: false,
            message: "Each addon group must have multiSelect property",
          });
        }
        if (!Array.isArray(group.items)) {
          if (req.file) fs.unlinkSync(req.file.path);
          return res.status(400).json({
            success: false,
            message: "Each addon group must have an items array",
          });
        }
        for (const item of group.items) {
          if (!item.name || typeof item.name !== "string") {
            if (req.file) fs.unlinkSync(req.file.path);
            return res.status(400).json({
              success: false,
              message: "Each addon item must have a valid name",
            });
          }
          if (typeof item.price !== "number" || item.price < 0) {
            if (req.file) fs.unlinkSync(req.file.path);
            return res.status(400).json({
              success: false,
              message: "Each addon item must have a valid price (0 or greater)",
            });
          }
        }
      }
    }

    const restaurantId = getRestaurantId(req);

    // Find menu item and verify ownership
    const menuItem = await MenuItem.findOne({
      _id: id,
      restaurantId: restaurantId,
    });

    if (!menuItem) {
      if (req.file) fs.unlinkSync(req.file.path);
      return res.status(404).json({
        success: false,
        message: "Menu item not found",
      });
    }

    // If changing section, verify the new section belongs to this restaurant
    if (sectionId && sectionId !== menuItem.sectionId.toString()) {
      const section = await Section.findOne({
        _id: sectionId,
        restaurantId: restaurantId,
        isActive: true,
      });

      if (!section) {
        if (req.file) fs.unlinkSync(req.file.path);
        return res.status(404).json({
          success: false,
          message: "Section not found or does not belong to your restaurant",
        });
      }
    }

    // Check if new name already exists (excluding current item)
    if (name && name.trim() !== menuItem.name) {
      const existingItem = await MenuItem.findOne({
        restaurantId: restaurantId,
        name: name.trim(),
        isActive: true,
        _id: { $ne: id },
      });

      if (existingItem) {
        if (req.file) fs.unlinkSync(req.file.path);
        return res.status(400).json({
          success: false,
          message: "Menu item with this name already exists",
        });
      }
    }

    // Handle image update
    if (req.file) {
      // Delete old image if it exists
      if (menuItem.image) {
        const oldImagePath = path.join(__dirname, "..", menuItem.image);
        if (fs.existsSync(oldImagePath)) {
          fs.unlinkSync(oldImagePath);
        }
      }
      menuItem.image = `/src/uploads/${req.file.filename}`;
    }

    // Update fields
    if (name) menuItem.name = name.trim();
    if (description) menuItem.description = description.trim();
    if (price) menuItem.price = parseFloat(price);
    if (typeof isVeg === "boolean") menuItem.isVeg = isVeg;
    if (typeof isVeg === "string") menuItem.isVeg = isVeg === "true";
    if (sectionId) menuItem.sectionId = sectionId;
    if (Array.isArray(parsedAddonGroups))
      menuItem.addonGroups = parsedAddonGroups;
    if (typeof isActive === "boolean") menuItem.isActive = isActive;
    if (typeof isActive === "string") menuItem.isActive = isActive === "true";

    await menuItem.save();
    await menuItem.populate("sectionId", "name");

    res.json({
      success: true,
      message: "Menu item updated successfully",
      data: menuItem,
    });
  } catch (err) {
    console.error("Update menu item error:", err);
    if (req.file) fs.unlinkSync(req.file.path);
    res.status(500).json({
      success: false,
      message: "Server error while updating menu item",
      error: err.message,
    });
  }
});

// ==== DELETE Menu Item (hard delete) ====
router.delete("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const restaurantId = getRestaurantId(req);

    // Find menu item and verify ownership (no isActive filter)
    const menuItem = await MenuItem.findOne({
      _id: id,
      restaurantId: restaurantId,
    });

    if (!menuItem) {
      return res.status(404).json({
        success: false,
        message: "Menu item not found",
      });
    }

    // Delete associated image if exists
    if (menuItem.image) {
      const imagePath = path.join(__dirname, "..", menuItem.image);
      if (fs.existsSync(imagePath)) {
        try {
          fs.unlinkSync(imagePath);
        } catch (err) {
          console.error("Error deleting image:", err);
          // Continue with deletion even if image deletion fails
        }
      }
    }

    // Hard delete - permanently remove from database
    await MenuItem.findByIdAndDelete(id);

    res.json({
      success: true,
      message: "Menu item deleted successfully",
    });
  } catch (err) {
    console.error("Delete menu item error:", err);
    res.status(500).json({
      success: false,
      message: "Server error while deleting menu item",
      error: err.message,
    });
  }
});

module.exports = router;
