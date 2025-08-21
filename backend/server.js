console.log('🚀 Server starting...');
require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');

const pollRoutes = require('./routes/pollRoutes');
const attachSocketManager = require('./utils/socketManager');

const app = express();
const server = http.createServer(app);

// CORS
const corsOrigin = process.env.CORS_ORIGIN || 'http://localhost:3000';
app.use(cors({ origin: corsOrigin, methods: ['GET', 'POST', 'PUT', 'DELETE'] }));
app.use(express.json());

// Health check
app.get('/health', (req, res) => res.json({ ok: true }));

// REST routes (bonus)
app.use('/api/polls', pollRoutes);

// Socket.IO
const io = new Server(server, {
  cors: {
    origin: corsOrigin,
    methods: ['GET', 'POST']
  }
});
attachSocketManager(io);

// MongoDB connect
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/intervue_poll';
mongoose
  .connect(MONGODB_URI)
  .then(() => console.log('✅ MongoDB connected'))
  .catch((err) => {
    console.error('❌ MongoDB connection error:', err);
    process.exit(1);
  });

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
