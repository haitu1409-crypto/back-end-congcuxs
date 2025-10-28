/**
 * Position Soi Cau Routes
 * Routes cho thuật toán soi cầu dựa trên vị trí số
 */

const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const {
    getPositionSoiCau,
    getPositionSoiCauRange,
    getPositionPatternStats
} = require('../controllers/positionSoiCau.controller');

// Rate limiter cho position soi cau
const positionSoiCauLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 phút
    max: process.env.NODE_ENV === 'development' ? 1000 : 50, // Tăng limit cho development
    message: 'Quá nhiều yêu cầu soi cầu vị trí, vui lòng thử lại sau',
    keyGenerator: (req) => req.headers['x-user-id'] || req.ip,
    skip: (req) => {
        // Skip rate limit cho localhost trong development
        return process.env.NODE_ENV === 'development' &&
            (req.ip === '127.0.0.1' || req.ip === '::1' || req.ip === '::ffff:127.0.0.1');
    }
});

// Rate limiter cho stats
const statsLimiter = rateLimit({
    windowMs: 5 * 60 * 1000, // 5 phút
    max: 20, // Tối đa 20 requests/5 phút
    message: 'Quá nhiều yêu cầu thống kê, vui lòng thử lại sau',
    keyGenerator: (req) => req.headers['x-user-id'] || req.ip,
});

/**
 * @route GET /api/position-soicau
 * @desc Soi cầu dựa trên vị trí số
 * @query {string} date - Ngày phân tích (DD/MM/YYYY)
 * @query {number} days - Số ngày phân tích (2-30, default: 2)
 * @access Public
 */
router.get('/', positionSoiCauLimiter, async (req, res) => {
    await getPositionSoiCau(req, res);
});

/**
 * @route GET /api/position-soicau/range
 * @desc Soi cầu vị trí trong khoảng thời gian
 * @query {string} startDate - Ngày bắt đầu (DD/MM/YYYY)
 * @query {string} endDate - Ngày kết thúc (DD/MM/YYYY)
 * @query {number} days - Số ngày phân tích (2-30)
 * @access Public
 */
router.get('/range', positionSoiCauLimiter, async (req, res) => {
    await getPositionSoiCauRange(req, res);
});

/**
 * @route GET /api/position-soicau/stats
 * @desc Thống kê pattern vị trí
 * @query {number} days - Số ngày thống kê (2-30, default: 7)
 * @access Public
 */
router.get('/stats', statsLimiter, async (req, res) => {
    await getPositionPatternStats(req, res);
});

/**
 * @route GET /api/position-soicau/health
 * @desc Health check endpoint
 * @access Public
 */
router.get('/health', (req, res) => {
    res.status(200).json({
        status: 'OK',
        service: 'Position Soi Cau API',
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        endpoints: {
            main: '/api/position-soicau',
            range: '/api/position-soicau/range',
            stats: '/api/position-soicau/stats'
        }
    });
});

module.exports = router;
