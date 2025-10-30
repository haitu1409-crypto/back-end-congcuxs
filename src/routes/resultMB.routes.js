const express = require('express');
const router = express.Router();
const { getLoGanStats, getSpecialPrizeStats, getDauDuoiStats, getDauDuoiStatsByDate, getSpecialPrizeStatsByWeek, getTanSuatLotoStats, getTanSuatLoCapStats } = require('../controllers/xsmbController');
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

// Thống kê Lô Gan
router.get('/xsmb/statistics/gan', statsLimiter, async (req, res) => {
    await getLoGanStats(req, res);
});

// Thống kê Giải Đặc Biệt
router.get('/xsmb/statistics/special', statsLimiter, async (req, res) => {
    await getSpecialPrizeStats(req, res);
});

// Thống kê Giải Đặc Biệt theo tuần
router.get('/xsmb/statistics/special-by-week', statsLimiter, async (req, res) => {
    await getSpecialPrizeStatsByWeek(req, res);
});

// Thống kê Đầu Đuôi
router.get('/xsmb/statistics/dau-duoi', statsLimiter, async (req, res) => {
    await getDauDuoiStats(req, res);
});

// Thống kê Đầu Đuôi theo ngày
router.get('/xsmb/statistics/dau-duoi-by-date', statsLimiter, async (req, res) => {
    await getDauDuoiStatsByDate(req, res);
});

// Thống kê Tần Suất Loto
router.get('/xsmb/statistics/tan-suat-loto', statsLimiter, async (req, res) => {
    await getTanSuatLotoStats(req, res);
});

// Thống kê Tần Suất Lô Cặp
router.get('/xsmb/statistics/tan-suat-lo-cap', statsLimiter, async (req, res) => {
    await getTanSuatLoCapStats(req, res);
});

module.exports = router;
