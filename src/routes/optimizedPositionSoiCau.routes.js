/**
 * Optimized Position Soi Cau Routes
 * Routes tối ưu hóa với advanced rate limiting, monitoring và error handling
 */

const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const {
    getOptimizedPositionSoiCau,
    getOptimizedPositionSoiCauRange,
    getOptimizedPositionPatternStats,
    getPerformanceMetrics,
    healthCheck,
    monitorPerformance
} = require('../controllers/optimizedPositionSoiCau.controller');

// Advanced rate limiter với sliding window
const createAdvancedRateLimit = (windowMs, max, message, skipSuccessfulRequests = false) => {
    return rateLimit({
        windowMs,
        max,
        message: {
            error: message,
            success: false,
            retryAfter: Math.ceil(windowMs / 1000)
        },
        keyGenerator: (req) => {
            // Sử dụng user ID nếu có, fallback về IP
            return req.headers['x-user-id'] || req.ip;
        },
        skip: (req) => {
            // Skip rate limit cho development và health checks
            return process.env.NODE_ENV === 'development' ||
                req.path.includes('/health') ||
                req.path.includes('/metrics');
        },
        skipSuccessfulRequests,
        standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
        legacyHeaders: false, // Disable the `X-RateLimit-*` headers
        handler: (req, res) => {
            res.status(429).json({
                error: message,
                success: false,
                retryAfter: Math.ceil(windowMs / 1000),
                timestamp: new Date().toISOString()
            });
        }
    });
};

// Rate limiters với cấu hình khác nhau
const positionSoiCauLimiter = createAdvancedRateLimit(
    60 * 1000, // 1 phút
    100, // Tối đa 100 requests/phút
    'Quá nhiều yêu cầu soi cầu vị trí, vui lòng thử lại sau',
    false
);

const rangeLimiter = createAdvancedRateLimit(
    5 * 60 * 1000, // 5 phút
    20, // Tối đa 20 requests/5 phút
    'Quá nhiều yêu cầu phân tích khoảng thời gian, vui lòng thử lại sau',
    false
);

const statsLimiter = createAdvancedRateLimit(
    10 * 60 * 1000, // 10 phút
    30, // Tối đa 30 requests/10 phút
    'Quá nhiều yêu cầu thống kê, vui lòng thử lại sau',
    false
);

const metricsLimiter = createAdvancedRateLimit(
    60 * 1000, // 1 phút
    10, // Tối đa 10 requests/phút
    'Quá nhiều yêu cầu metrics, vui lòng thử lại sau',
    false
);

// Middleware để log requests
const requestLogger = (req, res, next) => {
    const startTime = Date.now();

    res.on('finish', () => {
        const duration = Date.now() - startTime;
        console.log(`📝 ${req.method} ${req.path} - ${res.statusCode} - ${duration}ms - ${req.ip}`);
    });

    next();
};

// Middleware để validate common parameters
const validateCommonParams = (req, res, next) => {
    const { date, days } = req.query;

    // Validate date format
    if (date && !/^\d{2}\/\d{2}\/\d{4}$/.test(date) && !/^\d{2}-\d{2}-\d{4}$/.test(date)) {
        return res.status(400).json({
            error: 'Định dạng ngày không hợp lệ. Vui lòng sử dụng DD/MM/YYYY hoặc DD-MM-YYYY.',
            success: false
        });
    }

    // Validate days parameter
    if (days && (isNaN(days) || parseInt(days) < 2 || parseInt(days) > 30)) {
        return res.status(400).json({
            error: 'Số ngày phải là số từ 2 đến 30.',
            success: false
        });
    }

    next();
};

/**
 * @route GET /api/optimized-position-soicau
 * @desc Optimized soi cầu dựa trên vị trí số
 * @query {string} date - Ngày phân tích (DD/MM/YYYY)
 * @query {number} days - Số ngày phân tích (2-30, default: 2)
 * @access Public
 */
router.get('/',
    requestLogger,
    monitorPerformance,
    validateCommonParams,
    positionSoiCauLimiter,
    async (req, res) => {
        await getOptimizedPositionSoiCau(req, res);
    }
);

/**
 * @route GET /api/optimized-position-soicau/range
 * @desc Optimized soi cầu vị trí trong khoảng thời gian
 * @query {string} startDate - Ngày bắt đầu (DD/MM/YYYY)
 * @query {string} endDate - Ngày kết thúc (DD/MM/YYYY)
 * @query {number} days - Số ngày phân tích (2-30)
 * @access Public
 */
router.get('/range',
    requestLogger,
    monitorPerformance,
    rangeLimiter,
    async (req, res) => {
        // Validate range parameters
        const { startDate, endDate, days } = req.query;

        if (!startDate || !endDate) {
            return res.status(400).json({
                error: 'Vui lòng cung cấp startDate và endDate',
                success: false
            });
        }

        if (!days || isNaN(days) || parseInt(days) < 2 || parseInt(days) > 30) {
            return res.status(400).json({
                error: 'Số ngày phải từ 2 đến 30',
                success: false
            });
        }

        await getOptimizedPositionSoiCauRange(req, res);
    }
);

/**
 * @route GET /api/optimized-position-soicau/stats
 * @desc Optimized thống kê pattern vị trí
 * @query {number} days - Số ngày thống kê (2-30, default: 7)
 * @access Public
 */
router.get('/stats',
    requestLogger,
    monitorPerformance,
    validateCommonParams,
    statsLimiter,
    async (req, res) => {
        await getOptimizedPositionPatternStats(req, res);
    }
);

/**
 * @route GET /api/optimized-position-soicau/metrics
 * @desc Performance metrics và monitoring
 * @access Public
 */
router.get('/metrics',
    requestLogger,
    metricsLimiter,
    async (req, res) => {
        await getPerformanceMetrics(req, res);
    }
);

/**
 * @route GET /api/optimized-position-soicau/health
 * @desc Health check endpoint với detailed status
 * @access Public
 */
router.get('/health',
    requestLogger,
    (req, res) => {
        healthCheck(req, res);
    }
);

/**
 * @route GET /api/optimized-position-soicau/cache/clear
 * @desc Clear cache endpoint (admin only)
 * @access Private
 */
router.get('/cache/clear',
    requestLogger,
    (req, res) => {
        // Simple admin check (trong production nên dùng proper authentication)
        const adminKey = req.headers['x-admin-key'];
        if (adminKey !== process.env.ADMIN_KEY && process.env.NODE_ENV === 'production') {
            return res.status(403).json({
                error: 'Unauthorized',
                success: false
            });
        }

        const advancedCache = require('../utils/advancedCache');
        advancedCache.clearAll();

        res.status(200).json({
            success: true,
            message: 'Cache cleared successfully',
            timestamp: new Date().toISOString()
        });
    }
);

/**
 * @route GET /api/optimized-position-soicau/cache/stats
 * @desc Cache statistics endpoint
 * @access Public
 */
router.get('/cache/stats',
    requestLogger,
    (req, res) => {
        const advancedCache = require('../utils/advancedCache');
        const stats = advancedCache.getStats();

        res.status(200).json({
            success: true,
            data: stats
        });
    }
);

// Error handling middleware
router.use((error, req, res, next) => {
    console.error('❌ Route error:', error);

    res.status(500).json({
        success: false,
        error: 'Internal server error',
        timestamp: new Date().toISOString()
    });
});

// 404 handler
router.use('*', (req, res) => {
    res.status(404).json({
        success: false,
        error: 'Endpoint not found',
        availableEndpoints: [
            'GET /api/optimized-position-soicau',
            'GET /api/optimized-position-soicau/range',
            'GET /api/optimized-position-soicau/stats',
            'GET /api/optimized-position-soicau/metrics',
            'GET /api/optimized-position-soicau/health',
            'GET /api/optimized-position-soicau/cache/stats'
        ],
        timestamp: new Date().toISOString()
    });
});

module.exports = router;
