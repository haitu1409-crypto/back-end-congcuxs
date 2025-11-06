/**
 * Auth Controller - Xử lý đăng ký, đăng nhập, logout
 * Tối ưu với validation và error handling
 */

const User = require('../models/user.model');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const crypto = require('crypto');
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
    email: user.email,
    provider: user.provider
});

const encodeState = (payload) => {
    try {
        return Buffer.from(JSON.stringify(payload)).toString('base64url');
    } catch (error) {
        console.error('Failed to encode state payload:', error);
        return crypto.randomBytes(12).toString('hex');
    }
};

const decodeState = (stateValue) => {
    if (!stateValue) return {};
    try {
        const json = Buffer.from(stateValue, 'base64url').toString('utf8');
        const data = JSON.parse(json);
        if (typeof data === 'object' && data !== null) {
            return data;
        }
    } catch (error) {
        console.warn('Failed to decode state payload, returning raw state:', error.message);
        return { originalState: stateValue };
    }
    return {};
};

const sanitizeUsername = (value) => {
    const base = value
        .toLowerCase()
        .normalize('NFD')
        .replace(/[^a-z0-9_]+/g, '_')
        .replace(/_{2,}/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 20);
    if (base.length >= 3) return base;
    return `fb_${crypto.randomBytes(3).toString('hex')}`;
};

const generateUniqueUsername = async (preferred) => {
    let username = sanitizeUsername(preferred);
    if (!username || username.length < 3) {
        username = `fb_${crypto.randomBytes(3).toString('hex')}`;
    }

    let attempt = 0;
    let candidate = username;

    while (await User.exists({ username: candidate })) {
        attempt += 1;
        const suffix = attempt.toString();
        const trimmedBase = username.slice(0, Math.max(3, 30 - suffix.length - 1));
        candidate = `${trimmedBase}_${suffix}`;
        if (attempt > 50) {
            candidate = `fb_${crypto.randomBytes(4).toString('hex')}`;
            break;
        }
    }

    return candidate;
};

const AVATAR_FOLDER = process.env.CLOUDINARY_AVATAR_FOLDER || 'avatars';

const uploadFacebookAvatar = async (imageUrl, userIdentifier) => {
    if (!imageUrl) return null;

    try {
        const result = await cloudinary.uploader.upload(imageUrl, {
            folder: AVATAR_FOLDER,
            public_id: `facebook_${userIdentifier}`,
            overwrite: true,
            transformation: [{ width: 512, height: 512, crop: 'fill', gravity: 'face' }]
        });

        return result.secure_url;
    } catch (error) {
        console.error('Failed to upload Facebook avatar to Cloudinary:', error.message);
        return null;
    }
};

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

// Start Facebook OAuth flow
exports.facebookLogin = async (req, res) => {
    try {
        const clientId = process.env.FACEBOOK_APP_ID;
        const defaultRedirectUri = process.env.FACEBOOK_REDIRECT_URI;

        if (!clientId || !defaultRedirectUri) {
            return res.status(500).json({
                success: false,
                message: 'Facebook OAuth chưa được cấu hình'
            });
        }

        const redirectUri = defaultRedirectUri;
        const statePayload = {
            nonce: crypto.randomBytes(8).toString('hex')
        };

        if (req.query.success_redirect) {
            statePayload.successRedirect = req.query.success_redirect;
        }

        if (req.query.state) {
            statePayload.originalState = req.query.state;
        }

        const encodedState = encodeState(statePayload);

        const authUrl = new URL('https://www.facebook.com/v19.0/dialog/oauth');
        authUrl.searchParams.set('client_id', clientId);
        authUrl.searchParams.set('redirect_uri', redirectUri);
        authUrl.searchParams.set('response_type', 'code');
        authUrl.searchParams.set('scope', process.env.FACEBOOK_PERMISSIONS || 'email,public_profile');
        authUrl.searchParams.set('state', encodedState);

        return res.redirect(authUrl.toString());
    } catch (error) {
        console.error('Facebook login redirect error:', error);
        res.status(500).json({
            success: false,
            message: 'Không thể chuyển hướng tới Facebook'
        });
    }
};

// Handle Facebook OAuth callback
exports.facebookCallback = async (req, res) => {
    const {
        code,
        state,
        error: fbError,
        error_description: errorDescription
    } = req.query;

    if (fbError) {
        console.error('Facebook returned error:', fbError, errorDescription);
        const stateData = decodeState(state);
        return redirectToError(res, stateData, fbError);
    }

    if (!code) {
        const stateData = decodeState(state);
        return redirectToError(res, stateData, 'missing_code');
    }

    try {
        const clientId = process.env.FACEBOOK_APP_ID;
        const clientSecret = process.env.FACEBOOK_APP_SECRET;
        const redirectUri = process.env.FACEBOOK_REDIRECT_URI;

        if (!clientId || !clientSecret || !redirectUri) {
            throw new Error('Facebook OAuth chưa được cấu hình đầy đủ');
        }

        // Exchange code for access token
        const tokenResponse = await axios.get('https://graph.facebook.com/v19.0/oauth/access_token', {
            params: {
                client_id: clientId,
                client_secret: clientSecret,
                redirect_uri: redirectUri,
                code
            }
        });

        const accessToken = tokenResponse.data.access_token;

        if (!accessToken) {
            throw new Error('Không nhận được access token từ Facebook');
        }

        // Fetch user profile
        const profileResponse = await axios.get('https://graph.facebook.com/me', {
            params: {
                fields: 'id,name,email,picture.width(512),first_name,last_name',
                access_token: accessToken
            }
        });

        const profile = profileResponse.data;

        if (!profile?.id) {
            throw new Error('Không lấy được thông tin người dùng từ Facebook');
        }

        let user = await User.findOne({ facebookId: profile.id });

        if (!user && profile.email) {
            user = await User.findOne({ email: profile.email.toLowerCase() });
        }

        const avatarUrl = profile.picture?.data?.url || null;

        let cloudAvatarUrl = null;

        if (avatarUrl) {
            cloudAvatarUrl = await uploadFacebookAvatar(avatarUrl, profile.id);
        }

        if (!user) {
            const username = await generateUniqueUsername(profile.email || profile.name || profile.id);
            const displayName = profile.name || `${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 'Facebook User';

            user = await User.create({
                username,
                displayName,
                email: profile.email ? profile.email.toLowerCase() : undefined,
                provider: 'facebook',
                facebookId: profile.id,
                avatar: cloudAvatarUrl || avatarUrl,
                password: crypto.randomBytes(16).toString('hex')
            });
        } else {
            user.facebookId = user.facebookId || profile.id;
            user.provider = user.provider || 'facebook';
            if (profile.email && !user.email) {
                user.email = profile.email.toLowerCase();
            }
            if (cloudAvatarUrl) {
                user.avatar = cloudAvatarUrl;
            } else if (avatarUrl && (!user.avatar || user.avatar.startsWith('http'))) {
                user.avatar = avatarUrl;
            }
            if (!user.displayName && profile.name) {
                user.displayName = profile.name;
            }
            await user.save({ validateBeforeSave: false });
        }

        user.lastLogin = new Date();
        await user.save({ validateBeforeSave: false });

        const token = generateToken(user._id, user.role);

        const stateData = decodeState(state);
        const successRedirect = buildSuccessRedirect(token, user, {
            successRedirect: stateData.successRedirect,
            state: stateData.originalState
        });
        return res.redirect(successRedirect);
    } catch (error) {
        console.error('Facebook callback error:', error.message, error.stack);
        const stateData = decodeState(state);
        return redirectToError(res, stateData, 'callback_failed');
    }
};

const buildSuccessRedirect = (token, user, options = {}) => {
    const redirectUri = options.successRedirect || process.env.FACEBOOK_SUCCESS_REDIRECT || `${process.env.FRONTEND_URL || ''}/auth/facebook/callback`;
    const url = new URL(redirectUri);

    const safeUser = buildSafeUserResponse(user);
    const encodedUser = Buffer.from(JSON.stringify(safeUser)).toString('base64url');

    url.searchParams.set('token', token);
    url.searchParams.set('user', encodedUser);
    url.searchParams.set('provider', 'facebook');
    if (options.state) {
        url.searchParams.set('state', options.state);
    }

    return url.toString();
};

const redirectToError = (res, stateData = {}, errorCode) => {
    const redirectUri = stateData.successRedirect || process.env.FACEBOOK_ERROR_REDIRECT || process.env.FACEBOOK_SUCCESS_REDIRECT || process.env.FRONTEND_URL || '/';
    const url = new URL(redirectUri);

    url.searchParams.set('error', errorCode);
    if (stateData.originalState) {
        url.searchParams.set('state', stateData.originalState);
    }

    return res.redirect(url.toString());
};

