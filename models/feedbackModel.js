// models/feedbackModel.js
const mongoose = require('mongoose');

const FeedbackSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, 
  feedback: { type: String, required: true },
  media: [Buffer], // Store images as Buffer data
  createdAt: { type: Date },
  status: {
    type: String,
    enum: ['pending', 'reviewed', 'resolved'],
    default: 'pending'
  },
  adminNotes: {
    type: String,
  },
  updatedAt: {
    type: Date,
  }
},
);

FeedbackSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Feedback', FeedbackSchema);
