/**
 * Routes Soi Cầu Bắc Cầu
 */

const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const {
    getSoiCauBacCauStats,
    updateSoiCauBacCauStats
} = require('../controllers/soiCauBacCau.controller');

// Rate limiter cho get stats
const statsLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 phút
    max: process.env.NODE_ENV === 'development' ? 1000 : 50,
    message: 'Quá nhiều yêu cầu, vui lòng thử lại sau',
    keyGenerator: (req) => req.headers['x-user-id'] || req.ip,
    skip: (req) => {
        return process.env.NODE_ENV === 'development' &&
            (req.ip === '127.0.0.1' || req.ip === '::1' || req.ip === '::ffff:127.0.0.1');
    }
});

// Rate limiter cho update
const updateLimiter = rateLimit({
    windowMs: 5 * 60 * 1000, // 5 phút
    max: 10, // Tối đa 10 requests/5 phút
    message: 'Quá nhiều yêu cầu cập nhật, vui lòng thử lại sau',
    keyGenerator: (req) => req.headers['x-user-id'] || req.ip,
});

/**
 * @route GET /api/soicau-bac-cau
 * @desc Lấy thống kê soi cầu bắc cầu
 * @query {number} days - Số ngày (90, 120, 150, 180, 240, 270, 300, 365; default: 90)
 * @access Public
 */
router.get('/', statsLimiter, async (req, res) => {
    await getSoiCauBacCauStats(req, res);
});

/**
 * @route PUT /api/soicau-bac-cau
 * @desc Cập nhật thống kê soi cầu bắc cầu
 * @query {number} days - Số ngày (90, 120, 150, 180, 240, 270, 300, 365; default: 90)
 * @access Public
 */
router.put('/', updateLimiter, async (req, res) => {
    await updateSoiCauBacCauStats(req, res);
});

/**
 * @route GET /api/soicau-bac-cau/health
 * @desc Health check endpoint
 * @access Public
 */
router.get('/health', (req, res) => {
    res.status(200).json({
        status: 'OK',
        service: 'Soi Cau Bac Cau API',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        endpoints: {
            get: '/api/soicau-bac-cau?days=90',
            update: 'PUT /api/soicau-bac-cau?days=90'
        }
    });
});

module.exports = router;


