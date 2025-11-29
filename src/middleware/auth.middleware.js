/**
 * Auth Middleware - Verify JWT token và authenticate requests
 */

const jwt = require('jsonwebtoken');
const User = require('../models/user.model');

// Verify JWT token
exports.verifyToken = async (req, res, next) => {
    try {
        // Get token from header
        const authHeader = req.headers.authorization;
        
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                message: 'Không có token xác thực'
            });
        }

        const token = authHeader.substring(7); // Remove 'Bearer '

        // Verify token
        const decoded = jwt.verify(
            token,
            process.env.JWT_SECRET || 'your-secret-key-change-in-production'
        );

        // Find user
        const user = await User.findById(decoded.userId);
        
        if (!user || !user.isActive) {
            return res.status(401).json({
                success: false,
                message: 'Người dùng không hợp lệ'
            });
        }

        // Attach user info to request
        req.userId = user._id;
        req.userRole = user.role;
        req.user = user;

        next();
    } catch (error) {
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({
                success: false,
                message: 'Token không hợp lệ'
            });
        }
        
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                success: false,
                message: 'Token đã hết hạn'
            });
        }

        console.error('Auth middleware error:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi xác thực'
        });
    }
};

// Check if user is admin
exports.requireAdmin = (req, res, next) => {
    if (req.userRole !== 'admin') {
        return res.status(403).json({
            success: false,
            message: 'Chỉ admin mới có quyền thực hiện hành động này'
        });
    }
    next();
};

// Optional auth - không bắt buộc phải có token
exports.optionalAuth = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.substring(7);
            
            try {
                const decoded = jwt.verify(
                    token,
                    process.env.JWT_SECRET || 'your-secret-key-change-in-production'
                );
                
                const user = await User.findById(decoded.userId);
                if (user && user.isActive) {
                    req.userId = user._id;
                    req.userRole = user.role;
                    req.user = user;
                }
            } catch (error) {
                // Token invalid, but continue without auth
            }
        }
        
        next();
    } catch (error) {
        next();
    }
};





























