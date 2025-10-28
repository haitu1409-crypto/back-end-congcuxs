/**
 * Performance Optimization Middleware
 * Tối ưu hóa hiệu suất cho API endpoints
 */

const compression = require('compression');
const rateLimit = require('express-rate-limit');
const NodeCache = require('node-cache');

// Cache configuration
const cache = new NodeCache({
    stdTTL: 300, // 5 minutes default
    checkperiod: 60, // Check for expired keys every minute
    useClones: false // Don't clone objects for better performance
});

// Rate limiting configurations
const createRateLimit = (windowMs, max, message) => rateLimit({
    windowMs,
    max,
    message: { error: message },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => {
        // Skip rate limiting for internal requests
        return req.ip === '127.0.0.1' || req.ip === '::1';
    }
});

// General API rate limiting
const generalLimiter = createRateLimit(
    15 * 60 * 1000, // 15 minutes
    100, // 100 requests per window
    'Quá nhiều yêu cầu từ IP này, vui lòng thử lại sau 15 phút'
);

// Lottery results specific rate limiting
const lotteryResultsLimiter = createRateLimit(
    1 * 60 * 1000, // 1 minute
    30, // 30 requests per minute
    'Quá nhiều yêu cầu kết quả xổ số, vui lòng thử lại sau 1 phút'
);

// Cache middleware
const cacheMiddleware = (ttl = 300) => {
    return (req, res, next) => {
        const key = `${req.originalUrl}_${JSON.stringify(req.query)}`;
        const cached = cache.get(key);

        if (cached) {
            res.set('X-Cache', 'HIT');
            return res.json(cached);
        }

        // Store original res.json
        const originalJson = res.json;
        res.json = function (data) {
            // Cache successful responses only
            if (res.statusCode === 200) {
                cache.set(key, data, ttl);
            }
            res.set('X-Cache', 'MISS');
            return originalJson.call(this, data);
        };

        next();
    };
};

// Database query optimization
const optimizeQuery = (query) => {
    return {
        ...query,
        lean: true, // Return plain objects instead of Mongoose documents
        limit: Math.min(query.limit || 50, 100), // Cap limit at 100
        sort: query.sort || { createdAt: -1 }
    };
};

// Response compression
const compressionConfig = compression({
    level: 6, // Balanced compression
    threshold: 1024, // Only compress responses > 1KB
    filter: (req, res) => {
        if (req.headers['x-no-compression']) {
            return false;
        }
        return compression.filter(req, res);
    }
});

// Memory usage monitoring
const memoryMonitor = (req, res, next) => {
    const memUsage = process.memoryUsage();
    const memUsageMB = {
        rss: Math.round(memUsage.rss / 1024 / 1024),
        heapTotal: Math.round(memUsage.heapTotal / 1024 / 1024),
        heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024),
        external: Math.round(memUsage.external / 1024 / 1024)
    };

    res.set('X-Memory-Usage', JSON.stringify(memUsageMB));
    next();
};

// Cache statistics
const getCacheStats = () => {
    const stats = cache.getStats();
    return {
        keys: stats.keys,
        hits: stats.hits,
        misses: stats.misses,
        hitRate: stats.hits / (stats.hits + stats.misses) * 100
    };
};

// Clear cache endpoint
const clearCache = (req, res) => {
    cache.flushAll();
    res.json({ message: 'Cache cleared successfully' });
};

module.exports = {
    cache,
    generalLimiter,
    lotteryResultsLimiter,
    cacheMiddleware,
    optimizeQuery,
    compressionConfig,
    memoryMonitor,
    getCacheStats,
    clearCache
};