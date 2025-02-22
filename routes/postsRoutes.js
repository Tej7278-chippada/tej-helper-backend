// routes/postsRoutes.js
const express = require('express');
const multer = require('multer');
const router = express.Router();
const sharp = require('sharp');
const authMiddleware = require('../middleware/authMiddleware');
const User = require('../models/userModel');
const postsModel = require('../models/postsModel');

// Configure multer to store files in memory as buffers
// const storage = multer.memoryStorage();

// Initialize multer with the storage configuration
const upload = multer({
  limits: { fileSize: 2 * 1024 * 1024 }, // Limit file size to 5MB
  storage: multer.memoryStorage(),
});

// Add post (only by authenticated user)
router.post('/add', authMiddleware, upload.array('media', 5), async (req, res) => {
  try {
    const { title, price, categories, gender, peopleCount, postStatus, serviceDays, description } = req.body;

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
      price,
      categories,
      gender,
      peopleCount,
      postStatus,
    //   stockCount: stockStatus === 'In Stock' ? stockCount : undefined,
      serviceDays,
      description,
      media: compressedImages,
    });

    await post.save();
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





// Get all products with optional filters
router.get('/', async (req, res) => {
  try {
    // Extract filter parameters from query string
    const { title, price, categories, gender, postStatus } = req.query;

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
      filter.categories = { $in: categories.split(',') }; // Assuming multiple categories are passed as comma-separated string
    }
    if (gender) {
      filter.gender = gender; // Filter by gender
    }
    if (postStatus) {
      filter.postStatus = postStatus; // Filter by post status
    }

    // Fetch products with the applied filters
    const posts = await postsModel.find(filter);

    // Convert each product's media buffer to base64
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

    const { title, price, categories, gender, postStatus, peopleCount, serviceDays, description, existingMedia } = req.body;

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
    post.price = price;
    post.categories = categories;
    post.gender = gender;
    post.postStatus = postStatus;
    // post.stockCount = stockStatus === 'In Stock' ? stockCount : undefined;
    post.peopleCount = peopleCount;
    post.serviceDays = serviceDays;
    post.description = description;

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

//     const product = await Product.findById(id);
//     if (!product) {
//       return res.status(404).json({ message: 'Product not found' });
//     }

//     const user = await User.findById(userId); // Get the user
//     if (!user) {
//       return res.status(404).json({ message: 'User not found' });
//     }

//     // Check if user already liked the product
//     const likedIndex = user.likedProducts?.indexOf(id);

//     if (likedIndex !== -1) {
//       // If already liked, remove the like
//       user.likedProducts.splice(likedIndex, 1);
//       product.likes = Math.max(product.likes - 1, 0); // Prevent negative likes
//     } else {
//       // If not liked, add the like
//       user.likedProducts = user.likedProducts || [];
//       user.likedProducts.push(id);
//       product.likes += 1;
//     }

//     await user.save();
//     await product.save();

//     res.status(200).json({ message: 'Like toggled successfully', likes: product.likes });
//   } catch (error) {
//     console.error('Error toggling likes:', error);
//     res.status(500).json({ message: 'Error toggling likes' });
//   }
// });


// Add a comment
// router.post('/:id/comment', authMiddleware, async (req, res) => {
//   try {
//     const { id } = req.params;
//     const { text } = req.body;
//     const user = req.user; // Extracted user info from the auth token

//     const product = await Product.findById(id); 
//     // const product = await Product.findByIdAndUpdate(
//     //   id,
//     //   { $push: { comments: { text, createdAt: new Date() } } },
//     //   { new: true }
//     // );
//     if (!product) {
//       return res.status(404).json({ message: 'Product not found' });
//     }

//     const newComment = { text, createdAt: new Date(),
//       username: user.tokenUsername, // Add username from token
//      };
//     product.comments.push(newComment);

//     await product.save();
//     res.status(200).json(product);
//   } catch (error) {
//     console.error('Error adding comment:', error);
//     res.status(500).json({ message: 'Internal server error' });
//   }
// });

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

// Get a single post by ID
router.get('/:id', async (req, res) => {
  try {
    const post = await postsModel.findById(req.params.id);
    if (!post) {
      return res.status(404).json({ message: 'Post not found' });
    }

    const postWithBase64Media = {
      ...post._doc,
      media: post.media.map((buffer) => buffer.toString('base64')),
    };

    if (req.user) {
      // If the user is authenticated, include likedByUser info
      const userId = req.user.id;
      const user = await User.findById(userId);
      const isLiked = user.likedPosts?.includes(post._id.toString());
      postWithBase64Media.likedByUser = isLiked;
    }

    res.json(postWithBase64Media);
  } catch (err) {
    console.error('Error fetching post by ID:', err);
    res.status(500).json({ message: 'Error fetching post details' });
  }
});


module.exports = router;
