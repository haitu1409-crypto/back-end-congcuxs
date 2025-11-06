/**
 * Auth Controller - Xử lý đăng ký, đăng nhập, logout
 * Tối ưu với validation và error handling
 */

const User = require('../models/user.model');
const jwt = require('jsonwebtoken');
const { validationResult } = require('express-validator');
const cloudinary = require('cloudinary').v2;

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// Generate JWT token
const generateToken = (userId, role) => {
    return jwt.sign(
        { userId, role },
        process.env.JWT_SECRET || 'your-secret-key-change-in-production',
        { expiresIn: '10d' }
    );
};

const buildSafeUserResponse = (user) => ({
    id: user._id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    avatar: user.avatar,
    email: user.email
});

const AVATAR_FOLDER = process.env.CLOUDINARY_AVATAR_FOLDER || 'avatars';

const uploadAvatarBufferToCloudinary = (buffer, userId) => {
    return new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream({
            folder: AVATAR_FOLDER,
            public_id: `user_${userId}_${Date.now()}`,
            overwrite: true,
            transformation: [{ width: 512, height: 512, crop: 'fill', gravity: 'face' }]
        }, (error, result) => {
            if (error) {
                return reject(error);
            }
            resolve(result);
        });

        uploadStream.end(buffer);
    });
};

// Register new user
exports.register = async (req, res) => {
    try {
        // Validate input
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                message: 'Dữ liệu không hợp lệ',
                errors: errors.array()
            });
        }

        const { username, displayName, password, confirmPassword } = req.body;

        // Check password match
        if (password !== confirmPassword) {
            return res.status(400).json({
                success: false,
                message: 'Mật khẩu xác nhận không khớp'
            });
        }

        // Check if username exists
        const existingUser = await User.findByUsername(username);
        if (existingUser) {
            return res.status(409).json({
                success: false,
                message: 'Tên đăng nhập đã tồn tại'
            });
        }

        // Create new user
        const user = await User.create({
            username: username.toLowerCase(),
            displayName,
            password,
            role: 'user' // Default role
        });

        // Generate token
        const token = generateToken(user._id, user.role);

        // Return user data (without password)
        res.status(201).json({
            success: true,
            message: 'Đăng ký thành công',
            data: {
                user: buildSafeUserResponse(user),
                token
            }
        });
    } catch (error) {
        console.error('Register error:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi server khi đăng ký',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Login
exports.login = async (req, res) => {
    try {
        // Validate input
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                message: 'Dữ liệu không hợp lệ',
                errors: errors.array()
            });
        }

        const { username, password } = req.body;

        // Find user by username (include password for comparison)
        const user = await User.findOne({ 
            username: username.toLowerCase(),
            isActive: true 
        }).select('+password');

        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Tên đăng nhập hoặc mật khẩu không đúng'
            });
        }

        // Compare password
        const isPasswordValid = await user.comparePassword(password);
        if (!isPasswordValid) {
            return res.status(401).json({
                success: false,
                message: 'Tên đăng nhập hoặc mật khẩu không đúng'
            });
        }

        // Update last login
        user.lastLogin = new Date();
        await user.save({ validateBeforeSave: false });

        // Generate token
        const token = generateToken(user._id, user.role);

        // Return user data
        res.json({
            success: true,
            message: 'Đăng nhập thành công',
            data: {
                user: {
                    ...buildSafeUserResponse(user),
                    isAdmin: user.role === 'admin'
                },
                token
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi server khi đăng nhập',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Get current user
exports.getMe = async (req, res) => {
    try {
        const user = await User.findById(req.userId);
        
        if (!user || !user.isActive) {
            return res.status(404).json({
                success: false,
                message: 'Người dùng không tồn tại'
            });
        }

        res.json({
            success: true,
            data: {
                user: {
                    ...buildSafeUserResponse(user),
                    isAdmin: user.role === 'admin',
                    lastLogin: user.lastLogin,
                    lastSeen: user.lastSeen
                }
            }
        });
    } catch (error) {
        console.error('Get me error:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi server',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Logout (client-side mainly, but can invalidate token if needed)
exports.logout = async (req, res) => {
    try {
        // Update last seen
        if (req.userId) {
            await User.findByIdAndUpdate(req.userId, {
                lastSeen: new Date(),
                socketId: null
            });
        }

        res.json({
            success: true,
            message: 'Đăng xuất thành công'
        });
    } catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi server khi đăng xuất',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Update user profile
exports.updateProfile = async (req, res) => {
    try {
        const { displayName, avatar } = req.body;
        const userId = req.userId;

        const updateData = {};
        if (displayName) updateData.displayName = displayName;
        if (avatar !== undefined) updateData.avatar = avatar;

        const user = await User.findByIdAndUpdate(
            userId,
            updateData,
            { new: true, runValidators: true }
        );

        res.json({
            success: true,
            message: 'Cập nhật thông tin thành công',
            data: {
                user: buildSafeUserResponse(user)
            }
        });
    } catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi server khi cập nhật',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Upload avatar
exports.uploadAvatar = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'Không có file được upload'
            });
        }

        const userId = req.userId;
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy người dùng'
            });
        }

        const uploadResult = await uploadAvatarBufferToCloudinary(req.file.buffer, userId);

        user.avatar = uploadResult.secure_url;
        await user.save({ validateBeforeSave: false });

        res.json({
            success: true,
            message: 'Upload avatar thành công',
            data: {
                url: uploadResult.secure_url,
                user: buildSafeUserResponse(user)
            }
        });
    } catch (error) {
        console.error('Upload avatar error:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi server khi upload avatar',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};


