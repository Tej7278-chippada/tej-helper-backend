// routes/groupTransactionRoutes.js
const express = require('express');
const GroupTransaction = require('../models/groupTransactionModel');
const authMiddleware = require('../middleware/authMiddleware');

const router = express.Router();

// Add a new transaction
router.post('/:groupId', authMiddleware, async (req, res) => {
  const { groupId } = req.params;
  const { amount, description, paidBy, splitsTo, addedBy } = req.body;

  try {
    const transaction = new GroupTransaction({
      groupId,
      addedBy,
      amount,
      description,
      paidBy,
      splitsTo,
    });
    await transaction.save();

    res.status(201).json(transaction);
  } catch (error) {
    res.status(500).json({ message: 'Failed to add transaction', error });
  }
});

module.exports = router;
