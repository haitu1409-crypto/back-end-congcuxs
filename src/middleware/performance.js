/**
 * Performance Middleware
 * Các middleware để tối ưu hóa performance
 */

const compression = require('compression');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cacheManager = require('../utils/cache');

/**
 * Compression middleware
 */
const compressionMiddleware = compression({
    filter: (req, res) => {
        // Không compress nếu request không muốn
        if (req.headers['x-no-compression']) {
            return false;
        }
        // Sử dụng compression filter mặc định
        return compression.filter(req, res);
    },
    level: 6, // Mức nén trung bình (1-9)
    threshold: 1024, // Chỉ nén file > 1KB
});

/**
 * Security middleware
 */
const securityMiddleware = helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", "data:", "https:"],
        },
    },
    crossOriginEmbedderPolicy: false,
});

/**
 * Rate limiting middleware
 */
const rateLimitMiddleware = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 phút
    max: 100, // Tối đa 100 requests per window
    message: {
        success: false,
        message: 'Quá nhiều requests, vui lòng thử lại sau.'
    },
    standardHeaders: true,
    legacyHeaders: false,
    // Skip successful requests
    skipSuccessfulRequests: false,
    // Skip failed requests
    skipFailedRequests: true,
});

/**
 * API Rate limiting - nghiêm ngặt hơn
 */
const apiRateLimitMiddleware = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 phút
    max: 30, // Tối đa 30 requests per minute
    message: {
        success: false,
        message: 'API rate limit exceeded. Vui lòng thử lại sau.'
    },
    standardHeaders: true,
    legacyHeaders: false,
});

/**
 * Response time middleware
 */
const responseTimeMiddleware = (req, res, next) => {
    const startTime = Date.now();

    res.on('finish', () => {
        const duration = Date.now() - startTime;
        res.setHeader('X-Response-Time', `${duration}ms`);

        // Log slow requests
        if (duration > 1000) {
            console.warn(`Slow request: ${req.method} ${req.originalUrl} - ${duration}ms`);
        }
    });

    next();
};

/**
 * Request logging middleware
 */
const requestLoggingMiddleware = (req, res, next) => {
    const startTime = new Date();

    // Log request
    console.log(`${startTime.toISOString()} - ${req.method} ${req.originalUrl} - IP: ${req.ip}`);

    // Log response
    res.on('finish', () => {
        const duration = Date.now() - startTime.getTime();
        console.log(`${new Date().toISOString()} - ${req.method} ${req.originalUrl} - ${res.statusCode} - ${duration}ms`);
    });

    next();
};

/**
 * Error handling middleware
 */
const errorHandlingMiddleware = (err, req, res, next) => {
    console.error('Error:', err);

    // Mongoose validation error
    if (err.name === 'ValidationError') {
        return res.status(400).json({
            success: false,
            message: 'Dữ liệu không hợp lệ',
            errors: Object.values(err.errors).map(e => e.message)
        });
    }

    // Mongoose cast error
    if (err.name === 'CastError') {
        return res.status(400).json({
            success: false,
            message: 'ID không hợp lệ'
        });
    }

    // MongoDB duplicate key error
    if (err.code === 11000) {
        return res.status(409).json({
            success: false,
            message: 'Dữ liệu đã tồn tại'
        });
    }

    // Default error
    res.status(500).json({
        success: false,
        message: process.env.NODE_ENV === 'production'
            ? 'Lỗi server nội bộ'
            : err.message
    });
};

/**
 * Cache stats middleware - để debug
 */
const cacheStatsMiddleware = (req, res, next) => {
    if (req.query.cache_stats === 'true') {
        return res.json({
            success: true,
            data: cacheManager.getStats()
        });
    }
    next();
};

/**
 * Health check middleware
 */
const healthCheckMiddleware = (req, res, next) => {
    if (req.path === '/health') {
        return res.json({
            success: true,
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            cache: cacheManager.getStats()
        });
    }
    next();
};

module.exports = {
    compressionMiddleware,
    securityMiddleware,
    rateLimitMiddleware,
    apiRateLimitMiddleware,
    responseTimeMiddleware,
    requestLoggingMiddleware,
    errorHandlingMiddleware,
    cacheStatsMiddleware,
    healthCheckMiddleware
};
