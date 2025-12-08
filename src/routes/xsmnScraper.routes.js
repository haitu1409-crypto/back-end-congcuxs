const express = require('express');
const xsmnScraperController = require('../controllers/xsmnScraper.controller');

const router = express.Router();

/**
 * @route   POST /api/xsmn/scrape/today
 * @desc    Cào dữ liệu XSMN cho ngày hiện tại
 * @access  Public
 */
router.post('/scrape/today', xsmnScraperController.scrapeToday);

/**
 * @route   POST /api/xsmn/scrape/date/:date
 * @desc    Cào dữ liệu XSMN cho ngày cụ thể (format: DD/MM/YYYY)
 * @access  Public
 */
router.post('/scrape/date/:date', xsmnScraperController.scrapeSpecificDate);

/**
 * @route   GET /api/xsmn/initial
 * @desc    Lấy dữ liệu ban đầu (initial data) cho một tỉnh cụ thể từ MongoDB
 * @access  Public
 * @query   date (optional, format: DD-MM-YYYY), tinh (required)
 */
router.get('/initial', xsmnScraperController.getInitialData);

/**
 * @route   GET /api/xsmn/results
 * @desc    Lấy danh sách kết quả XSMN với phân trang và filter
 * @access  Public
 * @query   page, limit, date, tentinh, sortBy, sortOrder
 */
router.get('/results', xsmnScraperController.getResults);

/**
 * @route   GET /api/xsmn/results/date/:date
 * @desc    Lấy kết quả XSMN theo ngày - tất cả tỉnh (format: YYYY-MM-DD)
 * @access  Public
 */
router.get('/results/date/:date', xsmnScraperController.getResultByDate);

/**
 * @route   GET /api/xsmn/results/date/:date/province/:tentinh
 * @desc    Lấy kết quả XSMN theo ngày và tỉnh (format: YYYY-MM-DD)
 * @access  Public
 */
router.get('/results/date/:date/province/:tentinh', xsmnScraperController.getResultByDateAndProvince);

/**
 * @route   GET /api/xsmn/results/latest/province/:tentinh
 * @desc    Lấy kết quả XSMN mới nhất cho một tỉnh
 * @access  Public
 */
router.get('/results/latest/province/:tentinh', xsmnScraperController.getLatestResultByProvince);

/**
 * @route   GET /api/xsmn/results/latest10
 * @desc    Lấy 10 kết quả XSMN mới nhất
 * @access  Public
 * @query   limit (optional, default: 10), tentinh (optional)
 */
router.get('/results/latest10', xsmnScraperController.getLatest10Results);

/**
 * @route   GET /api/xsmn/status
 * @desc    Kiểm tra trạng thái scraper
 * @access  Public
 */
router.get('/status', xsmnScraperController.getScraperStatus);

/**
 * @route   DELETE /api/xsmn/results/date/:date/province/:tentinh
 * @desc    Xóa kết quả XSMN theo ngày và tỉnh (format: YYYY-MM-DD)
 * @access  Public
 */
router.delete('/results/date/:date/province/:tentinh', xsmnScraperController.deleteResultByDateAndProvince);

/**
 * @route   GET /api/xsmn/statistics
 * @desc    Lấy thống kê dữ liệu XSMN
 * @access  Public
 * @query   startDate, endDate, tentinh (optional)
 */
router.get('/statistics', xsmnScraperController.getStatistics);

module.exports = router;

