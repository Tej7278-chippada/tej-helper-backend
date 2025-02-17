// controllers/groupControllers.js
const Group = require('../models/groupModel');
const User = require('../models/userModel');

// Create a Group
// exports.createGroup = async (req, res) => {
//   const { groupName, groupPicture } = req.body;
//   const userId = req.user.id; // From authMiddleware

//   try {
//     const group = new Group({
//       groupName,
//       groupPicture,
//       createdBy: userId,
//       members: [{ user: userId, role: 'Admin' }],
//     });

//     group.generateJoinCode(); // Generate initial join code
//     await group.save();

//     // Add group ID to user's groups array
//     await User.findByIdAndUpdate(userId, { $push: { groups: group._id } });

//     res.status(201).json({ message: 'Group created successfully', group });
//   } catch (error) {
//     res.status(500).json({ message: 'Error creating group', error });
//   }
// };

// Join a Group
exports.joinGroup = async (req, res) => {
  const { joinCode, usePreviousBalance } = req.body;
  const userId = req.user.id;

  try {
    const group = await Group.findOne({ joinCode });

    if (!group) {
      return res.status(404).json({ message: 'Invalid join code' });
    }

    if (Date.now() > group.joinCodeExpiry) {
      return res.status(400).json({ message: 'Join code has expired' });
    }

    // Check if user is already a member
    if (group.members.some((member) => member.user.toString() === userId)) {
      return res.status(400).json({ message: 'You are already a member of this group' });
    }

    // Check if user is a past member
    const pastMember = group.pastMembers.find((member) => member.user.toString() === userId);

    let balance = 0;
    if (pastMember && usePreviousBalance) {
      balance = pastMember.balance; // Assign the previous balance
      
    }

    // Add user to the group
    group.members.push({ user: userId, role: 'Member', balance });

    // Log the member joining
    group.logs.push({
      type: 'member_joined',
      user: userId,
      username: req.user.username,
      description: `${req.user.username} joined the group.`,
    });

    // Remove the user from pastMembers
    group.pastMembers = group.pastMembers.filter((member) => member.user.toString() !== userId);
    
    await group.save();

    // Add group ID to user's groups array
    await User.findByIdAndUpdate(userId, { $push: { groups: group._id } });

    res.status(200).json({ message: 'Joined group successfully', group });
  } catch (error) {
    res.status(500).json({ message: 'Error joining group', error });
  }
};


exports.getUserGroups = async (req, res) => {
  const userId = req.user.id;

  try {
    const user = await User.findById(userId).populate('groups');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.status(200).json({ groups: user.groups });
  } catch (error) {
    res.status(500).json({ message: 'Error fetching user groups', error });
  }
};


// Fetch Groups for a User
exports.fetchGroups = async (req, res) => {
  const userId = req.user.id;

  try {
    const groups = await Group.find({ 'members.user': userId }) 
      .select('groupName groupPic') // Only fetch necessary fields
      .populate('members.user', 'username'); // Limit populated fields
      
    // Convert each product's media buffer to base64
    const groupsData = groups.map((group) => ({
      ...group._doc,
      groupPic: group.groupPic ? group.groupPic.toString('base64') : null, // Convert buffer to Base64
    }));
    res.status(200).json({groups: groupsData});
  } catch (error) {
    res.status(500).json({ message: 'Error fetching groups', error });
  }
};

// Fetch Group Details
// exports.fetchGroupDetails = async (req, res) => {
//   const { groupId } = req.params;

//   // if (req.group.id !== groupId) return res.status(403).json({ message: 'Unauthorized access' });

//   try {
//     const group = await Group.findById(groupId).populate('members.user', ); // 'username'
//     if (!group) {
//       return res.status(404).json({ message: 'Group not found' });
//     }

//     const groupData = group.toObject();
//     if (group.groupPic) {
//       groupData.groupPic = group.groupPic.toString('base64');
//     }

//     res.status(200).json(groupData);
//   } catch (error) {
//     res.status(500).json({ message: 'Error fetching group details', error });
//   }
// };

// Generate New Join Code
exports.generateJoinCode = async (req, res) => {
  const { groupId } = req.params;
  const userId = req.user.id;

  try {
    const group = await Group.findById(groupId);
    if (!group) {
      return res.status(404).json({ message: 'Group not found' });
    }

    // Only admins can generate join codes
    const isAdmin = group.members.some(
      (member) => member.user.toString() === userId && member.role === 'Admin'
    );

    if (!isAdmin) {
      return res.status(403).json({ message: 'Only admins can generate a join code' });
    }

    group.generateJoinCode();
    await group.save();

    res.status(200).json({ message: 'New join code generated', joinCode: group.joinCode });
  } catch (error) {
    res.status(500).json({ message: 'Error generating join code', error });
  }
};
