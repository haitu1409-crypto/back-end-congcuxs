const express = require('express');
const router = express.Router();
const { getBacCauStats, updateBacCauStats } = require('../controllers/bacCau.controller');
const rateLimit = require('express-rate-limit');

// Rate limiter cho các endpoint
const bacCauLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 phút
    max: 30, // Tối đa 30 requests mỗi phút
    message: 'Quá nhiều yêu cầu, vui lòng thử lại sau',
    keyGenerator: (req) => {
        return req.headers['x-user-id'] || req.ip;
    },
});

const updateLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 phút
    max: 5, // Tối đa 5 requests mỗi phút cho update
    message: 'Quá nhiều yêu cầu cập nhật, vui lòng thử lại sau',
    keyGenerator: (req) => {
        return req.headers['x-user-id'] || req.ip;
    },
});

// Route lấy thống kê Bắc Cầu
router.get('/stats', bacCauLimiter, getBacCauStats);

// Route cập nhật thống kê Bắc Cầu
router.put('/stats', updateLimiter, updateBacCauStats);

module.exports = router;


