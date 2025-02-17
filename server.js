// server.js
const express = require('express');
require('dotenv').config(); // Load .env variables
const authRoutes = require('./routes/authRoutes');
const groupRoutes = require('./routes/groupRoutes');
const groupTransactionRoutes = require('./routes/groupTransactionRoutes');

const cors = require('cors');
const connectDB = require('./config/db');
const http = require('http'); // Import http module for Socket.IO
const { Server } = require('socket.io'); // Import Socket.IO


const app = express();
connectDB();
// Add these lines to parse JSON and URL-encoded data
// Middleware
app.use(express.json()); // To parse JSON request bodies
app.use(express.urlencoded({ extended: true })); // for parsing application/x-www-form-urlencoded

// Allow CORS
app.use(cors());

// Define routes
app.use('/api/auth', authRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/group-transactions', groupTransactionRoutes);

// Define your route to serve images by ID
// app.get('/:id', async (req, res) => {
//     try {
//       const media = await Product.findById(req.params.id);
//       if (media) {
//         res.set('Content-Type', 'image/jpeg');
//         res.send(Buffer.from(media.data, 'base64')); // Assuming `media.data` is stored as base64
//       } else {
//         res.status(404).send('Image not found');
//       }
//     } catch (error) {
//       console.error('Error fetching image:', error);
//       res.status(500).send('Server error');
//     }
//   });

// Create HTTP server
const server = http.createServer(app);

// Initialize Socket.IO
const io = new Server(server, {
  cors: {
    origin: '*', // Allow all origins (replace with your frontend URL in production)
    methods: ['GET', 'POST'],
  },
});

// Socket.IO connection handler
io.on('connection', (socket) => {
  console.log('A user connected:', socket.id);

  // Handle joining a group room
  socket.on('joinGroup', (groupId) => {
    socket.join(groupId); // Join the room for the specific group
    console.log(`User ${socket.id} joined group room: ${groupId}`);
  });

  // Handle log updates
  socket.on('updateLogs', (groupId, log) => {
    io.to(groupId).emit('newLog', log); // Emit the new log to all clients in the group
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log('A user disconnected:', socket.id);
  });
});

// Make io accessible in other files (e.g., routes)
app.set('io', io);

const PORT = process.env.PORT || 5010;
server.listen(PORT, '0.0.0.0', () => console.log(`Server running on port http://192.168.54.172:${PORT}`));
