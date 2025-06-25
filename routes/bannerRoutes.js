// routes/bannerRoutes.js
const express = require('express');
const multer = require('multer');
const router = express.Router();
const sharp = require('sharp');
const authMiddleware = require('../middleware/authMiddleware');
const User = require('../models/userModel');
const axios = require("axios");
const { default: mongoose } = require('mongoose');
const bannerModel = require('../models/bannerModel');


// Initialize multer with the storage configuration
const upload = multer({
  limits: { fileSize: 2 * 1024 * 1024 }, // Limit file size to 5MB
  storage: multer.memoryStorage(),
});

// Add banner (only by authenticated user)
router.post('/addBanner', authMiddleware, upload.array('media', 8), async (req, res) => {
  try {
    const { title } = req.body;

    const userId = req.user.id;
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const compressedImages = await Promise.all(
      req.files.map(async (file) => {
        const buffer = await sharp(file.buffer)
          .resize({ width: 800 })
          .jpeg({ quality: 80 })
          .toBuffer();
        return buffer;
      })
    );

    const banner = new bannerModel({
      userId,
      title,
      media: compressedImages,
      createdAt: new Date(),
    });

    await banner.save();

    res.status(201).json({ message: 'Banner added successfully.', banner });
  } catch (err) {
    console.error('Error adding banner:', err);
    res.status(500).json({ message: 'Error adding banner', error: err.message });
  }
});

// route to fetch images related to title text from unsplash by authenticated user
router.get("/generate-images", authMiddleware, async (req, res) => {
  try {
    const { query } = req.query;

    if (!query) {
      return res.status(400).json({ error: "Query parameter is required" });
    }

    const response = await axios.get(
      `https://api.unsplash.com/search/photos`,
      {
        params: { query, per_page: 20 },
        headers: {
          Authorization: `Client-ID ${process.env.UNSPLASH_ACCESS_KEY}`,
        },
      }
    );

    res.json(response.data);
  } catch (error) {
    console.error("Error fetching Unsplash images:", error);
    res.status(500).json({ error: "Failed to fetch images" });
  }
});


// Get banners by authenticated user
router.get('/my-banners', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const banners = await bannerModel.find({ userId });
    if (!banners) {
      return res.status(404).json({ message: 'No banners found for this user.' });
    }
    // Convert only the first media image to base64
    const bannersWithBase64Media = await Promise.all(banners.map(async (banner) => {
      // Get raw media array
      const rawMedia = banner.media || (banner._doc && banner._doc.media) || [];

      // Convert only the first image (if exists) to base64
      const firstImage = rawMedia[0] ? rawMedia[0].toString('base64') : null;

      return {
        ...(banner._doc || banner),
        media: firstImage ? [firstImage] : [],  // Wrap in array for consistency
      };
    }));
    
    res.status(200).json( bannersWithBase64Media.reverse() );
  } catch (err) {
    console.error('Error fetching user banners:', err);
    res.status(500).json({ message: 'Failed to fetch user banners' });
  }
});

// Get banners media only for updating banner by authenticated user
router.get('/bannerMedia/:bannerId',  async (req, res) => {
  try {
    const { bannerId } = req.params;
    const banner = await bannerModel.findById(bannerId);
    
    if (!banner) {
      return res.status(404).json({ message: 'Banner not found' });
    }

    const bannerWithBase64Media = {
      media: banner.media.map((buffer) => buffer.toString('base64')),
    };
    
    res.status(200).json( bannerWithBase64Media );
  } catch (err) {
    console.error('Error fetching admin banners:', err);
    res.status(500).json({ message: 'Failed to fetch admin banners' });
  }
});


// Update banner (only by the user who added it)
router.put('/:id', authMiddleware, upload.array('media', 8), async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const banner = await bannerModel.findOne({ _id: id, userId });
    if (!banner) {
      return res.status(403).json({ message: 'You are not authorized to update this banner' });
    }

    const { title, existingMedia } = req.body;

    // Parse existingMedia to get the IDs of media to keep
    const mediaToKeep = existingMedia ? JSON.parse(existingMedia) : [];

    // Filter existing media to remove any that are not in mediaToKeep
    banner.media = banner.media.filter((_, index) => mediaToKeep.includes(index.toString()));

    // Add new media if provided
    if (req.files) {
      const compressedImages = await Promise.all(
        req.files.map(async (file) => {
          const buffer = await sharp(file.buffer)
            .resize({ width: 800 })
            .jpeg({ quality: 80 })
            .toBuffer();
          return buffer;
        })
      );
      banner.media.push(...compressedImages);
    }

    // Update other post fields
    banner.title = title;
    banner.updatedAt = new Date();

    await banner.save();
    res.json(banner);
  } catch (err) {
    console.error('Error updating banner:', err);
    res.status(500).json({ message: 'Error updating banner' });
  }
});

// Delete banner and all related data (only by the user who posted it)
router.delete('/:id', authMiddleware, async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  
  console.log(`[Banner Deletion] Starting deletion process for banner ID: ${id} by user ID: ${userId}`);

  try {
    // Verify post exists and belongs to user
    const banner = await bannerModel.findOne({ _id: id, userId });
    if (!banner) {
      console.log(`[Banner Deletion] Post not found or unauthorized access attempt`);
      return res.status(403).json({ message: 'You are not authorized to delete this banner' });
    }

    // Start transaction to ensure atomic operations
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
      console.log(`[Banner Deletion] Deleting post ${id} and related data`);
      
      // 1. Delete the banner
      await bannerModel.deleteOne({ _id: id }).session(session);
      
      
      // Commit the transaction
      await session.commitTransaction();
      console.log(`[Banner Deletion] Successfully deleted banner ${id} and all related data`);
      
      res.json({ 
        message: 'Banner and all related data deleted successfully',
      });
    } catch (error) {
      // If any error occurs, abort the transaction
      await session.abortTransaction();
      console.error(`[Banner Deletion] Error during transaction for banner ${id}:`, error);
      throw error;
    } finally {
      session.endSession();
    }
  } catch (err) {
    console.error(`[Banner Deletion] Error deleting banner ${id}:`, err);
    res.status(500).json({ 
      message: 'Error deleting banner and related data',
      error: err.message 
    });
  }
});


module.exports = router;