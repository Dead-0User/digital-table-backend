const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");
const http = require("http");
const { Server } = require("socket.io");
require("dotenv").config();

const restaurantRoutes = require("./routes/restaurant");
const authRoutes = require("./routes/auth");
const sectionRoutes = require("./routes/section");
const menuItemRoutes = require("./routes/menuItem");
const tableRoutes = require("./routes/tables");
const menuRoutes = require("./routes/menu");
const staffRoutes = require("./routes/staff");
const chefRoutes = require("./routes/chef");

const app = express();
const server = http.createServer(app);

/* =====================================================
   CORS
   Let Caddy handle headers — Express should not block
===================================================== */

app.use(
  cors({
    origin: true, // trust reverse proxy (Caddy)
    credentials: true,
  })
);

/* =====================================================
   Middlewares
===================================================== */

app.use(express.json());
app.use("/src/uploads", express.static(path.join(__dirname, "uploads")));

/* =====================================================
   Routes
===================================================== */

app.use("/api/restaurant", restaurantRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/sections", sectionRoutes);
app.use("/api/menuitems", menuItemRoutes);
app.use("/api/tables", tableRoutes);
app.use("/api/menu", menuRoutes);
app.use("/api/orders", require("./routes/orders"));
app.use("/api/staff", staffRoutes);
app.use("/api/chef", chefRoutes);

/* =====================================================
   Health Check
===================================================== */

app.get("/api/health", (req, res) => {
  res.json({
    status: "OK",
    message: "QR Menu API is running",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || "development",
  });
});

/* =====================================================
   MongoDB
===================================================== */

const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/qrmenu";

mongoose
  .connect(MONGODB_URI)
  .then(() => console.log("✅ MongoDB connected:", MONGODB_URI))
  .catch((err) => console.error("❌ MongoDB connection error:", err));

/* =====================================================
   Socket.IO
===================================================== */

const io = new Server(server, {
  cors: {
    origin: true,
    credentials: true,
  },
});

app.set("io", io);

io.on("connection", (socket) => {
  console.log("🔌 Client connected:", socket.id);

  socket.on("join-restaurant", (restaurantId) => {
    socket.join(`restaurant-${restaurantId}`);
    console.log(
      `📦 Socket ${socket.id} joined restaurant-${restaurantId}`
    );
  });

  socket.on("disconnect", () => {
    console.log("❌ Client disconnected:", socket.id);
  });
});

/* =====================================================
   Global Error Handler
===================================================== */

app.use((err, req, res, next) => {
  console.error("🔥 Error:", err);
  res.status(500).json({
    success: false,
    message: "Internal Server Error",
    ...(process.env.NODE_ENV === "development" && {
      error: err.message,
    }),
  });
});

/* =====================================================
   Start Server
===================================================== */

const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🧭 Environment: ${process.env.NODE_ENV || "development"}`);
  console.log("🌐 CORS handled by Caddy");
});
