// models/userModel.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

// Function to generate unique seller ID
const generateUserCode = () => {
  const letters = crypto.randomBytes(3).toString('hex').toUpperCase().slice(0, 3); // First 3 characters as random uppercase letters
  const numbers = crypto.randomBytes(3).toString('hex').slice(0, 5); // Remaining 5 characters as numbers
  return letters + numbers;
};

// Define user schema
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  profilePic: { type: Buffer }, // Stores image data as Buffer
  email: { type: String, required: true, unique: true },
  phone: { type: String, required: true },
  trustLevel: { type: Number, default: 0 }, // NEW: Trust Level (average rating)
  ratings: [
    {
      userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      rating: { type: Number, min: 1, max: 5 }, // Rating between 1-5
      comment: { type: String },
      createdAt: { type: Date, default: Date.now }
    },
  ],
  groups: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Group' }], // Array of group IDs
  otp: { type: Number },
  otpExpiry: { type: Date },
  userCode: { type: String, required: true, unique: true, default: generateUserCode },
  address: {
    street: { type: String, required: true },
    area: { type: String, required: true },
    city: { type: String, required: true },
    state: { type: String, required: true },
    pincode: { type: String, required: true },
  },
  ip: { type: String, required: true },
  location: {
    city: String,
    region: String,
    country_name: String,
    latitude: { type: Number },
    longitude: { type: Number },
  },
  likedPosts: { type: [mongoose.Schema.Types.ObjectId], ref: 'Post', default: [] },
  wishlist: [{
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Post', 
    addedAt: { type: Date, default: Date.now }
  }],
  notificationToken: { type: String }, // For browser push notifications
  notificationEnabled: { type: Boolean, default: false },
  notificationRadius: { type: Number, default: 200 }, // Default 10km radius
});

// Hash the password before saving the user
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next(); // Only hash if the password is new or modified
  try {
    if (this.isNew) {
      this.password = await bcrypt.hash(this.password, 12); // Hashing the password with 12 salt rounds
    }
    console.log('Hashed password:', this.password); // Log the hashed password for debugging
    next();
  } catch (err) {
    return next(err);
  }
});

// Method to compare input password with hashed password
userSchema.methods.comparePassword = async function (inputPassword) {
  try {
    const isMatch = await bcrypt.compare(inputPassword, this.password);
    console.log('Password match result:', isMatch); // Log the result of the comparison
    return isMatch;
  } catch (err) {
    throw new Error(err);
  }
};

const User = mongoose.model('User', userSchema);
module.exports = User;
