// server.js
const express = require('express');
require('dotenv').config(); // Load .env variables
const authRoutes = require('./routes/authRoutes');
const likesRoutes = require('./routes/likesRoutes');
const http = require('http');
const { Server } = require('socket.io');

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

// Pass io instance to routes
app.use((req, res, next) => {
  req.io = io;
  next();
});

// Define routes
app.use('/api/auth', authRoutes);
app.use('/api/posts', require('./routes/postsRoutes'));
app.use('/api/wishlist', require('./routes/wishlistRoutes'));
app.use("/api/likes", likesRoutes);
app.use('/api/chats', require('./routes/chatRoutes'));

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

io.on('connection', (socket) => {
    console.log('a user connected:', socket.id);

    socket.on('joinRoom', (room) => {
        socket.join(room);
        console.log(`User ${socket.id} joined room ${room}`);
    });

    // socket.on('sendMessage', async (data) => {
    //     const { room, message } = data;
    //     io.to(room).emit('receiveMessage', message);
    // });

    socket.on('disconnect', () => {
        console.log('user disconnected:', socket.id);
    });
});

const PORT = process.env.PORT || 5012;
server.listen(PORT, '0.0.0.0', () => console.log(`Server running on port http://192.168.31.172:${PORT}`));
