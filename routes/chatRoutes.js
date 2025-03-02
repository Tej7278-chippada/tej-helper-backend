// routes/chatRoutes.js
const express = require('express');
const chatModel = require('../models/chatModel');
const authMiddleware = require('../middleware/authMiddleware');
const postsModel = require('../models/postsModel');
const router = express.Router();
// const Chat = require('../models/chatModel');
// const auth = require('../middleware/auth');

// Get chat history for post posted users
router.get('/chatHistory', authMiddleware, async (req, res) => {
  try {
    const { buyerId } = req.query;
    const chat = await chatModel.findOne({ buyerId }).populate("buyerId", "username profilePic");
    if (!chat) return res.status(404).json({ message: "Chat not found" });

    res.json(chat);
  } catch (error) {
    res.status(500).json({ message: "Error fetching chat history" });
  }
});

// Get chat history for post intersted users
router.get('/', authMiddleware, async (req, res) => {
  try {
    const { postId, buyerId } = req.query;
    const chat = await chatModel.findOne({ postId, buyerId }).populate(); //'messages.senderId'
    if (!chat) {
      return res.status(404).json({ message: 'Chat not found' });
    }
    res.json(chat);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching chat history' });
  }
});

// Send a message by the user who intersts on the post
router.post('/send', authMiddleware, async (req, res) => {
  try {
    const { postId, sellerId, buyerId, text } = req.body;
    console.log('Sending message:', { postId, sellerId, buyerId, text }); // Debugging

    // Validate input
    if (!postId || !sellerId || !buyerId || !text) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    // Add buyerId to the post's buyerIds array if not already present
    const post = await postsModel.findById(postId);
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }

    if (!post.buyerIds.includes(buyerId)) {
      post.buyerIds.push(buyerId);
      await post.save();
    }

    let chat = await chatModel.findOne({ postId, buyerId });

    if (!chat) {
      chat = new chatModel({ postId, sellerId, buyerId, messages: [] });
    }

    chat.messages.push({ senderId: buyerId, text });
    chat.lastMessageAt = Date.now();
    await chat.save();

    res.status(201).json({ message: 'Message sent successfully' });
  } catch (error) {
    console.error('Error in /send:', error); // Debugging
    res.status(500).json({ message: 'Error sending message', error: error.message });
  }
});

// Fetch Chats for a Post
router.get('/chatsOfPost', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  console.log('Fetching chats for user:', userId); // Debugging

  try {
    const posts = await postsModel.find({ userId }).populate('buyerIds', 'username profilePic');
    console.log('Posts found:', posts.length); // Debugging

    const chats = await chatModel.find({ sellerId: userId }).populate('buyerId', 'username profilePic');
    console.log('Chats found:', chats.length); // Debugging

    const postsWithBuyers = posts.map(post => {
      const buyers = post.buyerIds.map(buyer => ({
        id: buyer._id,
        username: buyer.username,
        profilePic: buyer.profilePic ? buyer.profilePic.toString('base64') : null,
      }));
      // console.log('Post:', post._id, 'Buyers:', buyers); // Debugging
      return {
        ...post._doc,
        buyers,
      };
    });

    res.status(200).json({ posts: postsWithBuyers, chats });
  } catch (error) {
    console.error('Error in /chatsOfPost:', error); // Debugging
    res.status(500).json({ message: 'Error fetching chats', error: error.message });
  }
});

// message sending route for post posted user on chatHistoryPage
router.post('/sendMessage', authMiddleware, async (req, res) => {
  try {
    const { postId, sellerId, buyerId, text } = req.body;
    console.log('Sending message:', { postId, sellerId, buyerId, text }); // Debugging

    // Validate input
    if (!postId || !sellerId || !buyerId || !text) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    // Add buyerId to the post's buyerIds array if not already present
    // const post = await postsModel.findById(postId);
    // if (!post) {
    //   return res.status(404).json({ message: 'Post not found' });
    // }

    // if (!post.buyerIds.includes(buyerId)) {
    //   post.buyerIds.push(buyerId);
    //   await post.save();
    // }

    let chat = await chatModel.findOne({ postId, buyerId });

    if (!chat) {
      chat = new chatModel({ postId, sellerId, buyerId, messages: [] });
    }

    chat.messages.push({ senderId: sellerId, text });
    chat.lastMessageAt = Date.now();
    await chat.save();

    res.status(201).json({ message: 'Message sent successfully' });
  } catch (error) {
    console.error('Error in /send:', error); // Debugging
    res.status(500).json({ message: 'Error sending message', error: error.message });
  }
});

module.exports = router;