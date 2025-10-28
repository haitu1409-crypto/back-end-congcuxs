/**
 * Bạch Thủ Đề Routes
 */

const express = require('express');
const router = express.Router();
const bachThuDeController = require('../controllers/bachThuDe.controller');

/**
 * @route GET /api/bach-thu-de
 * @desc Lấy dự đoán bạch thủ đề cho ngày cụ thể
 * @query {string} date - Ngày dự đoán (format: YYYY-MM-DD)
 * @query {number} days - Số ngày dữ liệu lịch sử (default: 30)
 */
router.get('/', bachThuDeController.getBachThuDe);

/**
 * @route GET /api/bach-thu-de/today
 * @desc Lấy dự đoán bạch thủ đề cho hôm nay
 */
router.get('/today', bachThuDeController.getBachThuDeToday);

module.exports = router;
