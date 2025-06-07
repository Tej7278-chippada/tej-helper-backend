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

// Get chat history for post interested users
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

// Send a message by the user who interests on the post
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

    // chat.messages.push({ senderId: buyerId, text });
    const newMessage = { senderId: buyerId, text, createdAt: new Date(), seen: false };
    chat.messages.push(newMessage);
    chat.lastMessageAt = Date.now();
    await chat.save();

    let newMessageData = { newMessage, lastMessageAt : chat.lastMessageAt  };

    // Emit the new message to the room
    const room = `post_${postId}_user_${buyerId}_user_${sellerId}`;
    req.io.to(room).emit('receiveMessage', {...newMessage, seen: false // Initially false
    }); // Use Socket.IO to broadcast the message

    req.io.emit('newMessageReceived', { // socket to emit new notifications of unread messages count showing
      chatId: chat._id, 
      senderId: buyerId,
      postId,
      buyerId,
      sellerId
    });

    res.status(201).json({ message: 'Message sent successfully', newMessage });
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
    // console.log('Posts found:', posts.length); // Debugging

    const chats = await chatModel.find({ sellerId: userId }).populate('buyerId', 'username profilePic');
    // console.log('Chats found:', chats.length); // Debugging

    const postsWithBuyers = await Promise.all(posts.map(async (post) => {
      const buyers = await Promise.all(post.buyerIds.map(async (buyer) => {
        // Find the chat between this seller and buyer for this post
        const chat = await chatModel.findOne({
          postId: post._id,
          sellerId: userId,
          buyerId: buyer._id
        });

        // Calculate unread messages (messages not seen by current user)
        const unreadCount = chat ? chat.messages.reduce((count, message) => {
          return count + (message.senderId.toString() !== userId.toString() && !message.seen ? 1 : 0);
        }, 0) : 0;

        return {
          id: buyer._id,
          username: buyer.username,
          profilePic: buyer.profilePic ? buyer.profilePic.toString('base64') : null,
          unreadMessagesCount: unreadCount,
          lastMessageAt: chat ? chat.lastMessageAt : null
        };
      }));

      // Sort buyers by last message time (newest first)
      buyers.sort((a, b) => new Date(b.lastMessageAt || 0) - new Date(a.lastMessageAt || 0));

      return {
        ...post._doc,
        buyers,
        media: post.media?.map(img => img.toString('base64')) || [],
      };
    }));

    res.status(200).json({ posts: postsWithBuyers, chats });
  } catch (error) {
    console.error('Error in /chatsOfPost:', error); // Debugging
    res.status(500).json({ message: 'Error fetching chats', error: error.message });
  }
});

// fetch chats of user
router.get('/chatsOfUser', authMiddleware, async (req, res) => {
  const userId = req.user.id;

  try {
    const chats = await chatModel.find({ buyerId: userId })
      // .populate('postId', 'title') // Populate post title
      .populate('postId') // Populate post title
      .populate('sellerId', 'username profilePic'); // Populate seller details

    const formattedChats = chats.map(chat => {
      // Calculate unread messages (messages not seen by current user)
      const unreadCount = chat.messages.reduce((count, message) => {
        return count + (message.senderId.toString() !== userId.toString() && !message.seen ? 1 : 0);
      }, 0);

      return {
        chatId: chat._id,
        // postId: chat.postId?._id,
        // post: chat.postId || [],
        posts : {
          postId : chat.postId?._id,
          postTitle : chat.postId?.title,
          postImage : chat.postId?.media?.[0] ? chat.postId?.media[0].toString('base64') : null,
        },
        seller: {
          id: chat.sellerId?._id,
          username: chat.sellerId?.username,
          profilePic: chat.sellerId?.profilePic?.toString('base64') || null,
        },
        unreadMessagesCount: unreadCount,
        lastMessageAt: chat.lastMessageAt
      };
    });

    // Sort chats by last message time (newest first)
    formattedChats.sort((a, b) => new Date(b.lastMessageAt) - new Date(a.lastMessageAt));

    res.status(200).json({ chats: formattedChats });
  } catch (error) {
    console.error('Error in /chatsOfUser:', error);
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

    // chat.messages.push({ senderId: sellerId, text });
    const newMessage = { senderId: sellerId, text, createdAt: new Date(), seen: false };
    chat.messages.push(newMessage);
    chat.lastMessageAt = Date.now();
    await chat.save();

    // Emit the new message to the room
    const room = `post_${postId}_user_${buyerId}_user_${sellerId}`;
    req.io.to(room).emit('receiveMessage', {...newMessage, seen: false // Initially false
      }); // Use Socket.IO to broadcast the message

    req.io.emit('newMessageReceived', {  // socket to emit new notifications of unread messages count showing
      chatId: chat._id, 
      senderId: sellerId,
      postId,
      buyerId,
      sellerId
    });

    res.status(201).json({ message: 'Message sent successfully', newMessage });
  } catch (error) {
    console.error('Error in /send:', error); // Debugging
    res.status(500).json({ message: 'Error sending message', error: error.message });
  }
});

router.post('/toggle-helper', authMiddleware, async (req, res) => {
  try {
    const { postId, buyerId } = req.body;
    const post = await postsModel.findById(postId);
    
    if (!post) return res.status(404).json({ message: 'Post not found' });

    const isHelper = post.helperIds.includes(buyerId);

    if (isHelper) {
      // Remove buyer from helpers
      post.helperIds = post.helperIds.filter(id => id.toString() !== buyerId);
    } else {
      if (post.helperIds.length >= post.peopleCount) {
        return res.status(400).json({ message: 'Helper limit reached' });
      }
      post.helperIds.push(buyerId);
    }

    // Update postStatus
    post.postStatus = post.helperIds.length === post.peopleCount ? 'Closed' : 'Active';
    await post.save();

    res.json({ message: isHelper ? 'Removed from helpers' : 'Added to helpers', helperIds: post.helperIds });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error });
  }
});

// Mark messages as seen
router.post('/markAsSeen', authMiddleware, async (req, res) => {
  try {
    const { postId, buyerId, sellerId, messageIds } = req.body;

     // Validate input
     if (!postId || !buyerId || !sellerId || !messageIds || !Array.isArray(messageIds)) {
      return res.status(400).json({ message: 'Missing required fields' });
    }
    
    // Find and update the chat
    const chat = await chatModel.findOne({ postId, buyerId, sellerId });
    if (!chat) {
      return res.status(404).json({ message: 'Chat not found' });
    }

    // Update all specified messages to seen=true
    const updatedMessages = chat.messages.map(msg => {
      if (messageIds.includes(msg._id.toString())) {
        return { ...msg.toObject(), seen: true };
      }
      return msg;
    });

    chat.messages = updatedMessages;
    await chat.save();

    // Emit the seen status update to the specific room
    const room = `post_${postId}_user_${buyerId}_user_${sellerId}`;
    req.io.to(room).emit('messageSeen', messageIds);

    req.io.emit('messagesSeen', { 
      chatId: chat._id,
      postId,
      buyerId,
      sellerId
    });

    res.status(200).json({ message: 'Messages marked as seen' });
  } catch (error) {
    res.status(500).json({ message: 'Error marking messages as seen', error: error.message });
  }
});

module.exports = router;