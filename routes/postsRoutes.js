// routes/postsRoutes.js
const express = require('express');
const multer = require('multer');
const router = express.Router();
const sharp = require('sharp');
const authMiddleware = require('../middleware/authMiddleware');
const User = require('../models/userModel');
const postsModel = require('../models/postsModel');
const Notification = require('../models/notificationModel');
const axios = require("axios");
const webpush = require('../config/webpush');
const { default: mongoose } = require('mongoose');
const likesModel = require('../models/likesModel');
const notificationModel = require('../models/notificationModel');
const chatModel = require('../models/chatModel');

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
const sendPushNotification = async (subscription, message, postId, userName) => {
  try {
    const payload = {
      title: 'New Post Nearby',
      body: message,
      icon: '/logo192.png',
      data: { 
        url: `${process.env.FRONTEND_URL}/post/${postId}`,
        postId: postId.toString() 
      }
    };

    await webpush.sendNotification(
      subscription,
      JSON.stringify(payload) // Ensure proper JSON stringification
    );
    // console.log(`Notification pushed..👍 ${userName}`);
  } catch (error) {
    console.error(`Error sending push notification ${userName}:`, error);
    
    // Remove invalid subscriptions
    if (error.statusCode === 410) {
      await User.updateOne(
        { _id: subscription.userId },
        { $set: { notificationToken: null, notificationEnabled: false } }
      );
    }
  }
};

// Initialize multer with the storage configuration
const upload = multer({
  limits: { fileSize: 2 * 1024 * 1024 }, // Limit file size to 5MB
  storage: multer.memoryStorage(),
});

// Add post (only by authenticated user)
router.post('/add', authMiddleware, upload.array('media', 5), async (req, res) => {
  try {
    const { title, categories, price, gender, peopleCount, serviceDays, serviceDate, timeFrom, timeTo, description, isFullTime, location } = req.body;

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
      isFullTime,
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
            // Get updated unread count
            const unreadCount = await Notification.countDocuments({ 
              userId: user._id, 
              isRead: false 
            });

            // Emit update to the specific user
            req.io.to(`notifications_${user._id}`).emit('notificationCountUpdate', { userId : user._id, unreadCount});
            console.log(`Notification emitted..${user.username}`);
          } else {
            console.log(`Notification stored but not emitted (user disabled) ${user.username}`);
          }

          // Send push notification if enabled
          if (user.notificationEnabled && user.notificationToken) {
            try {
              const subscription = JSON.parse(user.notificationToken);
              await sendPushNotification(
                subscription,
                `New post "${post.title}" near your location!`,
                post._id,  // Pass the post ID here
                user.username
              );
              console.log(`Notification pushed..${user.username}`);
            } catch (error) {
              console.error(`Error sending push notification (${user.username}) :`, error);
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

// route to fetch images related to title text from unsplash
router.get("/generate-images", async (req, res) => {
  try {
    const { query } = req.query;

    if (!query) {
      return res.status(400).json({ error: "Query parameter is required" });
    }

    const response = await axios.get(
      `https://api.unsplash.com/search/photos`,
      {
        params: { query, per_page: 6 },
        headers: {
          Authorization: `Client-ID ${process.env.UNSPLASH_ACCESS_KEY}`,
        },
      }
    );

    res.json(response.data);
  } catch (error) {
    console.error("Error fetching Unsplash images:", error);
    res.status(500).json({ error: "Failed to fetch images" });
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
    // const postsWithBase64Media = posts.map((post) => ({
    //   ...post._doc,
    //   media: post.media.map((buffer) => buffer.toString('base64')),
    // }));

    // Convert only the first media image to base64
    const postsWithBase64Media = posts.map(post => {
      // Get raw media array
      const rawMedia = post.media || (post._doc && post._doc.media) || [];

      // Convert only the first image (if exists) to base64
      const firstImage = rawMedia[0] ? rawMedia[0].toString('base64') : null;

      return {
        ...(post._doc || post),
        media: firstImage ? [firstImage] : []  // Wrap in array for consistency
      };
    });
    
    res.status(200).json( postsWithBase64Media );
  } catch (err) {
    console.error('Error fetching user posts:', err);
    res.status(500).json({ message: 'Failed to fetch user posts' });
  }
});

// Get posts media only for updating post by authenticated user
router.get('/postMedia/:postId', authMiddleware, async (req, res) => {
  try {
    const { postId } = req.params;
    const post = await postsModel.findById(postId);
    
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }

    const postWithBase64Media = {
      media: post.media.map((buffer) => buffer.toString('base64')),
    };
    
    res.status(200).json( postWithBase64Media );
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
    const { title, price, categories, gender, postStatus, skip = 0, limit = 12, userLat, userLng, distance } = req.query;

    if (!distance) {
      return res.status(400).json({ error: "Distance range is required" });
    }
    // Build a filter object based on the available query parameters
    const filter = {};
    if (title) {
      filter.title = { $regex: title, $options: 'i' }; // Case-insensitive search for title
    }
    if (price) {
      const [minPrice, maxPrice] = price.split('-'); // Assuming the price range is passed as "minPrice-maxPrice"
      if (minPrice && maxPrice) {
        filter.price = { $gte: parseFloat(minPrice), $lte: parseFloat(maxPrice) };
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

    let posts;
    let totalCount;

    if (userLat && userLng && distance) {
      // GeoNear query with additional filters
      const aggregationPipeline = [
        {
          $geoNear: {
            near: {
              type: "Point",
              coordinates: [parseFloat(userLng), parseFloat(userLat)]
            },
            distanceField: "distance",
            maxDistance: parseFloat(distance) * 1000, // Convert km to meters
            spherical: true,
            query: filter
          }
        },
        { $sort: { createdAt: -1 } }
      ];

       // Get total count
       const countPipeline = [...aggregationPipeline, { $count: "total" }];
       const countResult = await postsModel.aggregate(countPipeline);
       totalCount = countResult[0]?.total || 0;
 
       // Get paginated results
       const dataPipeline = [
         ...aggregationPipeline,
         { $skip: parseInt(skip) },
         { $limit: parseInt(limit) }
       ];
       posts = await postsModel.aggregate(dataPipeline);
 
       console.log(`posts fetched in range ${distance} and count ${totalCount}`);
    } else {
     // Regular query without geo filtering
     posts = await postsModel.find(filter)
     .sort({ createdAt: -1 })
     .skip(parseInt(skip))
     .limit(parseInt(limit))
     .exec();

      totalCount = await postsModel.countDocuments(filter).exec();
    }

    // // Convert media to base64 - handle both aggregation and find results
    // const postsWithBase64Media = posts.map(post => {
    //   // For aggregation results, media might be in a different format
    //   const media = post.media[0] || (post._doc && post._doc.media) || [];
    //   return {
    //     ...post._doc || post,
    //     media: media.map(buffer => buffer.toString('base64'))
    //   };
    // });

    // Convert only the first media image to base64
    const postsWithBase64Media = posts.map(post => {
      // Get raw media array
      const rawMedia = post.media || (post._doc && post._doc.media) || [];

      // Convert only the first image (if exists) to base64
      const firstImage = rawMedia[0] ? rawMedia[0].toString('base64') : null;

      return {
        ...(post._doc || post),
        media: firstImage ? [firstImage] : []  // Wrap in array for consistency
      };
    });

    res.json({
      posts: postsWithBase64Media,
      totalCount: totalCount
    });
    console.log(`posts fetched in range ${distance} and initial fetch count ${posts.length}`)
  } catch (err) {
    console.error("Error fetching posts:", err);
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

    const { title, price, categories, gender, postStatus, peopleCount, serviceDays, serviceDate, timeFrom, timeTo, description, isFullTime, existingMedia, location } = req.body;

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
    post.isFullTime = categories === 'Paid' ? isFullTime : false;
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

// Delete post and all related data (only by the user who posted it)
router.delete('/:id', authMiddleware, async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  
  console.log(`[Post Deletion] Starting deletion process for post ID: ${id} by user ID: ${userId}`);

  try {
    // Verify post exists and belongs to user
    const post = await postsModel.findOne({ _id: id, userId });
    if (!post) {
      console.log(`[Post Deletion] Post not found or unauthorized access attempt`);
      return res.status(403).json({ message: 'You are not authorized to delete this post' });
    }

    // Start transaction to ensure atomic operations
    const session = await mongoose.startSession();
    session.startTransaction();
    
    try {
      console.log(`[Post Deletion] Deleting post ${id} and related data`);
      
      // 1. Delete the post
      await postsModel.deleteOne({ _id: id }).session(session);
      
      // 2. Delete all likes associated with this post
      const likesResult = await likesModel.deleteMany({ postId: id }).session(session);
      console.log(`[Post Deletion] Deleted ${likesResult.deletedCount} likes for post ${id}`);
      
      // 3. Delete all notifications related to this post
      const notificationsResult = await notificationModel.deleteMany({ postId: id }).session(session);
      console.log(`[Post Deletion] Deleted ${notificationsResult.deletedCount} notifications for post ${id}`);
      
      // 4. Delete all chat conversations related to this post
      const chatsResult = await chatModel.deleteMany({ postId: id }).session(session);
      console.log(`[Post Deletion] Deleted ${chatsResult.deletedCount} chat conversations for post ${id}`);
      
      // 5. Remove post from users' wishlists
      const wishlistResult = await User.updateMany(
        { wishlist: id },
        { $pull: { wishlist: id } },
        { session }
      );
      console.log(`[Post Deletion] Removed post from ${wishlistResult.modifiedCount} wishlists`);
      
      // 6. Remove post from users' likedPosts
      const likedPostsResult = await User.updateMany(
        { likedPosts: id },
        { $pull: { likedPosts: id } },
        { session }
      );
      console.log(`[Post Deletion] Removed post from ${likedPostsResult.modifiedCount} likedPosts lists`);
      
      // Commit the transaction
      await session.commitTransaction();
      console.log(`[Post Deletion] Successfully deleted post ${id} and all related data`);
      
      res.json({ 
        message: 'Post and all related data deleted successfully',
        details: {
          likesDeleted: likesResult.deletedCount,
          notificationsDeleted: notificationsResult.deletedCount,
          chatsDeleted: chatsResult.deletedCount,
          wishlistsUpdated: wishlistResult.modifiedCount,
          likedPostsUpdated: likedPostsResult.modifiedCount
        }
      });
    } catch (error) {
      // If any error occurs, abort the transaction
      await session.abortTransaction();
      console.error(`[Post Deletion] Error during transaction for post ${id}:`, error);
      throw error;
    } finally {
      session.endSession();
    }
  } catch (err) {
    console.error(`[Post Deletion] Error deleting post ${id}:`, err);
    res.status(500).json({ 
      message: 'Error deleting post and related data',
      error: err.message 
    });
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
    const post = await postsModel.findById(req.params.id).populate('userId', 'username profilePic trustLevel');
    
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
        trustLevel: post.userId.trustLevel, // Include trust level
        // ratings: post.userId.ratings,
        // ratedUsername: post.userId.ratings.userId,
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
