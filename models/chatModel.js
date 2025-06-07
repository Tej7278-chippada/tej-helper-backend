// models/chatModel.js
const mongoose = require('mongoose');

const MessageSchema = new mongoose.Schema({
  senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  text: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  seen: { type: Boolean, default: false },
  seenAt: { type: Date } // Track when message was seen
});

const ChatSchema = new mongoose.Schema({
  postId: { type: mongoose.Schema.Types.ObjectId, ref: 'Post', required: true },
  sellerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: false }, // Post owner
  buyerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: false },  // Interested user
  messages: [MessageSchema],  // Chat messages array
  lastMessageAt: { type: Date, default: Date.now }, // Track last message time
}, { timestamps: true });

// Update the pre-save hook to update seenAt when seen changes
MessageSchema.pre('save', function(next) {
  if (this.isModified('seen') && this.seen) {
    this.seenAt = new Date();
  }
  next();
});

module.exports = mongoose.model('Chat', ChatSchema);
