/**
 * Article Routes - API endpoints cho bài viết tin tức
 * Tối ưu hiệu suất với caching và rate limiting
 */

const express = require('express');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const {
    getArticles,
    getArticleBySlug,
    getFeaturedArticles,
    getTrendingArticles,
    getArticlesByCategory,
    searchArticles,
    createArticle,
    getCategories,
    likeArticle,
    shareArticle,
    deleteArticle
} = require('../controllers/article.controller');

const router = express.Router();

// Rate limiting - Relaxed for development
const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 2000, // limit each IP to 2000 requests per windowMs (increased for development)
    message: {
        success: false,
        message: 'Quá nhiều yêu cầu, vui lòng thử lại sau'
    }
});

const createLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 50, // limit each IP to 50 create requests per hour (increased for development)
    message: {
        success: false,
        message: 'Quá nhiều yêu cầu tạo bài viết, vui lòng thử lại sau'
    }
});

// Configure multer for file uploads
const upload = multer({
    dest: 'uploads/',
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB limit
        files: 10 // Maximum 10 files
    },
    fileFilter: (req, file, cb) => {
        // Check file type
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Chỉ cho phép upload file ảnh'), false);
        }
    }
});

// Create uploads directory if it doesn't exist
const fs = require('fs');
const path = require('path');
const uploadsDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Apply general rate limiting to all routes
router.use(generalLimiter);

// Public routes
router.get('/', getArticles);
router.get('/featured', getFeaturedArticles);
router.get('/trending', getTrendingArticles);
router.get('/categories', getCategories);
router.get('/search', searchArticles);
router.get('/category/:category', getArticlesByCategory);
router.get('/:slug', getArticleBySlug);

// Interaction routes
router.post('/:slug/like', likeArticle);
router.post('/:slug/share', shareArticle);
router.post('/:slug/view', (req, res) => {
    // Simple view tracking endpoint
    res.json({ success: true, message: 'View tracked' });
});

// Admin routes
router.post('/create',
    createLimiter,
    upload.fields([
        { name: 'featuredImage', maxCount: 1 },
        { name: 'images', maxCount: 9 }
    ]),
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
    createArticle
);

router.delete('/:id', deleteArticle);


module.exports = router;
