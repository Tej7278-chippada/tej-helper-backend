// models/postsModel.js
const mongoose = require('mongoose');

const PostSchema = new mongoose.Schema({
  title: { type: String, required: true },
  price: { type: Number, required: true },
  categories: {type: String, enum: ['Paid', 'UnPaid', 'Emergency'], required: true},
  gender: { type: String, enum: ['Male', 'Female', 'Kids'], required: true },
  peopleCount: { type: Number },
  postStatus: { type: String, enum: ['Active', 'InActive', 'Closed'], default: 'Active' },
//   stockCount: { type: Number },
  serviceDays: { type: Number, required: true },
  serviceDate: { type: Date }, // New field for service date
  timeFrom: { type: Date }, // New field for time from
  timeTo: { type: Date }, // New field for time to
  description: { type: String, required: true},
  media: [Buffer], // Store images as Buffer data
//   videos: [String],
  likes: { type: Number, default: 0 },
  comments: [{ text: String, username: String, createdAt: { type: Date, default: Date.now } }],
  userCode: { type: String, required: true }, // Bind to users's code
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // Bind to users's ID
  ip: { type: String },
  location: {
    street: String, city: String,
    area: String, state: String, accuracy: Number,
    nation: String, pincode: Number, 
    latitude: { type: Number },
    longitude: { type: Number },
    address: String, 
  },
  buyerIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], // Array of buyer IDs
  helperIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], // Array of helper IDs
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date },  // Manually handle updatedAt
},
// { timestamps: true }
);

module.exports = mongoose.model('Post', PostSchema);
