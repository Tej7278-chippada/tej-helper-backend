// routes/postsRoutes.js
const express = require('express');
const multer = require('multer');
const router = express.Router();
const sharp = require('sharp');
const authMiddleware = require('../middleware/authMiddleware');
const User = require('../models/userModel');
const postsModel = require('../models/postsModel');
const Notification = require('../models/notificationModel');

// Configure multer to store files in memory as buffers
// const storage = multer.memoryStorage();

// Helper function to calculate distance between two coordinates (Haversine formula)
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Radius of the Earth in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c; // Distance in km
}

// Add this function to send push notifications
const sendPushNotification = async (subscription, message, postId) => {
  const payload = JSON.stringify({
    title: 'New Post Nearby',
    body: message,
    icon: '/logo192.png',
    data: { url: `/post/${postId}` }
  });

  await fetch(process.env.WEB_PUSH_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.WEB_PUSH_AUTH_TOKEN}`
    },
    body: JSON.stringify({
      subscription,
      payload
    })
  });
};

// Initialize multer with the storage configuration
const upload = multer({
  limits: { fileSize: 2 * 1024 * 1024 }, // Limit file size to 5MB
  storage: multer.memoryStorage(),
});

// Add post (only by authenticated user)
router.post('/add', authMiddleware, upload.array('media', 5), async (req, res) => {
  try {
    const { title, categories, price, gender, peopleCount, serviceDays, serviceDate, timeFrom, timeTo, description, location } = req.body;

    const userId = req.user.id;
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const compressedImages = await Promise.all(
      req.files.map(async (file) => {
        const buffer = await sharp(file.buffer)
          .resize({ width: 800 })
          .jpeg({ quality: 20 })
          .toBuffer();
        return buffer;
      })
    );

    const post = new postsModel({
      userId,
      userCode: user.userCode,
      title,
      categories,
      price : categories === 'UnPaid' ? 0 : price,
      gender,
      peopleCount,
      // postStatus,
    //   stockCount: stockStatus === 'In Stock' ? stockCount : undefined,
      serviceDays,
      serviceDate, // New field
      timeFrom, // New field
      timeTo, // New field
      description,
      media: compressedImages,
      location: JSON.parse(location), // Parse the location string to object
      ip: req.ip,
      createdAt: new Date(),
    });

    await post.save();

    // Initialize empty array for users to notify
    let usersToNotify = [];

    // Find nearby users and send notifications
    const postLocation = post.location;

    if (postLocation && postLocation.latitude && postLocation.longitude) {
      const nearbyUsers = await User.find({
        'location.latitude': { $exists: true },
        'location.longitude': { $exists: true }
      });

      usersToNotify = nearbyUsers.filter(user => {
        if (!user.location.latitude || !user.location.longitude) return false;
        const distance = calculateDistance(
          postLocation.latitude,
          postLocation.longitude,
          user.location.latitude,
          user.location.longitude
        );
        return distance <= 300; // 10km radius
      });

      // Create notifications for nearby users
      await Promise.all(usersToNotify.map(async (user) => {
        if (user._id.toString() !== post.userId.toString()) { // Don't notify the post creator
          const notification = new Notification({
            userId: user._id,
            postId: post._id,
            message: `New post "${post.title}" near your location!`
          });
          await notification.save();
          
          // Only emit socket notification if user has notifications enabled
          if (user.notificationEnabled) {
            // Emit socket notification
            req.io.to(user._id.toString()).emit('newNotification', {
              postId: post._id,
              message: notification.message
            });
            // console.log("Notification emitted..");
          } else {
            // console.log("Notification stored but not emitted (user disabled)");
          }

          // Send push notification if enabled
          if (user.notificationEnabled && user.notificationToken) {
            try {
              const subscription = JSON.parse(user.notificationToken);
              await sendPushNotification(
                subscription,
                `New post "${post.title}" near your location tej!`,
                post._id  // Pass the post ID here
              );
              // console.log('Notification pushed..');
            } catch (error) {
              // console.error('Error sending push notification:', error);
            }
          }
        
        }
      }));
    }

    // After post is saved, send push notifications
    // await Promise.all(usersToNotify.map(async (user) => {
    //   if (user.notificationEnabled && user.notificationToken) {
    //     try {
    //       const subscription = JSON.parse(user.notificationToken);
    //       await sendPushNotification(
    //         subscription,
    //         `New post "${post.title}" near your location!`
    //       );
    //     } catch (error) {
    //       console.error('Error sending push notification:', error);
    //     }
    //   }
      
    //   // Still create in-app notification
    //   const notification = new Notification({
    //     userId: user._id,
    //     postId: post._id,
    //     message: `New post "${post.title}" near your location!`
    //   });
    //   await notification.save();
    // }));


    res.status(201).json({ message: 'Post added successfully.', post });
  } catch (err) {
    console.error('Error adding post:', err);
    res.status(500).json({ message: 'Error adding post', error: err.message });
  }
});

// Get posts by authenticated user
router.get('/my-posts', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const posts = await postsModel.find({ userId });
    if (!posts) {
      return res.status(404).json({ message: 'No posts found for this user.' });
    }
    // Convert each post's media buffer to base64
    const postsWithBase64Media = posts.map((post) => ({
      ...post._doc,
      media: post.media.map((buffer) => buffer.toString('base64')),
    }));
    
    res.status(200).json( postsWithBase64Media );
  } catch (err) {
    console.error('Error fetching user posts:', err);
    res.status(500).json({ message: 'Failed to fetch user posts' });
  }
});

// Get all products (public)
// router.get('/all', async (req, res) => {
//   try {
//     const products = await Product.find().populate('sellerId', 'sellerTitle');
//     res.json(products);
//   } catch (err) {
//     console.error('Error fetching products:', err);
//     res.status(500).json({ message: 'Failed to fetch products' });
//   }
// });





// Get all posts with optional filters
router.get('/', async (req, res) => {
  try {
    // Extract filter parameters from query string
    const { title, price, categories, gender, postStatus, skip = 0, limit = 12 } = req.query;

    // Build a filter object based on the available query parameters
    const filter = {};
    if (title) {
      filter.title = { $regex: title, $options: 'i' }; // Case-insensitive search for title
    }
    if (price) {
      const [minPrice, maxPrice] = price.split('-'); // Assuming the price range is passed as "minPrice-maxPrice"
      if (minPrice && maxPrice) {
        filter.price = { $gte: minPrice, $lte: maxPrice };
      }
    }
    if (categories) {
      filter.categories = categories; // Filter by categories
      // filter.categories = { $in: categories.split(',') }; // Assuming multiple categories are passed as comma-separated string
    }
    if (gender) {
      filter.gender = gender; // Filter by gender
    }
    if (postStatus) {
      filter.postStatus = postStatus; // Filter by post status
    }

    // Fetch posts with the applied filters
    const posts = await postsModel.find(filter)
      .skip(parseInt(skip))
      .limit(parseInt(limit))
      .sort({ createdAt: -1 }); // Newest first

    // Convert each post's media buffer to base64
    const postsWithBase64Media = posts.map((post) => ({
      ...post._doc,
      media: post.media.map((buffer) => buffer.toString('base64')),
    }));

    res.json(postsWithBase64Media);
  } catch (err) {
    console.error("Error fetching products:", err);
    res.status(500).json({ message: "Failed to fetch posts" });
  }
});

// Update product (only by the seller who added it)
router.put('/:id', authMiddleware, upload.array('media', 5), async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const post = await postsModel.findOne({ _id: id, userId });
    if (!post) {
      return res.status(403).json({ message: 'You are not authorized to update this post' });
    }

    const { title, price, categories, gender, postStatus, peopleCount, serviceDays, serviceDate, timeFrom, timeTo, description, existingMedia, location } = req.body;

    // Parse existingMedia to get the IDs of media to keep
    const mediaToKeep = existingMedia ? JSON.parse(existingMedia) : [];

    // Filter existing media to remove any that are not in mediaToKeep
    post.media = post.media.filter((_, index) => mediaToKeep.includes(index.toString()));

    // Add new media if provided
    if (req.files) {
      const compressedImages = await Promise.all(
        req.files.map(async (file) => {
          const buffer = await sharp(file.buffer)
            .resize({ width: 800 })
            .jpeg({ quality: 20 })
            .toBuffer();
          return buffer;
        })
      );
      post.media.push(...compressedImages);
    }

    // Update other post fields
    post.title = title;
    post.categories = categories;
    post.price = categories === 'UnPaid' ? 0 : price;
    post.gender = gender;
    post.postStatus = postStatus;
    // post.stockCount = stockStatus === 'In Stock' ? stockCount : undefined;
    post.peopleCount = peopleCount;
    post.serviceDays = serviceDays;
    post.serviceDate = serviceDate;
    post.timeFrom = timeFrom;
    post.timeTo = timeTo;
    post.description = description;
    post.ip = req.ip;
    post.updatedAt = new Date();

    // Update location data
    if (location) {
      post.location = JSON.parse(location);
    }

    await post.save();
    res.json(post);
  } catch (err) {
    console.error('Error updating post:', err);
    res.status(500).json({ message: 'Error updating post' });
  }
});

// Delete post (only by the user who posted it)
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const post = await postsModel.findOneAndDelete({ _id: id, userId });
    if (!post) {
      return res.status(403).json({ message: 'You are not authorized to delete this post' });
    }

    res.json({ message: 'Post deleted successfully' });
  } catch (err) {
    console.error('Error deleting post:', err);
    res.status(500).json({ message: 'Error deleting post' });
  }
});


// Like a product
// Toggle like on a product
// router.post('/:id/like', authMiddleware, async (req, res) => {
//   try {
//     const { id } = req.params;
//     const userId = req.user.id; // Get the logged-in user ID from the middleware

//     const post = await postsModel.findById(id);
//     if (!post) {
//       return res.status(404).json({ message: 'Post not found' });
//     }

//     const user = await User.findById(userId); // Get the user
//     if (!user) {
//       return res.status(404).json({ message: 'User not found' });
//     }

//     // Check if user already liked the posts
//     const likedIndex = user.likedPosts?.indexOf(id);

//     if (likedIndex !== -1) {
//       // If already liked, remove the like
//       user.likedPosts.splice(likedIndex, 1);
//       post.likes = Math.max(post.likes - 1, 0); // Prevent negative likes
//     } else {
//       // If not liked, add the like
//       user.likedPosts = user.likedPosts || [];
//       user.likedPosts.push(id);
//       post.likes += 1;
//     }

//     await user.save();
//     await post.save();

//     res.status(200).json({ message: 'Like toggled successfully', likes: post.likes });
//   } catch (error) {
//     console.error('Error toggling likes:', error);
//     res.status(500).json({ message: 'Error toggling likes' });
//   }
// });


// Add a comment
router.post('/:id/comment', authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { text } = req.body;
    const user = req.user; // Extracted user info from the auth token

    const post = await postsModel.findById(id); 
    // const product = await Product.findByIdAndUpdate(
    //   id,
    //   { $push: { comments: { text, createdAt: new Date() } } },
    //   { new: true }
    // );
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }

    const newComment = { text, createdAt: new Date(),
      username: user.username, // Add username from token
     };
    post.comments.push(newComment);

    await post.save();
    res.status(200).json(post);
  } catch (error) {
    console.error('Error adding comment:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});

// router.get('/:id', async (req, res) => {
//   try {
//     const product = await Product.findById(req.params.id);
//     if (!product) {
//       return res.status(404).json({ message: 'Product not found' });
//     }
//     const productWithBase64Media = {
//       ...product._doc,
//       media: product.media.map((buffer) => buffer.toString('base64')),
//     };
//     res.json(productWithBase64Media);
//   } catch (err) {
//     console.error('Error fetching product by ID:', err);
//     res.status(500).json({ message: 'Error fetching product details' });
//   }
// });

// Get a single post by ID with user details
router.get('/:id', async (req, res) => {
  try {
    const post = await postsModel.findById(req.params.id).populate('userId', 'username profilePic');
    
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }

    const postWithBase64Media = {
      ...post._doc,
      media: post.media.map((buffer) => buffer.toString('base64')),
      user: {
        id: post.userId._id,
        username: post.userId.username,
        profilePic: post.userId.profilePic ? post.userId.profilePic.toString('base64') : null,
      },
    };

    // if (req.user) {
    //   // If the user is authenticated, include likedByUser info
    //   const userId = req.user.id;
    //   const user = await User.findById(userId);
    //   const isLiked = user.likedPosts?.includes(post._id.toString());
    //   postWithBase64Media.likedByUser = isLiked;
    // }

    res.json(postWithBase64Media);
  } catch (err) {
    console.error('Error fetching post by ID:', err);
    res.status(500).json({ message: 'Error fetching post details' });
  }
});


module.exports = router;
