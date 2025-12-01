/**
 * Position Soi Cau Loto Routes
 * Routes cho thuật toán soi cầu lô tô theo vị trí số
 */

const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const {
    getPositionSoiCauLoto,
    getPositionSoiCauRangeLoto,
    getPositionPatternStatsLoto,
    checkAndUpdateSoiCau,
    getPositionSoiCauLotoHistory,
    getLatestSoiCauDate
} = require('../controllers/positionSoiCauLoto.controller');

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
 * @route GET /api/position-soicau-loto
 * @desc Soi cầu lô tô dựa trên vị trí số
 * @query {string} date - Ngày phân tích (DD/MM/YYYY)
 * @query {number} days - Số ngày phân tích (2-30, default: 2)
 * @access Public
 */
router.get('/', positionSoiCauLimiter, async (req, res) => {
    await getPositionSoiCauLoto(req, res);
});

/**
 * @route GET /api/position-soicau-loto/range
 * @desc Soi cầu lô tô vị trí trong khoảng thời gian
 * @query {string} startDate - Ngày bắt đầu (DD/MM/YYYY)
 * @query {string} endDate - Ngày kết thúc (DD/MM/YYYY)
 * @query {number} days - Số ngày phân tích (2-30)
 * @access Public
 */
router.get('/range', positionSoiCauLimiter, async (req, res) => {
    await getPositionSoiCauRangeLoto(req, res);
});

/**
 * @route GET /api/position-soicau-loto/stats
 * @desc Thống kê pattern vị trí cho lô tô
 * @query {number} days - Số ngày thống kê (2-30, default: 7)
 * @access Public
 */
router.get('/stats', statsLimiter, async (req, res) => {
    await getPositionPatternStatsLoto(req, res);
});

// Rate limiter riêng cho check-update (nghiêm ngặt hơn vì đây là operation nặng)
const checkUpdateLimiter = rateLimit({
    windowMs: 5 * 60 * 1000, // 5 phút
    max: process.env.NODE_ENV === 'development' ? 10 : 3, // Tối đa 3 requests/5 phút trong production
    message: 'Quá nhiều yêu cầu cập nhật soi cầu. Vui lòng đợi 5 phút trước khi thử lại.',
    keyGenerator: (req) => req.headers['x-user-id'] || req.ip,
    skip: (req) => {
        // Skip rate limit cho localhost trong development
        return process.env.NODE_ENV === 'development' &&
            (req.ip === '127.0.0.1' || req.ip === '::1' || req.ip === '::ffff:127.0.0.1');
    },
    standardHeaders: true,
    legacyHeaders: false,
});

/**
 * @route POST /api/position-soicau-loto/check-update
 * @desc Kiểm tra và cập nhật soi cầu tự động
 * @query {number} days - Số ngày phân tích (2-10, default: 4) - Giới hạn 10 để tránh memory crash
 * @access Public
 */
router.post('/check-update', checkUpdateLimiter, async (req, res) => {
    await checkAndUpdateSoiCau(req, res);
});

/**
 * @route GET /api/position-soicau-loto/history
 * @desc Lấy lịch sử dự đoán soi cầu lô tô
 * @query {number} limit - Số lượng bản ghi (1-100, default: 14)
 * @query {number} days - Số ngày phân tích (2-30, default: 4)
 * @access Public
 */
router.get('/history', positionSoiCauLimiter, async (req, res) => {
    await getPositionSoiCauLotoHistory(req, res);
});

/**
 * @route GET /api/position-soicau-loto/latest-date
 * @desc Lấy ngày soi cầu mới nhất
 * @access Public
 */
router.get('/latest-date', async (req, res) => {
    await getLatestSoiCauDate(req, res);
});

/**
 * @route GET /api/position-soicau-loto/health
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
            main: '/api/position-soicau-loto',
            range: '/api/position-soicau-loto/range',
            stats: '/api/position-soicau-loto/stats',
            checkUpdate: '/api/position-soicau-loto/check-update'
        }
    });
});

module.exports = router;
