/**
 * Auth Routes - API endpoints cho authentication
 */

const express = require('express');
const { body } = require('express-validator');
const rateLimit = require('express-rate-limit');
const {
    register,
    login,
    getMe,
    logout,
    updateProfile,
    uploadAvatar
} = require('../controllers/auth.controller');
const { verifyToken } = require('../middleware/auth.middleware');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const router = express.Router();

// Rate limiting for auth endpoints
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // 10 attempts per 15 minutes
    message: {
        success: false,
        message: 'Quá nhiều lần thử, vui lòng thử lại sau 15 phút'
    },
    standardHeaders: true,
    legacyHeaders: false
});

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 login attempts per 15 minutes
    message: {
        success: false,
        message: 'Quá nhiều lần đăng nhập, vui lòng thử lại sau 15 phút'
    },
    standardHeaders: true,
    legacyHeaders: false
});

// Validation rules
const registerValidation = [
    body('username')
        .trim()
        .isLength({ min: 3, max: 30 })
        .withMessage('Tên đăng nhập phải có từ 3 đến 30 ký tự')
        .matches(/^[a-z0-9_]+$/)
        .withMessage('Tên đăng nhập chỉ được chứa chữ cái thường, số và dấu gạch dưới'),
    body('displayName')
        .trim()
        .isLength({ min: 2, max: 50 })
        .withMessage('Tên người dùng phải có từ 2 đến 50 ký tự'),
    body('password')
        .isLength({ min: 6 })
        .withMessage('Mật khẩu phải có ít nhất 6 ký tự'),
    body('confirmPassword')
        .custom((value, { req }) => {
            if (value !== req.body.password) {
                throw new Error('Mật khẩu xác nhận không khớp');
            }
            return true;
        })
];

const loginValidation = [
    body('username')
        .trim()
        .notEmpty()
        .withMessage('Tên đăng nhập là bắt buộc'),
    body('password')
        .notEmpty()
        .withMessage('Mật khẩu là bắt buộc')
];

const updateProfileValidation = [
    body('displayName')
        .optional()
        .trim()
        .isLength({ min: 2, max: 50 })
        .withMessage('Tên người dùng phải có từ 2 đến 50 ký tự'),
    body('avatar')
        .optional()
        .isURL()
        .withMessage('Avatar phải là URL hợp lệ')
];

// Public routes
router.post('/register', 
    authLimiter,
    registerValidation,
    register
);

router.post('/login',
    loginLimiter,
    loginValidation,
    login
);

// Configure multer for avatar upload
const upload = multer({
    dest: 'uploads/',
    limits: {
        fileSize: 2 * 1024 * 1024, // 2MB limit for avatars
        files: 1
    },
    fileFilter: (req, file, cb) => {
        // Check file type
        const allowedTypes = /jpeg|jpg|png|gif|webp/;
        const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype = allowedTypes.test(file.mimetype);

        if (mimetype && extname) {
            return cb(null, true);
        } else {
            cb(new Error('Chỉ cho phép upload file ảnh (JPEG, PNG, GIF, WebP)'), false);
        }
    }
});

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Protected routes
router.get('/me', verifyToken, getMe);
router.post('/logout', verifyToken, logout);
router.put('/profile', verifyToken, updateProfileValidation, updateProfile);
router.post('/avatar', 
    verifyToken,
    upload.single('avatar'),
    (err, req, res, next) => {
        if (err instanceof multer.MulterError) {
            return res.status(400).json({
                success: false,
                message: 'Lỗi upload file: ' + err.message
            });
        } else if (err) {
            return res.status(400).json({
                success: false,
                message: err.message
            });
        }
        next();
    },
    uploadAvatar
);

module.exports = router;

