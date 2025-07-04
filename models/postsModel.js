// models/postsModel.js
const mongoose = require('mongoose');

const PostSchema = new mongoose.Schema({
  title: { type: String, required: true },
  price: { type: Number, required: true },
  // Add post type to distinguish between help requests and service offerings
  postType: {
    type: String,
    enum: ['HelpRequest', 'ServiceOffering'],
    required: true,
    default: 'HelpRequest'
  },
  // For help requests
  categories: {type: String, enum: ['Paid', 'UnPaid', 'Emergency'], required: function() { return this.postType === 'HelpRequest'; } },
  // For service offerings
  serviceType: { type: String,
    enum: [
      'ParkingSpace', 
      'VehicleRental', 
      'FurnitureRental',
      'Laundry', 
      'Events',
      'Playgrounds',
      'Cleaning', 
      'Cooking', 
      'Tutoring', 
      'PetCare', 
      'Delivery', 
      'Maintenance', 
      'Other'
    ], required: function() { return this.postType === 'ServiceOffering'; }
  },
  // // Service availability (for service offerings)
  // availability: {
  //   days: [{
  //     type: String,
  //     enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
  //   }],
  //   timeSlots: [{
  //     from: Date,
  //     to: Date
  //   }],
  //   isAlwaysAvailable: { type: Boolean, default: false }
  // },
  gender: { type: String, enum: ['Male', 'Female', 'Kids', 'Everyone'], required: true },
  peopleCount: { type: Number },
  postStatus: { type: String, enum: ['Active', 'InActive', 'Closed'], default: 'Active' },
//   stockCount: { type: Number },
  serviceDays: { type: Number, required: true },
  serviceDate: { type: Date }, // New field for service date
  timeFrom: { type: Date }, // New field for time from
  timeTo: { type: Date }, // New field for time to
  description: { type: String, required: true},
  isFullTime: { type: Boolean, default: false },
  // // Service specific fields
  // serviceFeatures: [{
  //   type: String // e.g., "24/7 Available", "Home Pickup", "Express Service"
  // }],
  
  // // Capacity/Quantity for services
  // capacity: { type: Number }, // e.g., parking slots available, vehicles available
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
    type: {
      type: String,
      enum: ['Point'],
      required: true
    },
    coordinates: {
      type: [Number],
      required: true
    },
    isProtected: { type: Boolean, default: false },
  },
  // For help requests
  buyerIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], // Array of buyer IDs
  helperIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], // Array of helper IDs
  // // For service offerings
  // customerIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], // Customers who booked
  // bookings: [{
  //   customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  //   bookingDate: { type: Date, default: Date.now },
  //   serviceDate: Date,
  //   status: { type: String, enum: ['Pending', 'Confirmed', 'Completed', 'Cancelled'], default: 'Pending' },
  //   timeSlot: {
  //     from: Date,
  //     to: Date
  //   }
  // }],
  
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date },  // Manually handle updatedAt
},
// { timestamps: true }
);

// Create index (alternative to doing it in the shell)
PostSchema.index({ location: '2dsphere' });
PostSchema.index({ postType: 1, serviceType: 1 });
PostSchema.index({ categories: 1 });

module.exports = mongoose.model('Post', PostSchema);
