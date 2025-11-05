/**
 * Socket Auth Middleware - Verify JWT token cho Socket.io connections
 */

const jwt = require('jsonwebtoken');
const User = require('../models/user.model');

// Verify token from socket handshake
exports.verifySocketToken = async (socket, next) => {
    try {
        // Get token from multiple possible locations
        const token = socket.handshake.auth?.token || 
                     socket.handshake.query?.token ||
                     socket.handshake.headers?.authorization?.replace('Bearer ', '');

        console.log('🔐 Socket auth attempt:', {
            hasAuthToken: !!socket.handshake.auth?.token,
            hasQueryToken: !!socket.handshake.query?.token,
            hasHeaderAuth: !!socket.handshake.headers?.authorization,
            tokenLength: token?.length || 0
        });

        if (!token) {
            console.error('❌ No token provided in socket handshake');
            return next(new Error('Không có token xác thực'));
        }

        // Check JWT_SECRET (use same fallback as auth controller)
        const jwtSecret = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
        if (!process.env.JWT_SECRET) {
            console.warn('⚠️ JWT_SECRET not configured, using default (not secure for production!)');
        }

        // Verify token
        let decoded;
        try {
            decoded = jwt.verify(token, jwtSecret);
        } catch (jwtError) {
            if (jwtError.name === 'JsonWebTokenError') {
                console.error('❌ Invalid token format:', jwtError.message);
                return next(new Error('Token không hợp lệ'));
            }
            
            if (jwtError.name === 'TokenExpiredError') {
                console.error('❌ Token expired:', jwtError.expiredAt);
                return next(new Error('Token đã hết hạn. Vui lòng đăng nhập lại.'));
            }
            
            throw jwtError;
        }

        // Find user
        const user = await User.findById(decoded.userId);
        
        if (!user) {
            console.error('❌ User not found:', decoded.userId);
            return next(new Error('Người dùng không tồn tại'));
        }
        
        if (!user.isActive) {
            console.error('❌ User inactive:', decoded.userId);
            return next(new Error('Tài khoản đã bị vô hiệu hóa'));
        }

        // Attach user info to socket
        socket.userId = user._id.toString();
        socket.userRole = user.role;
        socket.user = {
            id: user._id.toString(),
            username: user.username,
            displayName: user.displayName,
            role: user.role,
            avatar: user.avatar
        };

        // Update user socketId (don't wait for save to complete)
        user.socketId = socket.id;
        user.save({ validateBeforeSave: false }).catch(err => {
            console.error('Error updating user socketId:', err);
        });

        console.log('✅ Socket authenticated:', user.username);
        next();
    } catch (error) {
        console.error('❌ Socket auth error:', {
            name: error.name,
            message: error.message,
            stack: error.stack
        });
        next(new Error('Lỗi xác thực: ' + error.message));
    }
};

