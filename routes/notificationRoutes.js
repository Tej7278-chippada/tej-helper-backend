const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/authMiddleware');
const Notification = require('../models/notificationModel');
const User = require('../models/userModel');

// Get all notifications for a user
router.get('/', authMiddleware, async (req, res) => {
  try {
    const notifications = await Notification.find({ userId: req.user.id })
      .sort({ createdAt: -1 })
      .populate('postId', 'title');
    res.json(notifications);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching notifications', error: error.message });
  }
});

// Mark notification as read
router.put('/:id/read', authMiddleware, async (req, res) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.id },
      { isRead: true },
      { new: true }
    );
    if (!notification) {
      return res.status(404).json({ message: 'Notification not found' });
    }
    res.json(notification);
  } catch (error) {
    res.status(500).json({ message: 'Error updating notification', error: error.message });
  }
});

// Add this new endpoint
router.post('/enable-push', authMiddleware, async (req, res) => {
  try {
    // Verify user exists
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Update notification settings
    const { token, enabled } = req.body;
    await User.findByIdAndUpdate(req.user.id, {
      notificationToken: token,
      notificationEnabled: enabled
    });

    res.json({ 
      success: true,
      message: 'Push notification settings updated' 
    });
  } catch (error) {
    console.error('Error updating notification settings:', error);
    res.status(500).json({ 
      success: false,
      message: 'Error updating settings',
      error: error.message 
    });
  }
});

// Add this new endpoint to get notification status
router.get('/notification-status', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('notificationEnabled');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json({ 
      notificationEnabled: user.notificationEnabled || false 
    });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching notification status', error: error.message });
  }
});

// Delete all notifications for a user
router.delete('/', authMiddleware, async (req, res) => {
  try {
    await Notification.deleteMany({ userId: req.user.id });
    res.json({ success: true, message: 'All notifications cleared' });
  } catch (error) {
    res.status(500).json({ message: 'Error clearing notifications', error: error.message });
  }
});

module.exports = router;