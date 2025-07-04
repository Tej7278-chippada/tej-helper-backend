// models/userModel.js
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

// Enhanced user code generation with collision handling
const generateUserCode = async () => {
  let userCode;
  let isUnique = false;
  let attempts = 0;
  
  while (!isUnique && attempts < 10) {
    const timestamp = Date.now().toString(36).slice(-3).toUpperCase();
    const randomBytes = crypto.randomBytes(2).toString('hex').toUpperCase().slice(0, 3);
    const randomNum = Math.floor(Math.random() * 99).toString().padStart(2, '0');
    // return `${timestamp}${randomBytes}${randomNum}`;
    // const letters = crypto.randomBytes(3).toString('hex').toUpperCase().slice(0, 3); // First 3 characters as random uppercase letters
    // const numbers = crypto.randomBytes(3).toString('hex').slice(0, 5); // Remaining 5 characters as numbers
    userCode = timestamp + randomBytes + randomNum;
    // console.log(timestamp, randomBytes, randomNum);
    
    // Check if code already exists
    const existingUser = await mongoose.model('User').findOne({ userCode });
    if (!existingUser) {
      isUnique = true;
    }
    attempts++;
  }
  
  return userCode;
};

// Define user schema
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true, index: true, trim: true, minlength: 3, maxlength: 50 },
  password: { type: String, required: true, minlength: 6 },
  profilePic: { type: Buffer,
    // validate: {
    //   validator: function(v) {
    //     return !v || v.length <= 5 * 1024 * 1024; // 5MB limit
    //   },
    //   message: 'Profile picture too large'
    // } 
  }, // Stores image data as Buffer
  email: { type: String, required: true, unique: true, index: true, 
    // trim: true, lowercase: true, 
  },
  phone: { type: String, 
    // validate: {
    //   validator: function(v) {
    //     return !v || /^\d{10,15}$/.test(v);
    //   },
    //   message: 'Invalid phone number format'
    // }
  },

  // OAuth specific fields
  googleId: { 
    type: String, 
    sparse: true,
    index: true
  },
  isGoogleUser: { 
    type: Boolean, 
    // default: false 
  },
  emailVerified: { 
    type: Boolean, 
    default: false 
  },
  accountCreatedAt: { 
    type: Date, 
    // default: Date.now 
  },
  lastLoginAt: { 
    type: Date, 
    // default: Date.now 
  },
  loginMethod: { 
    type: String, 
    enum: ['email', 'google', 'username'], 
    // default: 'email' 
  },
  lastProfilePicUpdate: { 
    type: Date, 
    // default: Date.now 
  },

  // Security fields
  accountStatus: { 
    type: String, 
    enum: ['active', 'inactive', 'suspended', 'deleted'], 
    default: 'inactive' 
  },
  failedLoginAttempts: { 
    type: Number, 
    // default: 0 
  },
  lockoutTime: { 
    type: Date 
  },

  trustLevel: { type: Number, default: 0, min: 0, max: 5 }, // NEW: Trust Level (average rating)
  ratings: [
    {
      userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
      rating: { type: Number, min: 1, max: 5, required: true }, // Rating between 1-5
      comment: { type: String, maxlength: 500 },
      createdAt: { type: Date, default: Date.now }
    },
  ],

  // OTP fields with enhanced security
  otp: { 
    type: Number,
    // select: false // Don't include in queries by default
  },
  otpExpiry: { 
    type: Date,
    // select: false
  },
  otpAttempts: { 
    type: Number, 
    // default: 0,
    select: false
  },
  userCode: { type: String, unique: true, index: true }, // required: true, default: generateUserCode
  // address: {
  //   street: { type: String },
  //   area: { type: String },
  //   city: { type: String },
  //   state: { type: String },
  //   pincode: { type: String },
  // },

  // Location and IP tracking
  ip: { 
    type: String, 
    // required: true 
  },
  // ipHistory: [{
  //   ip: String,
  //   timestamp: { type: Date, default: Date.now },
  //   userAgent: String,
  //   location: {
  //     city: String,
  //     region: String,
  //     country_name: String,
  //     latitude: Number,
  //     longitude: Number
  //   }
  // }],
  location: {
    city: String,
    region: String,
    country_name: String,
    latitude: { type: Number, min: -90, max: 90 },
    longitude: { type: Number, min: -180, max: 180 },
    address: String,
    lastUpdated: { 
      type: Date, 
      default: Date.now 
    }
  },

  // User engagement fields
  likedPosts: { type: [mongoose.Schema.Types.ObjectId], ref: 'Post', default: [] },
  wishlist: [{
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'Post', 
    addedAt: { type: Date, default: Date.now }
  }],

  // Notification settings
  notificationToken: { type: String }, // For browser push notifications
  notificationEnabled: { type: Boolean, default: false },
  notificationRadius: { type: Number, default: 200, min: 1, max: 1000 }, // Default 10km radius
  // notificationPreferences: {
  //   email: { 
  //     type: Boolean, 
  //     default: true 
  //   },
  //   push: { 
  //     type: Boolean, 
  //     default: true 
  //   },
  //   sms: { 
  //     type: Boolean, 
  //     default: false 
  //   }
  // },
});

// Indexes for better performance
userSchema.index({ email: 1, accountStatus: 1 });
userSchema.index({ googleId: 1, accountStatus: 1 });
userSchema.index({ userCode: 1, accountStatus: 1 });
userSchema.index({ 'location.latitude': 1, 'location.longitude': 1 });
userSchema.index({ createdAt: 1 });

// Hash the password before saving the user
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next(); // Only hash if the password is new or modified
  try {
    if (this.isNew) {
      this.password = await bcrypt.hash(this.password, 12); // Hashing the password with 12 salt rounds
    }
    // console.log('Hashed password:', this.password); // Log the hashed password for debugging
    next();
  } catch (err) {
    return next(err);
  }
});

// Pre-save middleware for user code generation
userSchema.pre('save', async function(next) {
  if (!this.userCode) {
    this.userCode = await generateUserCode();
  }
  next();
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
