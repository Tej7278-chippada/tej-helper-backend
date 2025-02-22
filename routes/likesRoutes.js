// /routes/likesRoutes.js
const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const authMiddleware = require('../middleware/authMiddleware');
const likesModel = require('../models/likesModel');
// const Product = require('../models/Product');
// const Likes = require('../models/Likes');
// const { authMiddleware } = require('../middleware/auth');

// Toggle like on a post
router.post('/:id/like', authMiddleware, async (req, res) => {
    try {
      const { id: postId } = req.params;
      const userId = req.user.id;
  
      let likeEntry = await likesModel.findOne({ postId });
  
      if (!likeEntry) {
        // If no entry for the post, create a new one
        likeEntry = await likesModel.create({ postId, userIds: [userId] });
        // await Product.findByIdAndUpdate(productId, { $inc: { likes: 1 } });
      } else {
        const userIndex = likeEntry.userIds.indexOf(userId);
  
        if (userIndex === -1) {
          // If user hasn't liked it yet, add the user ID
          likeEntry.userIds.push(userId);
          // await Product.findByIdAndUpdate(productId, { $inc: { likes: 1 } });
        } else {
          // If user has liked it, remove the user ID
          likeEntry.userIds.splice(userIndex, 1);
          // await Product.findByIdAndUpdate(productId, { $inc: { likes: -1 } });
        }
  
        await likeEntry.save();
      }
  
      // const updatedProduct = await Product.findById(productId);
  
      res.status(200).json({
        message: 'Like toggled successfully',
        likes: likeEntry.userIds.length,
      });
    } catch (error) {
      console.error('Error toggling likes:', error);
      res.status(500).json({ message: 'Error toggling likes' });
    }
  });

  // Get likes count for a product
  router.get('/:id/count', async (req, res) => {
    try {
      const { id: postId } = req.params;
      const likeEntry = await likesModel.findOne({ postId });
      const likesCount = likeEntry ? likeEntry.userIds.length : 0;

      res.status(200).json({ likes: likesCount });
    } catch (error) {
      console.error('Error fetching likes count:', error);
      res.status(500).json({ message: 'Error fetching likes count' });
    }
  });

  // checking like is on product by the user
  router.get('/:id/isLiked', authMiddleware, async (req, res) => {
    try {
      const { id: postId } = req.params;
      const userIds = req.user.id;
  
      const existingLike = await likesModel.findOne({ userIds, postId });
  
      res.status(200).json({ isLiked: !!existingLike });
    } catch (error) {
      console.error('Error checking like status:', error);
      res.status(500).json({ message: 'Error checking like status' });
    }
  });
  
  
  module.exports = router;
