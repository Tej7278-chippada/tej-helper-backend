// routes/authRoutes.js
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const User = require('../models/userModel');
const router = express.Router();
const { searchUsernames, requestOtp, resetPassword } = require('../controllers/userController');
const nodemailer = require('nodemailer');
const twilio = require('twilio');
const multer = require('multer');
const sharp = require('sharp');
const authMiddleware = require('../middleware/authMiddleware');
const axios = require('axios');
const postsModel = require('../models/postsModel');
const likesModel = require('../models/likesModel');
const chatModel = require('../models/chatModel');
const notificationModel = require('../models/notificationModel');
const crypto = require('crypto');
const { OAuth2Client } = require('google-auth-library');
const rateLimit = require('express-rate-limit');

// Set up Nodemailer transporter
const transporter = nodemailer.createTransport({
  service: 'Gmail',
  auth: {
    user: process.env.EMAIL_USER, // your email
    pass: process.env.EMAIL_PASS  // your email password
  }
});

// Initialize Twilio client
const twilioClient = twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN);


// Initialize multer with memory storage
const upload = multer({
  limits: { fileSize: 2 * 1024 * 1024 }, // Limit file size to 2MB
  storage: multer.memoryStorage(),
});

// POST /api/auth/register
router.post('/register', upload.single('profilePic'), async (req, res) => {
  const { username, password, phone, email,  ip, location } = req.body; // address,

  // Username and password validation
  const usernameRegex = /^[A-Z][A-Za-z0-9@_-]{5,}$/;
  const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d)(?=.*@).{8,}$/;

  if (!usernameRegex.test(username)) {
    return res.status(400).json({ message: 'Invalid username format.' });
  }

  if (!passwordRegex.test(password)) {
    return res.status(400).json({ message: 'Invalid password format.' });
  }

  if (!email.includes('@') || !email.endsWith('.com')) {
    return res.status(400).json({ message: 'Invalid mail id.' });
  }

  if (phone.length < 10 || !/^\d+$/.test(phone)) {
    return res.status(400).json({ message: 'Invalid mobile number.' });
  }

  try {
    const existingUser = await User.findOne({ $or: [{ username }, { email }] });
    if (existingUser) {
      if (existingUser.username === username) {
        return res.status(400).json({ message: `Username ${username} already exists.` });
      }
      if (existingUser.email === email) {
        return res.status(400).json({ message: `The email ${email} is already registered with another account, use another email instead.` });
      }
    }

    // Process the uploaded profile picture
    let profilePicBuffer = null;
    if (req.file) {
      profilePicBuffer = await sharp(req.file.buffer)
        .resize({ width: 300, height: 300 })
        .jpeg({ quality: 80 })
        .toBuffer();
    }

    // Create and save the new user
    const newUser = new User({ username, password, phone, email, profilePic: profilePicBuffer,  ip, //address: JSON.parse(address),
      location: JSON.parse(location), accountCreatedAt: new Date() });
    await newUser.save();

    // Send email notification
    try {
      await transporter.sendMail({
        from: process.env.EMAIL_USER,
        to: email,
        subject: 'Welcome to Helper',
        text: `Your Helper account has username of ${username} created successfully, and binded with this mail id ${email}.`,
      });
    } catch (error) {
      console.error("Error sending mail to new account:", error.message);
    }

    // Send message notification while user account registered.
    try {

      // Send SMS confirmation via Fast2SMS
      const smsMessage = `👋 Hi ${username}, welcome to Helper! 🎉`;
          // Your account has been successfully created and linked with the email: ${email}.
          // Thanks for joining us! 🚀

      await axios.post('https://www.fast2sms.com/dev/bulkV2', {
        route: "q",
        sender_id: "FSTSMS",
        message: smsMessage,
        language: 'english',
        numbers: phone,
        flash: 0
      }, {
        headers: {
          'authorization': process.env.FAST2SMS_API_KEY,
          'Content-Type': 'application/json'
        }
      });
      console.log('message sent to Phone.');
     } catch (error) {
      if (error.response) {
        console.error("Fast2SMS Error:", error.response.data);
      } else {
        console.error("Unknown Axios Error:", error.message);
      }
     }

    console.log('Registered user:', newUser); // Log the newly saved user
    res.status(201).json({ message: `Your new account created with username: ${newUser.username} and ${newUser.email}` });
  } catch (error) {
    console.error('Error registering user:', error);
    res.status(500).json({ message: 'Error registering user', error });
  }
});

// Function to validate if the input is an email
// const isValidEmail = (input) => {
//   return /^[\w-]+(\.[\w-]+)*@[a-zA-Z\d-]+(\.[a-zA-Z\d-]+)*(\.[a-zA-Z]{2,})$/.test(input);
// };

// Login Route
router.post('/login', async (req, res) => {
  const { identifier, password, isEmail } = req.body; // Use "identifier" to accept either email or username

  try {
    // Use regex to determine if the identifier is an email
    const query = isEmail  ? { email: identifier } : { username: identifier };

    // Find user by either username or email
    const user = await User.findOne(query);
    if (!user) {
      return res.status(404).json({ message: `${isEmail  ? 'Email' : 'Username'} ${identifier} doesn't exist.` });
    }

    // Compare the provided password with the hashed password stored in the database
    const isPasswordMatch = await bcrypt.compare(password, user.password);
    if (!isPasswordMatch) {
      return res.status(401).json({ message: `Entered password doesn't match to ${isEmail  ? 'Email' : 'Username'} ${identifier} 's data.` });
    }

    // if user account suspended by admin then can't login
    if (user.accountStatus === 'suspended') {
      return res.status(403).json({ message: `This account ${identifier} has been suspended.` });
    }

    // Update last login
    user.lastLoginAt = new Date();
    user.loginMethod = isEmail ? 'email' : 'username';
    if (user.accountStatus === 'inactive') {
      user.accountStatus = 'active';
    }
    await user.save();

    // Generate a JWT token valid for a specified period
    const authToken = jwt.sign({ id: user._id, tokenUsername: user.username }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN || '1h',
    });
    // console.log('Login successful:', user); // Log successful login
    // console.log('Login successful:', authToken);
    

    // Respond with success message, token, and username
    return res.status(200).json({
      message: `You are logged in with ${isEmail  ? 'email' : 'username'}: ${identifier}`,
      authToken,
      tokenUsername: user.username,
      userId: user._id, // for returning user details
      tokenPic: user.profilePic ? user.profilePic.toString('base64') : null,
    });
  } catch (error) {
    console.error('Error logging in:', error);
    return res.status(500).json({ message: 'Login failed', error });
  }
});

// Enhanced rate limiting for OAuth endpoints
const oauthLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 15 minutes
  max: 10, // limit each IP to 10 requests per windowMs
  message: {
    error: 'Too many authentication attempts, please try again later.',
    retryAfter: 10 * 60 * 1000
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// google OAuth registration or login
router.post('/google', oauthLimiter, async (req, res) => {
  try {
    const { token, clientId, userAgent, timestamp } = req.body;
    
    // Enhanced validation
    if (!token) {
      return res.status(400).json({ 
        error: 'Missing authentication token',
        solution: 'Please ensure you are sending the Google credential token'
      });
    }

    // Validate client ID matches
    if (clientId !== process.env.GOOGLE_CLIENT_ID) {
      return res.status(403).json({ 
        error: 'Invalid client configuration',
        solution: 'Client ID mismatch'
      });
    }

    // Rate limiting check (implement with redis or memory cache)
    // const clientIP = req.ip || req.connection.remoteAddress;
    // const rateLimitKey = `google_auth_${clientIP}`;

    // Initialize OAuth2Client with additional security
    const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
    
    // Verify token with enhanced validation
    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: [process.env.GOOGLE_CLIENT_ID],
      maxExpiry: 3600, // 1 hour max token age
    });
    
    const payload = ticket.getPayload();

    // Enhanced payload validation
    if (!payload) {
      return res.status(401).json({ error: 'Invalid token payload' });
    }

    if (!payload.email_verified) {
      return res.status(403).json({ 
        error: 'Email not verified by Google',
        solution: 'Please verify your Google account email'
      });
    }

    // Additional security checks
    const tokenAge = Date.now() - (payload.iat * 1000);
    if (tokenAge > 300000) { // 5 minutes max age
      return res.status(401).json({ 
        error: 'Token too old',
        solution: 'Please sign in again'
      });
    }

    const { email, name, picture, sub: googleId } = payload;

    // Enhanced user validation
    if (!email || !name) {
      return res.status(400).json({ 
        error: 'Incomplete profile data from Google',
        solution: 'Please ensure your Google profile has email and name'
      });
    }

    // Find existing user or create new one
    let user = await User.findOne({ 
      $or: [
        { email },
        { googleId }
      ]
    });

    let isNewUser = false;

    if (!user) {
      // Generate secure random password
      const randomPassword = crypto.randomBytes(32).toString('hex');
      // const hashedPassword = await bcrypt.hash(randomPassword, 12);
      // console.log('hashed pasword',randomPassword);
      
      // Create unique username with collision handling
      let username = await generateUniqueUsername(name);

      // Get location data if available
      const locationData = await getLocationFromIP(req.ip);
      
      // Create new user
      user = new User({
        username,
        email,
        password: randomPassword,
        googleId,
        profilePic: picture ? await getImageBufferFromUrl(picture) : null,
        lastProfilePicUpdate: picture ? new Date() : undefined,
        ip: req.ip,
        location: locationData || {},
        isGoogleUser: true,
        emailVerified: true,
        accountCreatedAt: new Date(),
        accountStatus: 'active',
        lastLoginAt: new Date(),
        loginMethod: 'google'
      });
      
      await user.save();
      isNewUser = true;

      // Send welcome email for new users
      try {
        await sendWelcomeEmail(user.email, user.username);
      } catch (emailError) {
        console.error('Welcome email failed:', emailError);
      }

      // console.log('New Google user created:', user.username);
    } else {

      // if user account suspended by admin then can't login
      if (user.accountStatus === 'suspended') {
        return res.status(403).json({ message: `This account ${email} has been suspended.` });
      }
      
      // Update existing user
      user.lastLoginAt = new Date();
      user.loginMethod = 'google';

      if (user.accountStatus === 'inactive') {
        user.accountStatus = 'active';
      }

      if (googleId && !user.googleId) {
        user.googleId = googleId;
      }

      if (email && (user.emailVerified === false)) {
        user.emailVerified = true;
      }
      
      // Update profile picture if changed
      if (picture && (!user.profilePic)) { //  || user.lastProfilePicUpdate < Date.now() - 86400000
        try {
          user.profilePic = await getImageBufferFromUrl(picture);
          user.lastProfilePicUpdate = new Date();
        } catch (error) {
          console.error('Profile picture update failed:', error);
        }
      }
      
      await user.save();
      // console.log('Existing user logged in:', user.username);
    }

    // Generate JWT with enhanced payload
    const authToken = jwt.sign(
      { 
        id: user._id, 
        tokenUsername: user.username,
        // email: user.email,
        // loginMethod: 'google',
        // isGoogleUser: true,
        // iat: Math.floor(Date.now() / 1000)
      },
      process.env.JWT_SECRET,
      { 
        expiresIn: process.env.JWT_EXPIRES_IN || '24h',
        // issuer: 'Tej-Helper',
        // audience: 'tej-Helper-users'
      }
    );

    // Log successful authentication
    // console.log(`Google OAuth success for user: ${user.username}, IP: ${req.ip}`);

    // Return enhanced response
    res.status(200).json({
      message: isNewUser ? 'Account created successfully' : 'Login successful',
      authToken,
      tokenUsername: user.username,
      userId: user._id,
      tokenPic: user.profilePic?.toString('base64') || null,
      isNewUser,
      // emailVerified: true,
      // accountType: 'google'
    });

  } catch (error) {
    console.error('Google auth error:', error);
    
    // Enhanced error handling
    let errorMessage = 'Authentication failed';
    let statusCode = 500;
    
    if (error.message.includes('Token used too late')) {
      errorMessage = 'Session expired. Please try again.';
      statusCode = 401;
    } else if (error.message.includes('Invalid token signature')) {
      errorMessage = 'Invalid authentication token.';
      statusCode = 401;
    } else if (error.message.includes('Token used too early')) {
      errorMessage = 'Invalid token timing.';
      statusCode = 401;
    } else if (error.message.includes('Wrong recipient')) {
      errorMessage = 'Token not intended for this application.';
      statusCode = 403;
    } else if (error.code === 11000) {
      errorMessage = 'Account already exists with this email.';
      statusCode = 409;
    } else if (error.name === 'ValidationError') {
      errorMessage = 'Invalid user data.';
      statusCode = 400;
    }
    
    res.status(statusCode).json({ 
      error: errorMessage,
      // details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Helper function to generate unique username
async function generateUniqueUsername(name) {
  // Create username from name with better collision handling
    const cleanName = name.replace(/[^a-zA-Z0-9]/g, '');
    let username = cleanName.toLowerCase() + 
                      Math.floor(1000 + Math.random() * 9000);
    // const username = cleanName.toLowerCase() + 
    //                   Math.floor(1000 + Math.random() * 9000);
    
    // Ensure username meets requirements and is unique
    if (username.length < 3) {
      username = 'user' + username;
    }
    
    // Check for existing username and add suffix if needed
    let finalUsername = username;
    let counter = 1;
    
    while (await User.findOne({ username: finalUsername })) {
      finalUsername = `${username}${counter}`;
      counter++;
      
      // Prevent infinite loop
      if (counter > 1000) {
        finalUsername = username + Date.now().toString().slice(-6);
        break;
      }
    }

    // Capitalize first letter to meet username requirements
    finalUsername = finalUsername.charAt(0).toUpperCase() + finalUsername.slice(1);
  
  // Fallback to completely random username
  return finalUsername;
}

// Helper function to get location from IP
async function getLocationFromIP(ip) {
  try {
    // Use a geolocation service (implement with your preferred provider)
    // This is a placeholder - replace with actual implementation
    const response = await axios.get(`https://ipapi.co/${ip}/json/`, {
      timeout: 5000
    });
    
    return {
      city: response.data.city,
      region: response.data.region,
      country_name: response.data.country_name,
      latitude: response.data.latitude,
      longitude: response.data.longitude
    };
  } catch (error) {
    console.error('Location lookup failed:', error);
    return {};
  }
}

// Enhanced image processing function
async function getImageBufferFromUrl(url) {
  try {
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 10000,
      maxRedirects: 3,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; YourApp/1.0)'
      }
    });
    
    // Validate image size
    if (response.data.length > 5 * 1024 * 1024) { // 5MB limit
      throw new Error('Image too large');
    }
    
    return await sharp(response.data)
      .resize(300, 300, {
        fit: 'cover',
        position: 'center',
        withoutEnlargement: true
      })
      .jpeg({ 
        quality: 85,
        mozjpeg: true,
        progressive: true
      })
      .toBuffer();
  } catch (error) {
    console.error('Error processing profile image:', error);
    return null;
  }
}

// Helper function to send welcome email
async function sendWelcomeEmail(email, username) {
  try {
    const emailTemplate = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Welcome to Helper! 🎉</h2>
        <p>Hi ${username},</p>
        <p>Your Helper account has been created successfully using Google Sign-In.</p>
        <p><strong>Account Details:</strong></p>
        <ul>
          <li>Username: ${username}</li>
          <li>Email: ${email}</li>
        </ul>
        // <p>You can now access all features of Helper with your Google account.</p>
        <p>You can now start using Helper to connect with your community!</p>
        <p>Best regards,<br>The Helper Team</p>
      </div>
    `;

    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: email,
      subject: 'Welcome to Helper - Account Created!',
      html: emailTemplate,
    });
  } catch (error) {
    console.error('Error sending welcome email:', error);
    throw error;
  }
}

// Refresh Token Route
router.post('/refresh-token', (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(403).json({ message: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'defaultSecretKey');
    // Issue a new token with a refreshed expiry time
    const newToken = jwt.sign(
      { id: decoded.id, tokenUsername: decoded.tokenUsername },
      process.env.JWT_SECRET || 'defaultSecretKey',
      { expiresIn: process.env.JWT_EXPIRES_IN || '1h' }// New 1-hour expiry
    );

    return res.status(200).json({ authToken: newToken });
    // console.log('authToken refreshed..!:', newToken);
  } catch (err) {
    return res.status(401).json({ message: 'Refresh token failed. Token expired or invalid.' });
    // console.log('Refresh token failed. Token expired or invalid.');
  }
});

router.get('/search', searchUsernames); // Define search route

// Route to request OTP
router.post('/request-otp', async (req, res) => {
  const { username, contact } = req.body;
  const otp = Math.floor(100000 + Math.random() * 900000); // Generate 6-digit OTP

  try {
    // Check if the user exists with the provided username
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(404).json({ message: "Username doesn't match to any existed username" });
    }

    // Check if the contact matches user's email or phone
    const isContactMatched = user.email === contact || user.phone === contact;
    if (!isContactMatched) {
      return res.status(400).json({ message: `Entered email or phone number doesn't match the ${username} data` });
    }
    // Set OTP expiration in IST time by adding 10 minutes
    const otpExpiryIST = new Date(new Date().getTime() + 10 * 60000 + 5.5 * 60 * 60000); // Convert 10 mins to IST
    // Save OTP to user document with expiration
    user.otp = otp;
    user.otpExpiry = otpExpiryIST; // OTP valid for 10 minutes in IST
    await user.save();

    // Send OTP via email or SMS
    if (contact.includes('@')) {
      await transporter.sendMail({
        to: contact,
        subject: 'Password Reset OTP',
        text: `Your Helper App account password reset OTP is ${otp}. It is valid for 10 minutes.`
      });
    } else {
      // await twilioClient.messages.create({
      //   to: contact,
      //   from: process.env.TWILIO_PHONE_NUMBER,
      //   body: `Your TejChat App account password reset OTP is ${otp}. It is valid for 10 minutes.`
      // });
      try {
        const smsMessage = `🔐 Your Helper password reset OTP is ${otp}.`; 
        //  Valid for 10 minutes. Don't share it with anyone.
        await axios.post('https://www.fast2sms.com/dev/bulkV2', {
          route: 'q', // otp
          sender_id: 'FSTSMS',
          message: smsMessage,
          // variables_values: otp,
          // language: 'english',
          numbers: contact,
          flash: 0
        }, {
          headers: {
            'authorization': process.env.FAST2SMS_API_KEY,
            'Content-Type': 'application/json'
          }
        });
        console.log('message sent to Phone.');
     } catch (error) {
      if (error.response) {
        console.error("Fast2SMS Error:", error.response.data);
      } else {
        console.error("Unknown Axios Error:", error.message);
      }
     }
    }

    res.json({ message: 'OTP sent successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error requesting OTP', error });
  }
});

// Route to resend OTP
router.post('/resend-otp', async (req, res) => {
  const { username, contact } = req.body;
  const otp = Math.floor(100000 + Math.random() * 900000); // Generate new 6-digit OTP

  try {
    const user = await User.findOne({ username });
    if (!user || (user.email !== contact && user.phone !== contact)) {
      return res.status(400).json({ message: "User not found or contact does not match" });
    }

    // Update OTP and expiry time
    // Set OTP expiration in IST time by adding 10 minutes
    const otpExpiryIST = new Date(new Date().getTime() + 10 * 60000 + 5.5 * 60 * 60000); // Convert 10 mins to IST
    // Save OTP to user document with expiration
    user.otp = otp;
    user.otpExpiry = otpExpiryIST; // OTP valid for 10 minutes in IST
    await user.save();

    // Send OTP via email or SMS
    if (contact.includes('@')) {
      await transporter.sendMail({
        to: contact,
        subject: 'Password Reset OTP',
        text: `Your TejChat App new OTP is ${otp}. It is valid for 10 minutes.`,
      });
    } else {
      await twilioClient.messages.create({
        to: contact,
        from: process.env.TWILIO_PHONE_NUMBER,
        body: `Your TejChat App new OTP is ${otp}. It is valid for 10 minutes.`,
      });
    }

    res.json({ message: 'New OTP sent successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Error resending OTP', error });
  }
});


// Route to reset password
router.post('/reset-password', async (req, res) => {
  const { username, contact, otp, newPassword } = req.body;

  try {
    const user = await User.findOne({ username, $or: [{ email: contact }, { phone: contact }] });
    if (!user || user.otp !== parseInt(otp) || Date.now() > user.otpExpiry) {
      return res.status(400).json({ message: 'Entered OTP is invalid or OTP expired' });
    }
    // Check if new password is different from the existing password
    const isSamePassword = await bcrypt.compare(newPassword, user.password);
    if (isSamePassword) {
      return res.status(400).json({ message: 'New password must be different from the old password' });
    }

    // Hash new password and update user document
    user.password = await bcrypt.hash(newPassword, 12);
    user.otp = null; // Clear OTP after successful reset
    user.otpExpiry = null;
    await user.save();
    console.log('New password is :', user.password);

    res.json({ message: 'Password reset successful' });
  } catch (error) {
    res.status(500).json({ message: 'Error resetting password', error });
  }
});

// Route to get user profile
router.get('/:userId', authMiddleware, async (req, res) => {
  const { userId } = req.params;

  if (req.user.id !== userId) return res.status(403).json({ message: 'Unauthorized access' });

  try {
    const user = await User.findById(userId).select('-password').populate({
      path: 'ratings.userId',
      select: 'username profilePic trustLevel',
    });
    if (!user) return res.status(404).json({ message: 'User not found' });
    // Convert profilePic to Base64 string if it exists
    const userData = user.toObject();
    if (user.profilePic) {
      userData.profilePic = user.profilePic.toString('base64');
    }
    if (user.ratings) {
      userData.totalReviews = user.ratings.length;
      userData.ratings = user.ratings.reverse(); // return latest first
    }

    res.json(userData);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Get all ratings for a user with rater details
// router.get('/ratings/:userId', async (req, res) => {
//   try {
//     const user = await User.findById(req.params.userId)
//       .populate('ratings.userId', 'username profilePic');
//     if (!user) return res.status(404).json({ message: 'User not found' });

//     const ratings = user.ratings.map(r => ({
//       userId: r.userId._id,
//       username: r.userId.username,
//       profilePic: r.userId.profilePic,
//       rating: r.rating,
//       comment: r.comment,
//       createdAt: r.createdAt
//     }));

//     res.json({ ratings });
//   } catch (error) {
//     console.error('Error fetching user ratings:', error);
//     res.status(500).json({ message: 'Server error' });
//   }
// });


// Add a rating to a user
router.post('/rate/:userId', authMiddleware, async (req, res) => {
  const { userId } = req.params;
  const { rating, comment } = req.body;
  const raterId = req.user.id; // ID of the logged-in user

  if (!rating || rating < 1 || rating > 5) {
    return res.status(400).json({ message: 'Invalid rating value' });
  }

  if (userId === raterId) {
    return res.status(400).json({ message: 'You cannot rate yourself' });
  }

  try {
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Check if the user has already rated
    const existingRating = user.ratings.find((r) => r.userId.toString() === raterId);
    if (existingRating) {
      existingRating.rating = rating;
      existingRating.comment = comment;
      existingRating.createdAt = Date.now();
    } else {
      user.ratings.push({ userId: raterId, rating, comment });
    }

    // Calculate new trust level
    const totalRatings = user.ratings.length;
    const avgRating = user.ratings.reduce((sum, r) => sum + r.rating, 0) / totalRatings;

    user.trustLevel = avgRating.toFixed(1);
    await user.save();

    res.json({ message: 'Rating submitted', trustLevel: user.trustLevel });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Get user's average rating
router.get('/rating/:userId', async (req, res) => {
  try {
    const user = await User.findById(req.params.userId).populate({
      path: 'ratings.userId',
      select: 'username profilePic trustLevel',
    });

    if (!user) return res.status(404).json({ message: 'User not found' });

    // const averageRating = user.ratings.length
    //   ? user.ratings.reduce((sum, r) => sum + r.rating, 0) / user.ratings.length
    //   : 0;

    res.json({
      averageRating : user.trustLevel,
      totalReviews: user.ratings.length,
      ratings: user.ratings.reverse(), // return latest first
    });
  } catch (error) {
    console.error('Error fetching user rating:', error);
    res.status(500).json({ message: 'Server error' });
  }
});

// Route to update user location
router.put('/:userId/location', authMiddleware, async (req, res) => {
  const { userId } = req.params;
  const { location } = req.body;

  if (req.user.id !== userId) return res.status(403).json({ message: 'Unauthorized access' });

  try {
    const user = await User.findByIdAndUpdate(userId, { location, ip: req.ip }, { new: true });
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

// Route to delete user account with comprehensive logging
router.delete('/:id', authMiddleware, async (req, res) => {
  const { id } = req.params;
  console.log(`[Account Deletion] Starting deletion process for user ID: ${id}`);

  if (req.user.id !== id) {
    console.log(`[Account Deletion] Unauthorized access attempt: User ${req.user.id} tried to delete account ${id}`);
    return res.status(403).json({ message: 'Unauthorized access' });
  }

  try {
    console.log(`[Account Deletion] Looking up user ${id} in database`);
    const user = await User.findById(req.user.id);
    if (!user) {
      console.log(`[Account Deletion] User ${id} not found in database`);
      return res.status(404).json({ message: 'User not found' });
    }
    
    // Delete all posts created by this user
    console.log(`[Account Deletion] Deleting posts created by user ${id}`);
    const postDeletionResult = await postsModel.deleteMany({ userId: req.user.id });
    console.log(`[Account Deletion] Deleted ${postDeletionResult.deletedCount} posts for user ${id}`);

    // Remove user's comments from all posts
    console.log(`[Account Deletion] Removing comments by user ${id} from all posts`);
    const commentsUpdateResult = await postsModel.updateMany(
      { 'comments.username': user.username },
      { $pull: { comments: { username: user.username } } }
    );
    console.log(`[Account Deletion] Updated ${commentsUpdateResult.modifiedCount} posts to remove user's comments`);
    
    // Remove user from Likes collection
    console.log(`[Account Deletion] Removing user ${id} from likes documents`);
    const likeUpdateResult = await likesModel.updateMany(
      { userIds: req.user.id },
      { $pull: { userIds: req.user.id } }
    );
    console.log(`[Account Deletion] Updated ${likeUpdateResult.modifiedCount} likes documents for user ${id}`);
    
    // Delete likes documents that become empty
    console.log(`[Account Deletion] Deleting empty likes documents`);
    const emptyLikesDeletion = await likesModel.deleteMany({ userIds: { $size: 0 } });
    console.log(`[Account Deletion] Deleted ${emptyLikesDeletion.deletedCount} empty likes documents`);
    
    // Handle chat data - delete chats where user is either seller or buyer
    console.log(`[Account Deletion] Deleting chat conversations for user ${id}`);
    const chatDeletionResult = await chatModel.deleteMany({
      $or: [
        { sellerId: req.user.id },
        { buyerId: req.user.id }
      ]
    });
    console.log(`[Account Deletion] Deleted ${chatDeletionResult.deletedCount} chat conversations for user ${id}`);
    
    // Delete notifications related to this user
    console.log(`[Account Deletion] Finding posts by user ${id} for notification cleanup`);
    const userPostIds = await postsModel.find({ userId: req.user.id }).distinct('_id');
    console.log(`[Account Deletion] Found ${userPostIds.length} posts for notification cleanup`);
    
    console.log(`[Account Deletion] Deleting notifications for user ${id}`);
    const notificationDeletionResult = await notificationModel.deleteMany({
      $or: [
        { userId: req.user.id },
        { postId: { $in: userPostIds } }
      ]
    });
    console.log(`[Account Deletion] Deleted ${notificationDeletionResult.deletedCount} notifications for user ${id}`);
    
    // Remove this user from buyerIds and helperIds in other posts
    console.log(`[Account Deletion] Removing user ${id} from buyerIds and helperIds in other posts`);
    const postUpdateResult = await postsModel.updateMany(
      {
        $or: [
          { buyerIds: req.user.id },
          { helperIds: req.user.id }
        ]
      },
      {
        $pull: {
          buyerIds: req.user.id,
          helperIds: req.user.id
        }
      }
    );
    console.log(`[Account Deletion] Updated ${postUpdateResult.modifiedCount} posts to remove user references`);
    
    // Remove this user from wishlists of other users
    console.log(`[Account Deletion] Removing user ${id} from other users' wishlists`);
    const wishlistUpdateResult = await User.updateMany(
      { wishlist: req.user.id },
      { $pull: { wishlist: req.user.id } }
    );
    console.log(`[Account Deletion] Updated ${wishlistUpdateResult.modifiedCount} users' wishlists`);
    
    // Remove this user from likedPosts of other users
    console.log(`[Account Deletion] Removing user ${id} from other users' likedPosts`);
    const likedPostsUpdateResult = await User.updateMany(
      { likedPosts: req.user.id },
      { $pull: { likedPosts: req.user.id } }
    );
    console.log(`[Account Deletion] Updated ${likedPostsUpdateResult.modifiedCount} users' likedPosts`);
    
    // Remove this user from ratings in other users' documents and recalculate trust levels
    console.log(`[Account Deletion] Finding users who rated user ${id}`);
    const usersToUpdate = await User.find({ 'ratings.userId': req.user.id });
    
    console.log(`[Account Deletion] Removing ratings by user ${id} from ${usersToUpdate.length} users`);
    for (const ratedUser of usersToUpdate) {
      // Remove the rating
      ratedUser.ratings = ratedUser.ratings.filter(r => r.userId.toString() !== req.user.id);
      
      // Recalculate trust level
      if (ratedUser.ratings.length > 0) {
        const avgRating = ratedUser.ratings.reduce((sum, r) => sum + r.rating, 0) / ratedUser.ratings.length;
        ratedUser.trustLevel = parseFloat(avgRating.toFixed(1));
      } else {
        ratedUser.trustLevel = 0; // No ratings left
      }
      
      await ratedUser.save();
    }
    console.log(`[Account Deletion] Updated ${usersToUpdate.length} users' ratings and trust levels`);
    
    // Finally delete the user
    console.log(`[Account Deletion] Deleting user document for ${id}`);
    await User.findByIdAndDelete(req.user.id);
    console.log(`[Account Deletion] Successfully deleted user ${id}`);
    
    res.status(200).json({ 
      message: 'User account and all associated data deleted successfully.',
      details: {
        postsDeleted: postDeletionResult.deletedCount,
        commentsRemovedFrom: commentsUpdateResult.modifiedCount,
        likesUpdated: likeUpdateResult.modifiedCount,
        emptyLikesDeleted: emptyLikesDeletion.deletedCount,
        chatsDeleted: chatDeletionResult.deletedCount,
        notificationsDeleted: notificationDeletionResult.deletedCount,
        postsUpdated: postUpdateResult.modifiedCount,
        wishlistsUpdated: wishlistUpdateResult.modifiedCount,
        likedPostsUpdated: likedPostsUpdateResult.modifiedCount,
        ratingsUpdated: usersToUpdate.length
      }
    });
  } catch (error) {
    console.error(`[Account Deletion] Error deleting user account ${id}:`, error);
    res.status(500).json({ 
      message: 'Failed to delete user account.',
      error: error.message 
    });
  }
});

module.exports = router;
