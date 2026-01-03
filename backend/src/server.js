const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
require('dotenv').config();
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

// Get frontend URL from environment variable
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:8080';

// Dynamic CORS configuration
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    // Allow trycloudflare.com subdomains
    if (origin.endsWith('.trycloudflare.com')) {
      return callback(null, true);
    }
    
    // Allow duckdns.org domain
    if (origin === 'https://abhu.duckdns.org') {
      return callback(null, true);
    }
    
    // Allow configured frontend URL
    if (origin === FRONTEND_URL) {
      return callback(null, true);
    }
    
    // Allow localhost in development
    if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
      return callback(null, true);
    }
    
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"]
};

// Socket.io setup with dynamic CORS
const io = new Server(server, {
  cors: {
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);
      if (origin.endsWith('.trycloudflare.com')) return callback(null, true);
      if (origin === 'https://abhu.duckdns.org') return callback(null, true);
      if (origin === FRONTEND_URL) return callback(null, true);
      if (origin.includes('localhost') || origin.includes('127.0.0.1')) return callback(null, true);
      callback(new Error('Not allowed by CORS'));
    },
    methods: ["GET", "POST"],
    credentials: true
  }
});

// Make io accessible in routes
app.set('io', io);

// Middlewares
app.use(cors(corsOptions));
app.use(express.json());

// Serve uploads statically
app.use('/src/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes
app.use("/api/restaurant", restaurantRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/sections", sectionRoutes);
app.use("/api/menuitems", menuItemRoutes);
app.use("/api/tables", tableRoutes);
app.use("/api/menu", menuRoutes);
app.use("/api/orders", require("./routes/orders"));
app.use("/api/staff", staffRoutes);
app.use("/api/chef", chefRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'QR Menu API is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// MongoDB connection
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/qrmenu";
mongoose
  .connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("✅ MongoDB connected to:", MONGODB_URI))
  .catch((err) => console.error("❌ MongoDB connection error:", err));

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log('🔌 Client connected:', socket.id);

  // Join restaurant-specific room
  socket.on('join-restaurant', (restaurantId) => {
    socket.join(`restaurant-${restaurantId}`);
    console.log(`Socket ${socket.id} joined restaurant-${restaurantId}`);
  });

  socket.on('disconnect', () => {
    console.log('❌ Client disconnected:', socket.id);
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('🔥 Error:', err.stack);
  res.status(500).json({
    success: false,
    message: 'Something went wrong!',
    ...(process.env.NODE_ENV === 'development' && { error: err.message })
  });
});

// Start server
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌐 CORS enabled for: ${FRONTEND_URL}, https://abhu.duckdns.org and *.trycloudflare.com`);
  console.log(`🧭 Environment: ${process.env.NODE_ENV || 'development'}`);
});
