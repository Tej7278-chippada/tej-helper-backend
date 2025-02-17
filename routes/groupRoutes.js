// routes/groupRoutes.js
const express = require('express');
const { createGroup, joinGroup, fetchGroups, fetchGroupDetails, generateJoinCode, getUserGroups } = require('../controllers/groupController');
const authMiddleware = require('../middleware/authMiddleware');
const Group = require('../models/groupModel');
const User = require('../models/userModel');

const router = express.Router();
const multer = require('multer');
const sharp = require('sharp');

// Routes
// router.post('/create', authMiddleware, createGroup);
router.post('/join', authMiddleware, joinGroup);
router.get('/user-groups', authMiddleware, getUserGroups);
router.get('/', authMiddleware, fetchGroups);
// router.get('/:groupId', authMiddleware, fetchGroupDetails);
router.post('/:groupId/generate-code', authMiddleware, generateJoinCode);


// Initialize multer with memory storage
const upload = multer({
    limits: { fileSize: 2 * 1024 * 1024 }, // Limit file size to 2MB
    storage: multer.memoryStorage(),
  });

// Create a Group
router.post('/create', upload.single('groupPic'), authMiddleware,  async (req, res) => {
    const { groupName } = req.body;
    const userId = req.user.id; // From authMiddleware
  
    try {
        // Process the uploaded profile picture
    let groupPictureBuffer = null;
    if (req.file) {
        groupPictureBuffer = await sharp(req.file.buffer)
        .resize({ width: 200, height: 200 })
        .jpeg({ quality: 80 })
        .toBuffer();
    }
      const group = new Group({
        groupName,
        groupPic : groupPictureBuffer,
        createdBy: userId,
        members: [{ user: userId, role: 'Admin' }],
      });
  
      group.generateJoinCode(); // Generate initial join code
      await group.save();
  
      // Add group ID to user's groups array
      await User.findByIdAndUpdate(userId, { $push: { groups: group._id } });
  
      res.status(201).json({ message: 'Group created successfully', group });
    } catch (error) {
      res.status(500).json({ message: 'Error creating group', error });
    }
  });

// Fetch Group Details
router.get('/:groupId', authMiddleware, async (req, res) => {
  const { groupId } = req.params;

  // if (req.group.id !== groupId) return res.status(403).json({ message: 'Unauthorized access' });

  try {
    const group = await Group.findById(groupId)
    .populate('members.user', ) // Populate member user details
    .populate('transactions.transPerson',) // Populate transaction person details
    .populate('transactions.paidBy',) // Populate paidBy user details
    .populate('transactions.splitsTo', )
    .populate('logs.user',); // 'username' // 'username profilePic' // Populate splitsTo user details

    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }

    const userId = req.user.id;
    const isMember = group.members.some(
      (member) => member.user._id.toString() === userId
    );

    if (!isMember) {
      return res.status(403).json({ message: 'Unauthorized access' });
    }

    // Convert the group document to a plain object
    const groupData = group.toObject();

    // Convert groupPic to base64 if it exists
    if (group.groupPic) {
      groupData.groupPic = group.groupPic.toString('base64');
    }

    // Ensure paidAmounts and splitAmounts are included in the transactions
    groupData.transactions = groupData.transactions.map((transaction) => {
      // Convert Mongoose Map to plain object for paidAmounts and splitAmounts
      return {
        ...transaction,
        paidAmounts: transaction.paidAmounts ? Object.fromEntries(transaction.paidAmounts.entries()) : {},
        splitAmounts: transaction.splitAmounts ? Object.fromEntries(transaction.splitAmounts.entries()) : {},
      };
    });

    res.status(200).json(groupData);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching group details', error });
  }
});

// Delete Group by Admin
router.delete('/:groupId', authMiddleware, async (req, res) => {
  try {
    const group = await Group.findById(req.params.groupId);
    if (!group) return res.status(404).json({ message: 'Group not found' });

    if (group.createdBy.toString() !== req.user.id)
      return res.status(403).json({ message: 'Only the group admin can delete the group' });

    // Remove the groupId from all users' `groups` arrays
    await User.updateMany(
      { groups: req.params.groupId },
      { $pull: { groups: req.params.groupId } }
    );

    // Delete the group
    await Group.findByIdAndDelete(req.params.groupId);
    res.status(200).json({ message: 'Group deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete the group', error });
  }
});

// Remove Member from Group by Admin
router.post('/:groupId/remove-member', authMiddleware, async (req, res) => {
  const { memberId } = req.body;

  try {
    const group = await Group.findById(req.params.groupId).populate('members.user', 'username balance');
    if (!group) return res.status(404).json({ message: 'Group not found' });

    // Check if the requesting user is an Admin
    const requestingUser = group.members.find(
      (member) => member.user._id.toString() === req.user.id && member.role === 'Admin'
    );
    if (!requestingUser) return res.status(403).json({ message: 'Only Admins can remove members.' });

    // Find the member being removed
    const removedMember = group.members.find((member) => member.user._id.toString() === memberId);
    if (!removedMember) return res.status(404).json({ message: 'Member not found in the group.' });

    const removedUsername = removedMember.user.username;
    const removedBalance = removedMember.balance;

    // Remove the member
    group.members = group.members.filter((member) => member.user._id.toString() !== memberId);

    // Add user to pastMembers with their balance
    group.pastMembers.push({
      user: memberId,
      balance: removedBalance,
      leftAt: Date.now(),
    });

    // Log the member leaving
    group.logs.push({
      type: 'member_removed',
      user: memberId,
      username: removedUsername, // Store the removed member's username
      description: `${removedUsername} removed from the group by admin ${req.user.username}.`,
      balance: removedBalance, // Store the removed member's balance // Log the balance at the time of leaving
    });

    await group.save();

    // Update the user's groups array
    await User.findByIdAndUpdate(memberId, { $pull: { groups: req.params.groupId } });

    res.status(200).json({ message: 'Member removed successfully.' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to remove member.', error });
  }
});

// Check if user is a past member of the group
router.post('/check-past-member', authMiddleware, async (req, res) => {
  const { joinCode } = req.body;
  const userId = req.user.id;

  try {
    // Find the group by join code
    const group = await Group.findOne({ joinCode });

    if (!group) {
      return res.status(404).json({ message: 'Invalid join code' });
    }

    if (Date.now() > group.joinCodeExpiry) {
      return res.status(400).json({ message: 'Join code has expired' });
    }

    // Check if the user is already a member of the group
    const isCurrentMember = group.members.some((member) => member.user.toString() === userId);
    if (isCurrentMember) {
      return res.status(400).json({ message: 'You are already a member of this group' });
    }

    // Check if the user is a past member of the group
    const pastMember = group.pastMembers.find((member) => member.user.toString() === userId);

    if (pastMember) {
      // User is a past member, return their previous balance
      return res.status(200).json({
        isPastMember: true,
        balance: pastMember.balance,
        group: {
          _id: group._id,
          groupName: group.groupName,
        },
      });
    } else {
      // User is not a past member
      return res.status(200).json({
        isPastMember: false,
      });
    }
  } catch (error) {
    console.error('Error checking past membership:', error);
    res.status(500).json({ message: 'Error checking past membership', error });
  }
});


// Exit Group by member
router.post('/:groupId/exit', authMiddleware, async (req, res) => {
  const userId = req.user.id;
  try {
    const group = await Group.findById(req.params.groupId);
    if (!group) return res.status(404).json({ message: 'Group not found' });

    // Remove the user from the group's members array
    // group.members = group.members.filter((member) => member.user.toString() !== req.user.id);

    const memberIndex = group.members.findIndex((member) => member.user.toString() === userId);

    if (memberIndex === -1) {
      return res.status(400).json({ message: 'User is not a member of the group' });
    }

    const member = group.members[memberIndex];

    // Add user to pastMembers with their balance
    group.pastMembers.push({
      user: userId,
      balance: member.balance,
      leftAt: Date.now(),
    });
    
    // Log the member leaving
    group.logs.push({
      type: 'member_left',
      user: userId,
      username: req.user.username,
      description: `${req.user.username} left the group.`,
      balance: member.balance, // Log the balance at the time of leaving
    });

    group.members.splice(memberIndex, 1);

    await group.save();

    // Remove the groupId from the user's groups array
    await User.findByIdAndUpdate(req.user.id, { $pull: { groups: req.params.groupId } });

    res.status(200).json({ message: 'You have left the group' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to leave the group', error });
  }
});

// Route to Add Transactions on Group
router.post('/:groupId/transactions', authMiddleware, async (req, res) => {
  const { groupId } = req.params;
  const { amount, description, paidBy, splitsTo, transPerson, paidAmounts, splitAmounts, paidWay, splitsWay, updatedMembers } = req.body;

  try {
    const group = await Group.findById(groupId).populate('members.user');

    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }

    // Update member balances by adding to the previous balance
    updatedMembers.forEach((updatedMember) => {
      const member = group.members.find((m) => m.user._id.toString() === updatedMember.user._id.toString());
      if (member) {
        const previousBalance = member.balance || 0; // Get the previous balance
        const newBalance = previousBalance + (updatedMember.balance - previousBalance); // Add the difference
        member.balance = newBalance;
      }
    });

    const newTransaction = {
      amount,
      description,
      paidBy,
      splitsTo,
      transPerson,
      paidAmounts,
      splitAmounts,
      paidWay,
      splitsWay,
      createdAt: new Date(),
    };

    group.transactions = group.transactions || [];  
    group.transactions.push(newTransaction);

    await group.save();

    // Populate the transaction data before emitting
    const populatedTransaction = await Group.populate(group, {
      path: 'transactions.transPerson transactions.paidBy transactions.splitsTo',
      select: 'username profilePic', // Select only the required fields
    });

    let latestTransaction = populatedTransaction.transactions[populatedTransaction.transactions.length - 1];

    // Convert profilePic to base64 string
    if (latestTransaction.transPerson?.profilePic) {
      latestTransaction = {
        ...latestTransaction.toObject(),
        transPerson: {
          ...latestTransaction.transPerson.toObject(),
          profilePic: latestTransaction.transPerson.profilePic.toString('base64'),
        },
      };
    }

    // ✅ Make sure paidAmounts and splitAmounts are correctly structured in the emitted event
    latestTransaction = {
      ...latestTransaction,
      paidAmounts: paidAmounts || [],
      splitAmounts: splitAmounts || [],
    };
    
    // Convert profilePic to base64 for transPerson, paidBy, and splitsTo
    // if (latestTransaction.transPerson.profilePic) {
    //   latestTransaction.transPerson.profilePic = latestTransaction.transPerson.profilePic.toString('base64');
    // }

    // latestTransaction.paidBy = latestTransaction.paidBy.map(user => {
    //   if (user.profilePic) {
    //     user.profilePic = user.profilePic.toString('base64');
    //   }
    //   return user;
    // });

    // latestTransaction.splitsTo = latestTransaction.splitsTo.map(user => {
    //   if (user.profilePic) {
    //     user.profilePic = user.profilePic.toString('base64');
    //   }
    //   return user;
    // });

    // Emit a WebSocket event to notify clients about the new transaction
    const io = req.app.get('io'); // Access the io instance
    io.to(groupId).emit('newTransaction', latestTransaction);
    console.log(`Emitted newTransaction to group ${groupId}`); // Debugging


    res.status(201).json({ message: 'Transaction added successfully', newTransaction: latestTransaction });
  } catch (error) {
    res.status(500).json({ message: 'Error adding transaction', error });
  }
});

router.delete('/:groupId/transactions/:transactionId', authMiddleware, async (req, res) => {
  const { groupId, transactionId } = req.params;
  const deletedBy = req.user.username; // Get the username of the user who deleted the transaction

  try {
    const group = await Group.findById(groupId);

    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }

    const transaction = group.transactions.id(transactionId);

    if (!transaction) {
      return res.status(404).json({ message: 'Transaction not found' });
    }

    // Mark the transaction as deleted and store the username of the user who deleted it
    transaction.deleted = true;
    transaction.deletedBy = deletedBy;

    // Update member balances by subtracting the transaction amounts
    transaction.paidBy.forEach((memberId) => {
      const member = group.members.find((m) => m.user._id.toString() === memberId.toString());
      if (member) {
        member.balance -= transaction.paidAmounts.get(memberId.toString()) || 0;
      }
    });

    transaction.splitsTo.forEach((memberId) => {
      const member = group.members.find((m) => m.user._id.toString() === memberId.toString());
      if (member) {
        member.balance += transaction.splitAmounts.get(memberId.toString()) || 0;
      }
    });

    // Log the transaction deletion
    group.logs.push({
      type: 'transaction_deleted',
      user: req.user.id,
      username: deletedBy,
      transactionId: transactionId,
      description: `${deletedBy} deleted the transaction: ${transaction.description}.`,
    });

    // group.transactions.pull(transactionId);
    await group.save();

    // Emit a WebSocket event to notify clients about the deleted transaction
    const io = req.app.get('io');
    io.to(groupId).emit('transactionDeleted', { transactionId, deletedBy: req.user.username });

    res.status(200).json({ message: 'Transaction deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error deleting transaction', error });
  }
});

router.put('/:groupId/transactions/:transactionId', authMiddleware, async (req, res) => {
  const { groupId, transactionId } = req.params;
  const { amount, description, paidBy, splitsTo, paidAmounts, splitAmounts, paidWay, splitsWay, updatedMembers } = req.body;
  const updatedBy = req.user.username; // Get the username of the user who updated the transaction

  try {
    const group = await Group.findById(groupId);

    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }

    const transaction = group.transactions.id(transactionId);

    if (!transaction) {
      return res.status(404).json({ message: 'Transaction not found' });
    }

    // Step 1: Revert previous balances before applying new updates
    // Revert previous balances before applying new updates
    transaction.paidBy.forEach((memberId) => {
      const member = group.members.find((m) => m.user._id.toString() === memberId.toString());
      if (member) {
        member.balance -= transaction.paidAmounts.get(memberId.toString()) || 0; // Revert paid amount
      }
    });

    transaction.splitsTo.forEach((memberId) => {
      const member = group.members.find((m) => m.user._id.toString() === memberId.toString());
      if (member) {
        member.balance += transaction.splitAmounts.get(memberId.toString()) || 0; // Revert split amount
      }
    });

    // Step 2: Update transaction details
    // Update transaction details
    transaction.amount = amount;
    transaction.description = description;
    transaction.paidBy = paidBy;
    transaction.splitsTo = splitsTo;
    transaction.paidAmounts = paidAmounts;
    transaction.splitAmounts = splitAmounts;
    transaction.paidWay = paidWay;
    transaction.splitsWay = splitsWay;
    transaction.updatedBy.push({ username: updatedBy, updatedAt: new Date() }); // Track who updated the transaction
    transaction.updateCount += 1; // Increment update count

    // Update member balances
    // updatedMembers.forEach((updatedMember) => {
    //   const member = group.members.find((m) => m.user._id.toString() === updatedMember.user._id.toString());
    //   if (member) {
    //     member.balance = updatedMember.balance;
    //   }
    // });

    // Step 3: Update member balances based on the new transaction details
    // Apply new transaction balances
    Object.keys(paidAmounts).forEach((memberId) => {
      const member = group.members.find((m) => m.user._id.toString() === memberId);
      if (member) {
        member.balance += paidAmounts[memberId];
      }
    });

    Object.keys(splitAmounts).forEach((memberId) => {
      const member = group.members.find((m) => m.user._id.toString() === memberId);
      if (member) {
        member.balance -= splitAmounts[memberId];
      }
    });

    // Log the transaction update
    group.logs.push({
      type: 'transaction_updated',
      user: req.user.id,
      username: updatedBy,
      transactionId: transactionId,
      description: `${updatedBy} updated the transaction: ${transaction.description}.`,
    });

    // transaction.updatedBy.push({ username: updatedBy, updatedAt: new Date() });

    // Save the updated group
    await group.save();

    // Step 4: Populate the updated transaction before emitting
    // Populate the updated transaction before emitting
    const populatedTransaction = await Group.populate(group, {
      path: 'transactions.transPerson transactions.paidBy transactions.splitsTo',
      select: 'username profilePic', // Select only the required fields
    });

    let updatedTransaction = populatedTransaction.transactions.find((t) => t._id.toString() === transactionId);


    // Convert profilePic to base64 string
    if (updatedTransaction.transPerson?.profilePic) {
      updatedTransaction = {
        ...updatedTransaction.toObject(),
        transPerson: {
          ...updatedTransaction.transPerson.toObject(),
          profilePic: updatedTransaction.transPerson.profilePic.toString('base64'),
        },
      };
    }

    // ✅ Make sure paidAmounts and splitAmounts are correctly structured in the emitted event
    updatedTransaction = {
      ...updatedTransaction,
      paidAmounts: paidAmounts || [],
      splitAmounts: splitAmounts || [],
    };
    // Step 5: Emit a WebSocket event to notify clients about the updated transaction
    // Emit a WebSocket event to notify clients about the updated transaction
    const io = req.app.get('io');
    io.to(groupId).emit('transactionUpdated', updatedTransaction);

    res.status(200).json({ message: 'Transaction updated successfully', transaction: updatedTransaction });
  } catch (error) {
    res.status(500).json({ message: 'Error updating transaction', error });
  }
});


module.exports = router;
