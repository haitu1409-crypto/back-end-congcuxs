const express = require('express');
const router = express.Router();
const xsmnResultController = require('../controllers/xsmnResult.controller');

/**
 * Routes để lấy dữ liệu XSMN
 * Chỉ bao gồm: lấy tất cả, lấy theo tỉnh, lấy theo thứ
 */

/**
 * @route   GET /api/xsmn-result/xsmn
 * @desc    Lấy tất cả dữ liệu XSMN với pagination theo ngày
 * @access  Public
 * @query   page (default: 1), daysPerPage (default: 3)
 */
router.get('/xsmn', xsmnResultController.apiLimiter, xsmnResultController.getAllResults);

/**
 * @route   GET /api/xsmn-result/xsmn/tinh/:tinh
 * @desc    Lấy dữ liệu XSMN theo tỉnh
 * @access  Public
 */
router.get('/xsmn/tinh/:tinh', xsmnResultController.apiLimiter, xsmnResultController.getResultsByProvince);

/**
 * @route   GET /api/xsmn-result/xsmn/:dayOfWeek
 * @desc    Lấy dữ liệu XSMN theo thứ trong tuần (thu-2, thu-3, ..., chu-nhat)
 * @access  Public
 */
router.get('/xsmn/:dayOfWeek', xsmnResultController.apiLimiter, xsmnResultController.getResultsByDayOfWeek);

module.exports = router;













