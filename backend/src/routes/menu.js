const express = require("express");
const Table = require("../models/Table");
const Section = require("../models/Section");
const MenuItem = require("../models/MenuItem");

const router = express.Router();

// ==== GET Menu by Table ID (PUBLIC - for customers) ====
router.get("/table/:tableId", async (req, res) => {
  try {
    const { tableId } = req.params;

    console.log("Getting menu for table:", tableId);

    // Find table first
    const table = await Table.findById(tableId);
    if (!table)
      return res
        .status(404)
        .json({ success: false, message: "Table not found" });

    console.log("Found table:", table.tableName, "restaurantId:", table.restaurantId);

    // Try to populate restaurant
    let restaurant = null;
    const Restaurant = require("../models/Restaurant");
    
    try {
      await table.populate("restaurantId", "restaurantName email templateStyle logo ownerId");
      restaurant = table.restaurantId;
      
      // Check if populate worked (restaurant should be an object with _id)
      if (!restaurant || !restaurant._id) {
        console.warn("⚠️ Populate failed - restaurantId might be a User ID. Attempting fallback...");
        throw new Error("Populate failed");
      }
      
      console.log("✅ Restaurant populated:", restaurant.restaurantName, "Template:", restaurant.templateStyle, "ownerId:", restaurant.ownerId);
    } catch (populateError) {
      // Fallback: If populate failed, the restaurantId might be a User ID
      // Try to find the restaurant by ownerId
      console.log("🔄 Attempting fallback: treating restaurantId as User ID");
      restaurant = await Restaurant.findOne({
        ownerId: table.restaurantId,
        isActive: true,
      });
      
      if (!restaurant) {
        // Last resort: try to find restaurant by _id directly
        console.log("🔄 Last resort: trying to find restaurant by _id");
        restaurant = await Restaurant.findById(table.restaurantId);
        
        if (!restaurant) {
          console.error("❌ Could not find restaurant for table:", tableId, "restaurantId:", table.restaurantId);
          return res.status(500).json({
            success: false,
            message: "Restaurant not found. Please run migration script.",
          });
        }
      }
      
      console.log("✅ Found restaurant via fallback:", restaurant.restaurantName, "Template:", restaurant.templateStyle, "ownerId:", restaurant.ownerId);
    }

    // Use Restaurant _id for filtering sections and menu items.
    // Section and MenuItem schemas define restaurantId as a ref to Restaurant,
    // so we must query by restaurant._id, NOT ownerId.
    const restaurantObjectId = restaurant._id;

    if (!restaurantObjectId) {
      console.error("❌ Restaurant _id is missing! Restaurant:", restaurant);
      return res.status(500).json({
        success: false,
        message: "Restaurant configuration error. Please contact support.",
      });
    }

    console.log("🔍 Using restaurantId for filtering sections and menu items:", restaurantObjectId);
    console.log("🔍 Restaurant._id:", restaurant._id);
    console.log("🔍 Table.restaurantId:", table.restaurantId);

    // Sort sections by sequence - only active sections for customers
    const sections = await Section.find({
      restaurantId: restaurantObjectId,
      isActive: true,
    }).sort({ sequence: 1, createdAt: 1 });

    console.log("📋 Found sections:", sections.length);
    if (sections.length > 0) {
      console.log("📋 Section IDs:", sections.map(s => s._id));
      console.log("📋 Section names:", sections.map(s => s.name));
    } else {
      console.warn("⚠️ No sections found! Checking all sections for this restaurantId...");
      const allSections = await Section.find({ restaurantId: restaurantObjectId });
      console.log("📋 All sections (including inactive):", allSections.length);
      if (allSections.length > 0) {
        console.log("📋 All section names:", allSections.map(s => ({ name: s.name, isActive: s.isActive })));
      }
    }

    // Get ONLY ACTIVE menu items for customers
    const menuItems = await MenuItem.find({
      restaurantId: restaurantObjectId,
      isActive: true, // Customers only see active items
    })
      .populate("sectionId", "name")
      .sort({ sequence: 1, createdAt: 1 });

    console.log("🍽️ Found menu items:", menuItems.length);
    if (menuItems.length > 0) {
      console.log("🍽️ Menu item names:", menuItems.map(item => item.name));
      console.log("🍽️ Menu item sectionIds:", menuItems.map(item => {
        const sectionId = typeof item.sectionId === "object" ? item.sectionId._id : item.sectionId;
        return sectionId;
      }));
    } else {
      console.warn("⚠️ No active menu items found! Checking all menu items for this restaurantId...");
      const allMenuItems = await MenuItem.find({ restaurantId: restaurantObjectId });
      console.log("🍽️ All menu items (including inactive):", allMenuItems.length);
      if (allMenuItems.length > 0) {
        console.log("🍽️ All menu item names:", allMenuItems.map(item => ({ name: item.name, isActive: item.isActive })));
      }
    }

    const sectionsWithItems = sections.map((section) => ({
      ...section.toObject(),
      id: section._id,
      items: menuItems
        .filter((item) => {
          const itemSectionId =
            typeof item.sectionId === "object"
              ? item.sectionId._id
              : item.sectionId;
          return itemSectionId.toString() === section._id.toString();
        })
        .map((item) => {
          // Migrate old addons to addonGroups for backward compatibility
          let addonGroups = item.addonGroups || [];

          // If there are old addons but no addon groups, migrate them
          if (
            (!addonGroups || addonGroups.length === 0) &&
            item.addons &&
            item.addons.length > 0
          ) {
            addonGroups = [
              {
                title: "Add-ons",
                multiSelect: true,
                items: item.addons,
              },
            ];
          }

          return {
            ...item.toObject(),
            id: item._id,
            sectionId:
              typeof item.sectionId === "object"
                ? item.sectionId._id
                : item.sectionId,
            addonGroups: addonGroups,
            // Keep old addons for backward compatibility
            addons: item.addons || [],
          };
        })
        .sort((a, b) => (a.sequence || 0) - (b.sequence || 0)),
    }));

    res.json({
      success: true,
      data: {
        restaurant: {
          name: restaurant?.restaurantName || "Restaurant",
          id: restaurant?._id,
          templateStyle: restaurant?.templateStyle || "classic",
          logo: restaurant?.logo || null,
        },
        table: {
          id: table._id,
          tableName: table.tableName,
          seats: table.seats,
          restaurantId: restaurantObjectId,
        },
        menu: sectionsWithItems,
      },
    });
  } catch (err) {
    console.error("Get menu by table error:", err);
    res
      .status(500)
      .json({
        success: false,
        message: "Server error while fetching menu",
        error: err.message,
      });
  }
});

module.exports = router;