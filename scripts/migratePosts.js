require('dotenv').config();
const mongoose = require('mongoose');
const postsModel = require('../models/postsModel');
// const Post = require('./models/postsModel'); // Adjust path as needed

// Connect to MongoDB
mongoose.connect((process.env.MONGO_URI), {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('MongoDB Connected'))
.catch(err => console.error('MongoDB Connection Error:', err));

// Migration function
const migratePosts = async () => {
  try {
    const posts = await postsModel.find({});
    let updatedCount = 0;
    
    for (const post of posts) {
      if (post.location?.latitude && post.location?.longitude && !post.location.coordinates) {
        post.location.coordinates = [post.location.longitude, post.location.latitude];
        post.location.type = 'Point';
        await post.save();
        updatedCount++;
        console.log(`Updated post ${post._id}`);
      }
    }
    
    console.log(`Migration complete. Updated ${updatedCount} posts.`);
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
};

migratePosts();