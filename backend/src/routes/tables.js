const express = require("express");
const mongoose = require("mongoose");
const router = express.Router();
const Table = require("../models/Table");
const Restaurant = require("../models/Restaurant");
const authMiddleware = require("../middleware/authMiddleware");

// GET /api/tables/validate/:tableId - Validate if table exists and is active (public endpoint)
router.get("/validate/:tableId", async (req, res) => {
  try {
    const { tableId } = req.params;

    // Check if tableId is a valid MongoDB ObjectId
    if (!mongoose.Types.ObjectId.isValid(tableId)) {
      return res.status(404).json({
        success: false,
        message: "Invalid table ID format",
      });
    }

    // Find active table
    const table = await Table.findOne({
      _id: tableId,
      isActive: true,
    }).populate("restaurantId", "restaurantName");

    if (!table) {
      return res.status(404).json({
        success: false,
        message: "Table not found or inactive",
      });
    }

    res.json({
      success: true,
      data: {
        tableId: table._id,
        tableName: table.tableName,
        seats: table.seats,
        restaurant: {
          id: table.restaurantId._id,
          name: table.restaurantId.restaurantName,
        },
      },
    });
  } catch (error) {
    console.error("Validate table error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while validating table",
    });
  }
});

// Middleware to authenticate all other table routes (after public validation route)
router.use(authMiddleware);

// GET /api/tables - Get all tables for the logged-in restaurant
router.get("/", async (req, res) => {
  try {
    if (!req.restaurantId) {
      return res.status(404).json({
        success: false,
        message: "Restaurant not found for this user",
      });
    }
    
    const restaurantId = req.restaurantId;

    const tables = await Table.find({
      restaurantId: restaurantId,
      isActive: true,
    }).sort({ createdAt: -1 });

    res.json({
      success: true,
      data: tables,
      count: tables.length,
    });
  } catch (error) {
    console.error("Get tables error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching tables",
    });
  }
});

// POST /api/tables - Create a new table
router.post("/", async (req, res) => {
  try {
    const { tableName, seats = 4 } = req.body;

    // Validation
    if (!tableName || tableName.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "Table name is required",
      });
    }

    if (seats < 1 || seats > 20) {
      return res.status(400).json({
        success: false,
        message: "Seats must be between 1 and 20",
      });
    }

    if (!req.restaurantId) {
      return res.status(404).json({
        success: false,
        message: "Restaurant not found for this user",
      });
    }
    
    const restaurantId = req.restaurantId;

    // Check if table name already exists for this restaurant
    const existingTable = await Table.findOne({
      restaurantId: restaurantId,
      tableName: tableName.trim(),
      isActive: true,
    });

    if (existingTable) {
      return res.status(400).json({
        success: false,
        message: "Table with this name already exists",
      });
    }

    // Create new table
    const table = new Table({
      restaurantId: restaurantId,
      tableName: tableName.trim(),
      seats: parseInt(seats),
    });

    const savedTable = await table.save();

    // Update QR code URL with the actual table ID if not set
    if (!savedTable.qrCodeUrl) {
      const frontendUrl = process.env.FRONTEND_URL || "http://localhost:8080";
      savedTable.qrCodeUrl = `${frontendUrl}/order/${savedTable._id}`;
      await savedTable.save();
    }

    res.status(201).json({
      success: true,
      message: "Table created successfully",
      data: savedTable,
    });
  } catch (error) {
    console.error("Create table error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while creating table",
    });
  }
});

// PUT /api/tables/:tableId - Edit table details
router.put("/:tableId", async (req, res) => {
  try {
    const { tableId } = req.params;
    const { tableName, seats } = req.body;

    // Validation
    if (!tableName || tableName.trim() === "") {
      return res.status(400).json({
        success: false,
        message: "Table name is required",
      });
    }

    if (seats && (seats < 1 || seats > 20)) {
      return res.status(400).json({
        success: false,
        message: "Seats must be between 1 and 20",
      });
    }

    if (!req.restaurantId) {
      return res.status(404).json({
        success: false,
        message: "Restaurant not found for this user",
      });
    }
    
    const restaurantId = req.restaurantId;

    // Find table and verify ownership
    const table = await Table.findOne({
      _id: tableId,
      restaurantId: restaurantId,
      isActive: true,
    });

    if (!table) {
      return res.status(404).json({
        success: false,
        message: "Table not found",
      });
    }

    // Check if new table name already exists (excluding current table)
    if (tableName.trim() !== table.tableName) {
      const existingTable = await Table.findOne({
        restaurantId: restaurantId,
        tableName: tableName.trim(),
        isActive: true,
        _id: { $ne: tableId },
      });

      if (existingTable) {
        return res.status(400).json({
          success: false,
          message: "Table with this name already exists",
        });
      }
    }

    // Update table
    table.tableName = tableName.trim();
    if (seats) {
      table.seats = parseInt(seats);
    }

    await table.save();

    res.json({
      success: true,
      message: "Table updated successfully",
      data: table,
    });
  } catch (error) {
    console.error("Update table error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while updating table",
    });
  }
});

// DELETE /api/tables/:tableId - Delete a table (hard delete)
router.delete("/:tableId", async (req, res) => {
  try {
    const { tableId } = req.params;

    if (!req.restaurantId) {
      return res.status(404).json({
        success: false,
        message: "Restaurant not found for this user",
      });
    }
    
    const restaurantId = req.restaurantId;

    // Find table and verify ownership
    const table = await Table.findOne({
      _id: tableId,
      restaurantId: restaurantId,
      isActive: true,
    });

    if (!table) {
      return res.status(404).json({
        success: false,
        message: "Table not found",
      });
    }

    // Hard delete - permanently remove from database
    await Table.findByIdAndDelete(tableId);

    res.json({
      success: true,
      message: "Table deleted successfully",
    });
  } catch (error) {
    console.error("Delete table error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while deleting table",
    });
  }
});

// GET /api/tables/:tableId/qr - Get QR code download URL (dummy implementation)
router.get("/:tableId/qr", async (req, res) => {
  try {
    const { tableId } = req.params;

    if (!req.restaurantId) {
      return res.status(404).json({
        success: false,
        message: "Restaurant not found for this user",
      });
    }
    
    const restaurantId = req.restaurantId;

    // Find table and verify ownership
    const table = await Table.findOne({
      _id: tableId,
      restaurantId: restaurantId,
      isActive: true,
    });

    if (!table) {
      return res.status(404).json({
        success: false,
        message: "Table not found",
      });
    }

    // Return dummy QR code data (in production, this would generate actual QR code)
    res.json({
      success: true,
      data: {
        tableId: table._id,
        tableName: table.tableName,
        qrCodeUrl: table.qrCodeUrl,
        downloadUrl: `/api/tables/${tableId}/qr/download`,
        metadata: {
          restaurant: "Restaurant", // We don't have access to restaurant name in JWT
          table: table.tableName,
          orderUrl: table.qrCodeUrl,
          generatedAt: new Date().toISOString(),
        },
      },
    });
  } catch (error) {
    console.error("Get QR code error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while fetching QR code",
    });
  }
});

// GET /api/tables/:tableId/qr/download - Download dummy QR code file
router.get("/:tableId/qr/download", async (req, res) => {
  try {
    const { tableId } = req.params;

    if (!req.restaurantId) {
      return res.status(404).json({
        success: false,
        message: "Restaurant not found for this user",
      });
    }
    
    const restaurantId = req.restaurantId;

    // Find table and verify ownership
    const table = await Table.findOne({
      _id: tableId,
      restaurantId: restaurantId,
      isActive: true,
    });

    if (!table) {
      return res.status(404).json({
        success: false,
        message: "Table not found",
      });
    }

    // Create dummy QR code content (SVG format for simplicity)
    const dummyQRCode = `
      <svg width="200" height="200" xmlns="http://www.w3.org/2000/svg">
        <rect width="200" height="200" fill="white"/>
        <rect x="20" y="20" width="160" height="160" fill="none" stroke="black" stroke-width="2"/>
        <text x="100" y="90" text-anchor="middle" font-family="Arial" font-size="12" fill="black">
          QR CODE
        </text>
        <text x="100" y="110" text-anchor="middle" font-family="Arial" font-size="10" fill="black">
          ${table.tableName}
        </text>
        <text x="100" y="130" text-anchor="middle" font-family="Arial" font-size="8" fill="gray">
          ${table.qrCodeUrl}
        </text>
      </svg>
    `.trim();

    res.setHeader("Content-Type", "image/svg+xml");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${table.tableName}-QR.svg"`
    );
    res.send(dummyQRCode);
  } catch (error) {
    console.error("Download QR code error:", error);
    res.status(500).json({
      success: false,
      message: "Server error while downloading QR code",
    });
  }
});

module.exports = router;
