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
const { calculateAndSaveSpecialDetailedStats } = require('../services/specialDetailedStats.service');
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

// Route cập nhật thống kê chi tiết Giải Đặc Biệt
router.put('/xsmb/statistics/special-detailed', updateLimiter, async (req, res) => {
    try {
        const { days } = req.query;
        if (!days) {
            return res.status(400).json({ error: 'Tham số days là bắt buộc' });
        }
        console.log(`🔄 Cập nhật thống kê chi tiết cho ${days} ngày...`);
        const result = await calculateAndSaveSpecialDetailedStats(Number(days));
        console.log(`✅ Đã cập nhật thống kê chi tiết cho ${days} ngày`);
        res.status(200).json({
            success: true,
            message: `Đã cập nhật thống kê chi tiết cho ${days} ngày`,
            data: result
        });
    } catch (error) {
        console.error('❌ Lỗi khi cập nhật thống kê chi tiết:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;







































