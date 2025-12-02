const express = require('express');
const router = express.Router();
const { getLoGanStats, getSpecialPrizeStats, getDauDuoiStats, getDauDuoiStatsByDate, getSpecialPrizeStatsByWeek, getTanSuatLotoStats, getTanSuatLoCapStats, getSpecialDetailedStats } = require('../controllers/xsmbController');
const rateLimit = require('express-rate-limit');

// Rate limiter
const statsLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 100,
    message: 'Quá nhiều yêu cầu thống kê, vui lòng thử lại sau',
    keyGenerator: (req) => {
        return req.headers['x-user-id'] || req.ip;
    },
    skip: (req) => {
        // Skip rate limiting cho localhost trong development
        return process.env.NODE_ENV === 'development' || req.ip === '127.0.0.1' || req.ip === '::1';
    },
});

// ✅ Performance: Add cache headers middleware for statistics endpoints
const addCacheHeaders = (req, res, next) => {
    // Cache statistics for 5 minutes (300 seconds) - data updates daily
    res.set({
        'Cache-Control': 'public, max-age=300, s-maxage=300, stale-while-revalidate=600',
        'Vary': 'Accept-Encoding'
    });
    next();
};

// Thống kê Lô Gan
router.get('/xsmb/statistics/gan', statsLimiter, addCacheHeaders, async (req, res) => {
    await getLoGanStats(req, res);
});

// Thống kê Giải Đặc Biệt
router.get('/xsmb/statistics/special', statsLimiter, addCacheHeaders, async (req, res) => {
    await getSpecialPrizeStats(req, res);
});

// Thống kê Giải Đặc Biệt theo tuần
router.get('/xsmb/statistics/special-by-week', statsLimiter, addCacheHeaders, async (req, res) => {
    await getSpecialPrizeStatsByWeek(req, res);
});

// Thống kê Đầu Đuôi
router.get('/xsmb/statistics/dau-duoi', statsLimiter, addCacheHeaders, async (req, res) => {
    await getDauDuoiStats(req, res);
});

// Thống kê Đầu Đuôi theo ngày
router.get('/xsmb/statistics/dau-duoi-by-date', statsLimiter, addCacheHeaders, async (req, res) => {
    await getDauDuoiStatsByDate(req, res);
});

// Thống kê Tần Suất Loto
router.get('/xsmb/statistics/tan-suat-loto', statsLimiter, addCacheHeaders, async (req, res) => {
    await getTanSuatLotoStats(req, res);
});

// Thống kê Tần Suất Lô Cặp
router.get('/xsmb/statistics/tan-suat-lo-cap', statsLimiter, addCacheHeaders, async (req, res) => {
    await getTanSuatLoCapStats(req, res);
});

// Thống kê chi tiết Giải Đặc Biệt (gan theo bộ, tổng, chạm, đầu đuôi)
router.get('/xsmb/statistics/special-detailed', statsLimiter, addCacheHeaders, async (req, res) => {
    await getSpecialDetailedStats(req, res);
});

module.exports = router;
