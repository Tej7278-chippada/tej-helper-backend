// routes/feedbackRoutes.js
const express = require('express');
const multer = require('multer');
const router = express.Router();
const sharp = require('sharp');
const authMiddleware = require('../middleware/authMiddleware');
const User = require('../models/userModel');
const axios = require("axios");
const { default: mongoose } = require('mongoose');
const feedbackModel = require('../models/feedbackModel');


// Initialize multer with the storage configuration
const upload = multer({
  limits: { fileSize: 2 * 1024 * 1024 }, // Limit file size to 5MB
  storage: multer.memoryStorage(),
});

// Add feedback (only by authenticated user)
router.post('/addFeedback', authMiddleware, upload.array('media', 3), async (req, res) => {
  try {
    const { feedback } = req.body;

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

    const feedbacks = new feedbackModel({
      userId,
      feedback,
      media: compressedImages,
      createdAt: new Date(),
    });

    await feedbacks.save();

    res.status(201).json({ message: 'Feedback added successfully.', feedbacks });
  } catch (err) {
    console.error('Error adding feedback:', err);
    res.status(500).json({ message: 'Error adding feedback', error: err.message });
  }
});

// Get all feedbacks by admin - FIXED
router.get('/all-feedbacks', authMiddleware, async (req, res) => {
  try {
    // Fixed: Added .find() and .populate() to get user details
    const feedbacks = await feedbackModel.find().populate('userId', 'name email username');
    
    if (!feedbacks || feedbacks.length === 0) {
      return res.status(404).json({ message: 'No feedbacks found.' });
    }
    
    // Convert each feedback's media buffer to base64
    const feedbacksWithBase64Media = feedbacks.map((feedback) => ({
      ...feedback._doc,
      media: feedback.media.map((buffer) => buffer.toString('base64')),
    }));
    
    res.status(200).json(feedbacksWithBase64Media.reverse());
  } catch (err) {
    console.error('Error fetching users feedbacks:', err);
    res.status(500).json({ message: 'Failed to fetch users feedbacks' });
  }
});

// Update feedback status (admin only)
router.put('/update-feedback/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, adminNotes } = req.body;

    // Check if user is admin
    // const user = await User.findById(req.user.id);
    // if (!user || !user.isAdmin) {
    //   return res.status(403).json({ message: 'Unauthorized' });
    // }

    const updatedFeedback = await feedbackModel.findByIdAndUpdate(
      id,
      { status, adminNotes, updatedAt: Date.now() },
      { new: true }
    );

    if (!updatedFeedback) {
      return res.status(404).json({ message: 'Feedback not found' });
    }

    res.status(200).json(updatedFeedback);
  } catch (err) {
    console.error('Error updating feedback:', err);
    res.status(500).json({ message: 'Failed to update feedback', error: err.message });
  }
});


module.exports = router;