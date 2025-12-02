const express = require('express');
const router = express.Router();
const { generateBoxImage, generateMultipleBoxImages } = require('../controllers/thongKeImage.controller');
const rateLimit = require('express-rate-limit');

// Rate limiter cho API chụp hình (giới hạn thấp hơn vì tốn tài nguyên)
const imageLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 phút
    max: 10, // Tối đa 10 requests/phút
    message: 'Quá nhiều yêu cầu chụp hình, vui lòng thử lại sau',
    keyGenerator: (req) => {
        return req.headers['x-user-id'] || req.ip;
    },
    skip: (req) => {
        // Skip rate limiting cho localhost trong development
        return process.env.NODE_ENV === 'development' || req.ip === '127.0.0.1' || req.ip === '::1';
    },
});

// Generate hình ảnh từ một box HTML
router.post('/thongke/generate-image', imageLimiter, async (req, res) => {
    await generateBoxImage(req, res);
});

// Generate nhiều hình ảnh từ nhiều box HTML
router.post('/thongke/generate-multiple-images', imageLimiter, async (req, res) => {
    await generateMultipleBoxImages(req, res);
});

module.exports = router;









