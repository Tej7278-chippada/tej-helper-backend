// server.js
const express = require('express');
require('dotenv').config(); // Load .env variables
const authRoutes = require('./routes/authRoutes');

const cors = require('cors');
const connectDB = require('./config/db');


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
app.use('/api/posts', require('./routes/postsRoutes'));

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

const PORT = process.env.PORT || 5012;
app.listen(PORT, '0.0.0.0', () => console.log(`Server running on port http://192.168.54.172:${PORT}`));
