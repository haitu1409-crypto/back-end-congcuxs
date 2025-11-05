const express = require('express');
const router = express.Router();
const {
    updateLoGanStats,
    updateGiaiDacBietStats,
    updateGiaiDacBietTuanStats,
    updateDauDuoiStats,
    updateTanSuatLotoStats,
    updateTanSuatLoCapStats
} = require('../controllers/statsUpdateController');
const rateLimit = require('express-rate-limit');

// Rate limiter cho các endpoint cập nhật
const updateLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 phút
    max: 10, // Tối đa 10 requests mỗi phút
    message: 'Quá nhiều yêu cầu cập nhật, vui lòng thử lại sau',
    keyGenerator: (req) => {
        return req.headers['x-user-id'] || req.ip;
    },
});

// Route cập nhật thống kê Lô Gan
router.put('/xsmb/statistics/gan', updateLimiter, updateLoGanStats);

// Route cập nhật thống kê Giải Đặc Biệt
router.put('/xsmb/statistics/special', updateLimiter, updateGiaiDacBietStats);

// Route cập nhật thống kê Giải Đặc Biệt Theo Tuần
router.put('/xsmb/statistics/special-by-week', updateLimiter, updateGiaiDacBietTuanStats);

// Route cập nhật thống kê Đầu Đuôi
router.put('/xsmb/statistics/dau-duoi', updateLimiter, updateDauDuoiStats);

// Route cập nhật thống kê Tần Suất Lô Tô
router.put('/xsmb/statistics/tan-suat-loto', updateLimiter, updateTanSuatLotoStats);

// Route cập nhật thống kê Tần Suất Lô Cặp
router.put('/xsmb/statistics/tan-suat-lo-cap', updateLimiter, updateTanSuatLoCapStats);

module.exports = router;











