// models/groupTransactionModel.js
const mongoose = require('mongoose');

const groupTransactionSchema = new mongoose.Schema(
  {
    groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true },
    addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    amount: { type: Number, required: true },
    description: { type: String, required: true },
    paidBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    splitsTo: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  },
  { timestamps: true }
);

const GroupTransaction = mongoose.model('GroupTransaction', groupTransactionSchema);
module.exports = GroupTransaction;
