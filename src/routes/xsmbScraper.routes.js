const express = require('express');
const xsmbScraperController = require('../controllers/xsmbScraper.controller');

const router = express.Router();

/**
 * @route   POST /api/xsmb/scrape/today
 * @desc    Cào dữ liệu XSMB cho ngày hiện tại
 * @access  Public
 */
router.post('/scrape/today', xsmbScraperController.scrapeToday);

/**
 * @route   POST /api/xsmb/scrape/date/:date
 * @desc    Cào dữ liệu XSMB cho ngày cụ thể (format: DD/MM/YYYY)
 * @access  Public
 */
router.post('/scrape/date/:date', xsmbScraperController.scrapeSpecificDate);

/**
 * @route   GET /api/xsmb/results
 * @desc    Lấy danh sách kết quả XSMB với phân trang và filter
 * @access  Public
 * @query   page, limit, date, sortBy, sortOrder
 */
router.get('/results', xsmbScraperController.getResults);

/**
 * @route   GET /api/xsmb/results/date/:date
 * @desc    Lấy kết quả XSMB theo ngày (format: YYYY-MM-DD)
 * @access  Public
 */
router.get('/results/date/:date', xsmbScraperController.getResultByDate);

/**
 * @route   GET /api/xsmb/results/latest
 * @desc    Lấy kết quả XSMB mới nhất
 * @access  Public
 */
router.get('/results/latest', xsmbScraperController.getLatestResult);

/**
 * @route   GET /api/xsmb/results/latest10
 * @desc    Lấy 10 kết quả XSMB mới nhất
 * @access  Public
 * @query   limit (optional, default: 10)
 */
router.get('/results/latest10', xsmbScraperController.getLatest10Results);

/**
 * @route   GET /api/xsmb/status
 * @desc    Kiểm tra trạng thái scraper
 * @access  Public
 */
router.get('/status', xsmbScraperController.getScraperStatus);

/**
 * @route   DELETE /api/xsmb/results/date/:date
 * @desc    Xóa kết quả XSMB theo ngày (format: YYYY-MM-DD)
 * @access  Public
 */
router.delete('/results/date/:date', xsmbScraperController.deleteResultByDate);

/**
 * @route   GET /api/xsmb/statistics
 * @desc    Lấy thống kê dữ liệu XSMB
 * @access  Public
 * @query   startDate, endDate
 */
router.get('/statistics', xsmbScraperController.getStatistics);

module.exports = router;
