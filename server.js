// server.js
const express = require('express');
require('dotenv').config(); // Load .env variables
const authRoutes = require('./routes/authRoutes');
const likesRoutes = require('./routes/likesRoutes');
const http = require('http');
const { Server } = require('socket.io');
require('./config/webpush'); // This will initialize webpush
const cors = require('cors');
const connectDB = require('./config/db');


const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    // origin: process.env.CLIENT_URL, // Adjust this to your client's URL
    origin: '*', // Allow all origins (replace with your frontend URL in production)
    methods: ['GET', 'POST'],
  },
});
connectDB();
// Add these lines to parse JSON and URL-encoded data
// Middleware
app.use(express.json()); // To parse JSON request bodies
app.use(express.urlencoded({ extended: true })); // for parsing application/x-www-form-urlencoded

// Allow CORS
app.use(cors());
// app.use(cors({
//   origin: process.env.CLIENT_URL || 'http://localhost:3000',
//   credentials: true,
//   methods: ['GET', 'POST', 'PUT', 'DELETE'],
//   allowedHeaders: ['Content-Type', 'Authorization']
// }));

// Pass io instance to routes
app.use((req, res, next) => {
  req.io = io;
  next();
});

// Add to server.js after other imports
// const webpush = require('web-push');

// // Configure VAPID keys (should be in your .env)
// webpush.setVapidDetails(
//   `mailto:${process.env.VAPID_EMAIL}`,
//   process.env.VAPID_PUBLIC_KEY,
//   process.env.VAPID_PRIVATE_KEY
// );

// // Export the configured webpush
// module.exports.webpush = webpush;

// Define routes
app.use('/api/auth', authRoutes);
app.use('/api/posts', require('./routes/postsRoutes'));
app.use('/api/wishlist', require('./routes/wishlistRoutes'));
app.use("/api/likes", likesRoutes);
app.use('/api/chats', require('./routes/chatRoutes'));
app.use('/api/notifications', require('./routes/notificationRoutes'));

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

const onlineUsers = new Map();

io.on('connection', (socket) => {
  console.log('a user connected:', socket.id);

  socket.on('joinRoom', (room) => {
    socket.join(room);
    console.log(`User ${socket.id} joined room ${room}`);
  });

  socket.on('joinChatRoom', ({ postId, userId, otherUserId }) => {
    const room = `post_${postId}_user_${userId}_user_${otherUserId}`;
    socket.join(room);
    console.log(`User ${socket.id} joined chat room ${room}`);
  });

  socket.on('leaveChatRoom', ({ postId, userId, otherUserId }) => {
    const room = `post_${postId}_user_${userId}_user_${otherUserId}`;
    socket.leave(room);
    console.log(`User ${socket.id} left chat room ${room}`);
  });

  // Add this new event listener for real-time seen status
  socket.on('messageSeen', ({ room, messageId }) => {
    // Broadcast to all in the room except the sender
    socket.to(room).emit('messageSeenUpdate', { messageId });
  });

  // (1) Tracks When a user logs in (frontend emits 'userOnline')
  socket.on('userOnline', (userId) => {
    onlineUsers.set(userId, socket.id);
    console.log(`User ${userId} is online`);
    io.emit('userStatusChange', { userId, isOnline: true });
  });

  // (2) Tracks When a user closes chat (frontend emits 'userAway')
  socket.on('userAway', (userId) => {
    if (onlineUsers.has(userId)) {
      onlineUsers.delete(userId);
      console.log(`User ${userId} is away (closed chat)`);
      io.emit('userStatusChange', { userId, isOnline: false });
    }
  });

  // (3) Tracks When a user disconnects (browser closed/tab refreshed)
  socket.on('disconnect', () => {
    // Find which user disconnected
    for (const [userId, socketId] of onlineUsers.entries()) {
      if (socketId === socket.id) {
        onlineUsers.delete(userId);
        console.log(`User ${userId} went offline (disconnected)`);
        io.emit('userStatusChange', { userId, isOnline: false });
        break;
      }
    }
  });

  // Handle typing events
  socket.on('typing', ({ postId, userId, otherUserId, isTyping }) => {
    // Use the same room format as your chat messages
    const room = `post_${postId}_user_${userId}_user_${otherUserId}`;
    
    // Broadcast to the other user in this chat
    socket.to(room).emit('userTyping', { 
      userId, 
      isTyping,
      postId
    });
    
    console.log(`User ${userId} typing in post ${postId} (room: ${room})`);
  });

  socket.on('checkOnlineStatus', (userIdToCheck, callback) => {
    callback(onlineUsers.has(userIdToCheck));
  });

  socket.on('disconnect', () => {
    console.log('user disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 5012;
server.listen(PORT, '0.0.0.0', () => console.log(`Server running on port http://192.168.122.172:${PORT}`));
