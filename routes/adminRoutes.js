const express = require('express');
const router = express.Router();
const { default: mongoose } = require('mongoose');
const authMiddleware = require("../middleware/authMiddleware");
const User = require("../models/userModel");

// routes/adminRoutes.js
router.get('/searchUsers', authMiddleware, async (req, res) => {
  try {
    const { query } = req.query;
    
    if (!query) {
      return res.status(400).json({ message: 'Search query is required' });
    }

    // Search by username, email, userCode, or ID
    const users = await User.find({
      $or: [
        { username: { $regex: query, $options: 'i' } },
        { email: { $regex: query, $options: 'i' } },
        { userCode: { $regex: query, $options: 'i' } },
        { _id: mongoose.Types.ObjectId.isValid(query) ? new mongoose.Types.ObjectId(query) : null }
      ].filter(condition => condition._id !== null || !query.match(/^[0-9a-fA-F]{24}$/))
    }).select('-password -otp -otpExpiry -otpAttempts -profilePic');

    res.status(200).json(users);
  } catch (err) {
    console.error('Error searching users:', err);
    res.status(500).json({ message: 'Error searching users', error: err.message });
  }
});

router.patch('/updateAccountStatus', authMiddleware, async (req, res) => {
  try {
    const { userId, status } = req.body;
    
    if (!userId || !status) {
      return res.status(400).json({ message: 'User ID and status are required' });
    }

    if (!['active', 'inactive', 'suspended', 'deleted'].includes(status)) {
      return res.status(400).json({ message: 'Invalid account status' });
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { accountStatus: status },
      { new: true }
    ).select('-password -otp -otpExpiry -otpAttempts -profilePic');

    if (!updatedUser) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.status(200).json({ message: 'Account status updated', user: updatedUser });
  } catch (err) {
    console.error('Error updating account status:', err);
    res.status(500).json({ message: 'Error updating account status', error: err.message });
  }
});

module.exports = router;