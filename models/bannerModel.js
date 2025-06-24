// models/bannerModel.js
const mongoose = require('mongoose');

const BannerSchema = new mongoose.Schema({
  title: { type: String, required: true },
  media: [Buffer], // Store images as Buffer data
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, 
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date }, 
},
);

module.exports = mongoose.model('Banner', BannerSchema);
