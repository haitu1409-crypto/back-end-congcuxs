/**
 * Optimized XSMB Routes
 * Routes tối ưu hóa cho API kết quả xổ số
 */

const express = require('express');
const router = express.Router();
const optimizedXSMBController = require('../controllers/optimizedXSMBController');
const {
    lotteryResultsLimiter,
    cacheMiddleware,
    generalLimiter
} = require('../middleware/performance');

// Apply rate limiting to all routes
router.use(generalLimiter);

/**
 * GET /api/xsmb/latest
 * Lấy kết quả mới nhất với caching 5 phút
 */
router.get('/latest',
    lotteryResultsLimiter,
    cacheMiddleware(300), // 5 minutes cache
    optimizedXSMBController.getLatestResults
);

/**
 * GET /api/xsmb/date/:date
 * Lấy kết quả theo ngày với caching 1 giờ
 */
router.get('/date/:date',
    lotteryResultsLimiter,
    cacheMiddleware(3600), // 1 hour cache for specific dates
    optimizedXSMBController.getResultsByDate
);

/**
 * GET /api/xsmb/range
 * Lấy kết quả trong khoảng thời gian với caching 30 phút
 */
router.get('/range',
    lotteryResultsLimiter,
    cacheMiddleware(1800), // 30 minutes cache
    optimizedXSMBController.getResultsByDateRange
);

/**
 * GET /api/xsmb/search
 * Tìm kiếm kết quả với caching 15 phút
 */
router.get('/search',
    lotteryResultsLimiter,
    cacheMiddleware(900), // 15 minutes cache
    optimizedXSMBController.searchResults
);

/**
 * GET /api/xsmb/stats
 * Lấy thống kê nhanh với caching 10 phút
 */
router.get('/stats',
    lotteryResultsLimiter,
    cacheMiddleware(600), // 10 minutes cache
    optimizedXSMBController.getQuickStats
);

module.exports = router;
