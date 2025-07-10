const express = require('express');
const router = express.Router();
const { default: mongoose } = require('mongoose');
// const authMiddleware = require("../middleware/authMiddleware");
const User = require("../models/userModel");
const adminAuth = require('../middleware/adminAuth');

// routes/adminRoutes.js
router.get('/searchUsers', adminAuth, async (req, res) => {
  try {
    const { query, page = 1, limit = 20 } = req.query;
    
    if (!query) {
      return res.status(400).json({ message: 'Search query is required' });
    }

    const filter = {
      $or: [
        { username: { $regex: query, $options: 'i' } },
        { email: { $regex: query, $options: 'i' } },
        { userCode: { $regex: query, $options: 'i' } },
        { _id: mongoose.Types.ObjectId.isValid(query) ? new mongoose.Types.ObjectId(query) : null }
      ].filter(condition => condition._id !== null || !query.match(/^[0-9a-fA-F]{24}$/))
    };

    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: { createdAt: -1 },
      select: '-password -otp -otpExpiry -otpAttempts -profilePic'
    };

    const result = await User.paginate(filter, options);

    res.status(200).json({
      users: result.docs,
      total: result.totalDocs,
      pages: result.totalPages,
      currentPage: result.page,
      hasNextPage: result.hasNextPage,
      hasPrevPage: result.hasPrevPage
    });
  } catch (err) {
    console.error('Error searching users:', err);
    res.status(500).json({ message: 'Error searching users', error: err.message });
  }
});

router.patch('/updateAccountStatus', adminAuth, async (req, res) => {
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

router.get('/filterUsers', adminAuth, async (req, res) => {
  try {
    const { status, page = 1, limit = 20, search } = req.query;
    
    let filter = {};
    if (status && status !== 'all') {
      filter.accountStatus = status;
    }

    // Add search functionality to the filter endpoint
    if (search) {
      filter.$or = [
        { username: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { userCode: { $regex: search, $options: 'i' } },
        { _id: mongoose.Types.ObjectId.isValid(search) ? new mongoose.Types.ObjectId(search) : null }
      ].filter(condition => condition._id !== null || !search.match(/^[0-9a-fA-F]{24}$/));
    }

    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: { createdAt: -1 },
      select: '-password -otp -otpExpiry -otpAttempts -profilePic'
    };

    const result = await User.paginate(filter, options);

    res.status(200).json({
      users: result.docs,
      total: result.totalDocs,
      pages: result.totalPages,
      currentPage: result.page,
      hasNextPage: result.hasNextPage,
      hasPrevPage: result.hasPrevPage
    });
  } catch (err) {
    console.error('Error filtering users:', err);
    res.status(500).json({ message: 'Error filtering users', error: err.message });
  }
});

// routes/adminRoutes.js (add this route before module.exports)
router.get('/userCounts', adminAuth, async (req, res) => {
  try {
    const counts = await Promise.all([
      User.countDocuments({}),
      User.countDocuments({ accountStatus: 'active' }),
      User.countDocuments({ accountStatus: 'inactive' }),
      User.countDocuments({ accountStatus: 'suspended' }),
      User.countDocuments({ accountStatus: 'deleted' })
    ]);

    res.status(200).json({
      all: counts[0],
      active: counts[1],
      inactive: counts[2],
      suspended: counts[3],
      deleted: counts[4]
    });
  } catch (err) {
    console.error('Error getting user counts:', err);
    res.status(500).json({ message: 'Error getting user counts', error: err.message });
  }
});

module.exports = router;