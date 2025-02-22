// /models/Likes.js
const mongoose = require('mongoose');

const LikeSchema = new mongoose.Schema({
  postId: { type: mongoose.Schema.Types.ObjectId, ref: 'Post', required: true, unique: true},
  userIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], // Array of user IDs
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Like', LikeSchema);