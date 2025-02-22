const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const User = require('../models/userModel');
const postsModel = require('../models/postsModel');
// const User = require('../models/userModel');
// const { authMiddleware } = require('../middleware/auth');
// const { authMiddleware } = require('../middleware/auth');
// const User = require('../models/userModel');
// const Product = require('../models/Product');
const router = express.Router();

// Add post to wishlist
router.post('/add', authMiddleware, async (req, res) => {
    const { postId } = req.body;
    const userId = req.user.id; // Extract from JWT token
    try {
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ message: 'User not found' });
        const post = await postsModel.findById(postId);
        if (!post) return res.status(404).json({ message: 'Post not found' });
        if (!user.wishlist.includes(postId)) {
            user.wishlist.push(postId);
            await user.save();
            return res.status(200).json({ message: 'Post added to wishlist', wishlist: user.wishlist });
        }
        res.status(400).json({ message: 'Post already in wishlist' });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error });
    }
});

// Remove product from wishlist
router.post('/remove', authMiddleware, async (req, res) => {
    const { postId } = req.body;
    const userId = req.user.id; // Extract from JWT token
    try {
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ message: 'User not found' });
        user.wishlist = user.wishlist.filter(id => id.toString() !== postId);
        await user.save();
        res.status(200).json({ message: 'Post removed from wishlist', wishlist: user.wishlist });
    } catch (error) {
        res.status(500).json({ message: 'Server error', error });
    }
});

// Fetch user's wishlist
router.get('/', authMiddleware, async (req, res) => {
    const userId = req.user.id; // Extract from JWT token
    try {
        const user = await User.findById(userId).populate('wishlist');
        if (!user) return res.status(404).json({ message: 'User not found' });

        // Convert wishlist post media buffers to base64
        const wishlistWithMedia = user.wishlist.map((post) => ({
            ...post._doc,
            media: post.media.map((buffer) => buffer.toString('base64')),
        }));

        res.status(200).json({ wishlist: wishlistWithMedia });
    } catch (error) {
        console.error('Error fetching wishlist:', error);
        res.status(500).json({ message: 'Server error', error });
    }
});

// Check if product is in wishlist
router.get('/is-in-wishlist/:postId', authMiddleware, async (req, res) => {
    const userId = req.user.id;
    const { postId } = req.params;
    
    try {
      const user = await User.findById(userId);
      if (!user) return res.status(404).json({ message: 'User not found' });
  
      const isInWishlist = user.wishlist.includes(postId);
      res.status(200).json({ isInWishlist });
    } catch (error) {
      res.status(500).json({ message: 'Server error', error });
    }
});
  

module.exports = router;