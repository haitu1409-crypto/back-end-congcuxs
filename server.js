/**
 * Server Entry Point
 * Khởi tạo Express server với các middleware bảo mật và tối ưu hiệu suất
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const danDeRoutes = require('./src/routes/dande.routes');
const articleRoutes = require('./src/routes/article.routes');
const predictionRoutes = require('./src/routes/prediction.routes');
const uploadRoutes = require('./src/routes/upload.routes');
const xsmbScraperRoutes = require('./src/routes/xsmbScraper.routes');
const xsmnScraperRoutes = require('./src/routes/xsmnScraper.routes');
const xsmnResultRoutes = require('./src/routes/xsmnResult.routes');
const resultMBRoutes = require('./src/routes/resultMB.routes');
const statsUpdateRoutes = require('./src/routes/statsUpdate.routes');
const positionSoiCauRoutes = require('./src/routes/positionSoiCau.routes');
const positionSoiCauLotoRoutes = require('./src/routes/positionSoiCauLoto.routes');
const soiCauBacCauRoutes = require('./src/routes/soiCauBacCau.routes');
const bayesianRoutes = require('./src/routes/bayesian.routes');
const advancedGapAnalysisRoutes = require('./src/routes/advancedGapAnalysis.routes');
const soicauPageRoutes = require('./src/routes/soicauPage.routes');
const ultraAdvancedSoiCauRoutes = require('./src/routes/ultraAdvancedSoiCau.routes');
const authRoutes = require('./src/routes/auth.routes');
const chatRoutes = require('./src/routes/chat.routes');
const adminRoutes = require('./src/routes/admin.routes');

const database = require('./src/config/database');
const xsmbScheduler = require('./src/services/xsmbScheduler.service');
const xsmnScheduler = require('./src/services/xsmnScheduler.service');
const statsScheduler = require('./src/services/statsScheduler.service');
// Keep-alive middleware removed for Pro version

const app = express();
const PORT = process.env.PORT || 5000;

app.set('trust proxy', 1);
// Security middleware
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// CORS configuration
const allowedOrigins = process.env.FRONTEND_URL
    ? process.env.FRONTEND_URL.split(',').map(origin => origin.trim())
    : [
        'https://www.ketquamn.com',
        'https://ketquamn.com',
        'http://localhost:3000',
        'https://taodandewukong.pro',
        'https://www.taodandewukong.pro',
        'http://localhost:3003',
        'http://localhost:3004'
    ];

// Normalize origins (remove trailing slashes and ensure consistent format)
const normalizeOrigin = (origin) => {
    if (!origin) return null;
    return origin.replace(/\/+$/, '').toLowerCase();
};

const normalizedAllowedOrigins = allowedOrigins.map(normalizeOrigin).filter(Boolean);

// Add wildcard support for development
if (process.env.NODE_ENV === 'development' || !process.env.NODE_ENV) {
    allowedOrigins.push('*');
}

console.log('🌐 Allowed CORS Origins:', allowedOrigins);
console.log('🌐 Normalized Allowed Origins:', normalizedAllowedOrigins);

app.use(cors({
    origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);

        const normalizedOrigin = normalizeOrigin(origin);
        console.log('🔍 Request Origin:', origin);
        console.log('🔍 Normalized Origin:', normalizedOrigin);
        console.log('✅ Checking against allowed origins:', normalizedAllowedOrigins);
        console.log('🔧 Environment:', process.env.NODE_ENV);

        // Check exact match or wildcard
        if (normalizedAllowedOrigins.includes('*') || normalizedAllowedOrigins.includes(normalizedOrigin)) {
            console.log('✅ CORS allowed for (exact match):', origin);
            return callback(null, true);
        }

        // Also check original allowedOrigins for backward compatibility
        if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
            console.log('✅ CORS allowed for (original list):', origin);
            return callback(null, true);
        }

        // Check for subdomain matches (e.g., www.ketquamn.com matches ketquamn.com)
        // Also allow cross-subdomain requests (e.g., www.ketquamn.com can call api1.ketquamn.com)
        const isSubdomainMatch = normalizedAllowedOrigins.some(allowedOrigin => {
            if (!allowedOrigin || allowedOrigin === '*') return false;

            const domain = allowedOrigin.replace(/^https?:\/\//, '');
            const requestDomain = normalizedOrigin.replace(/^https?:\/\//, '');

            // Exact match
            if (requestDomain === domain) {
                console.log('✅ Exact domain match:', requestDomain, '===', domain);
                return true;
            }

            // Extract root domain (last 2 parts: e.g., "ketquamn.com")
            const requestParts = requestDomain.split('.');
            const domainParts = domain.split('.');

            if (requestParts.length >= 2 && domainParts.length >= 2) {
                const requestRoot = requestParts.slice(-2).join('.');
                const domainRoot = domainParts.slice(-2).join('.');

                // Allow if same root domain (e.g., both end with .ketquamn.com)
                // This allows www.ketquamn.com, api1.ketquamn.com, etc. to work together
                if (requestRoot === domainRoot) {
                    console.log('✅ Same root domain match:', requestRoot, '===', domainRoot);
                    console.log('   Request domain:', requestDomain);
                    console.log('   Allowed domain:', domain);
                    return true;
                }
            }

            // Subdomain match (e.g., www.ketquamn.com matches ketquamn.com)
            if (requestDomain.endsWith('.' + domain)) {
                console.log('✅ Subdomain match (request ends with domain):', requestDomain, 'ends with', domain);
                return true;
            }

            // Reverse subdomain match (e.g., ketquamn.com matches www.ketquamn.com)
            if (domain.endsWith('.' + requestDomain)) {
                console.log('✅ Reverse subdomain match (domain ends with request):', domain, 'ends with', requestDomain);
                return true;
            }

            return false;
        });

        if (isSubdomainMatch) {
            console.log('✅ CORS allowed for subdomain:', origin);
            return callback(null, true);
        }

        console.log('❌ CORS blocked for:', origin);
        console.log('🔍 Debug - Normalized origin:', normalizedOrigin);
        console.log('🔍 Debug - Request domain parts:', normalizedOrigin.replace(/^https?:\/\//, '').split('.'));
        console.log('🔍 Debug - Allowed origins domain parts:', normalizedAllowedOrigins.map(o => o.replace(/^https?:\/\//, '').split('.')));
        return callback(new Error(`Not allowed by CORS: ${origin}`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
    allowedHeaders: [
        'Content-Type',
        'Authorization',
        'X-Requested-With',
        'Accept',
        'Origin',
        'Cache-Control',
        'X-Requested-With',
        'Access-Control-Request-Method',
        'Access-Control-Request-Headers',
        'x-user-id'
    ],
    exposedHeaders: ['Content-Range', 'X-Content-Range'],
    preflightContinue: false,
    optionsSuccessStatus: 204,
    maxAge: 86400 // Cache preflight for 24 hours
}));

// Additional CORS headers for preflight requests - Handle before other middleware
app.options('*', (req, res) => {
    const origin = req.headers.origin;
    const normalizedOrigin = normalizeOrigin(origin);

    // Check if origin is allowed
    const isAllowed = !origin ||
        normalizedAllowedOrigins.includes('*') ||
        normalizedAllowedOrigins.includes(normalizedOrigin) ||
        allowedOrigins.includes('*') ||
        allowedOrigins.includes(origin);

    if (isAllowed && origin) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
    } else if (isAllowed) {
        res.setHeader('Access-Control-Allow-Origin', '*');
    }

    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin, Cache-Control, Access-Control-Request-Method, Access-Control-Request-Headers, x-user-id');
    res.setHeader('Access-Control-Max-Age', '86400');

    console.log('🔄 OPTIONS preflight request from:', origin, isAllowed ? '✅ ALLOWED' : '❌ BLOCKED');

    res.status(204).end();
});

// Manual CORS headers for all responses (backup)
app.use((req, res, next) => {
    const origin = req.headers.origin;
    const normalizedOrigin = normalizeOrigin(origin);

    // Check if origin is allowed (same logic as CORS middleware)
    const isAllowedOrigin = normalizedAllowedOrigins.includes('*') ||
        normalizedAllowedOrigins.includes(normalizedOrigin) ||
        allowedOrigins.includes('*') ||
        allowedOrigins.includes(origin) ||
        (normalizedOrigin && normalizedAllowedOrigins.some(allowedOrigin => {
            if (!allowedOrigin || allowedOrigin === '*') return false;

            const domain = allowedOrigin.replace(/^https?:\/\//, '');
            const requestDomain = normalizedOrigin.replace(/^https?:\/\//, '');

            // Exact match
            if (requestDomain === domain) return true;

            // Extract root domain (last 2 parts)
            const requestParts = requestDomain.split('.');
            const domainParts = domain.split('.');

            if (requestParts.length >= 2 && domainParts.length >= 2) {
                const requestRoot = requestParts.slice(-2).join('.');
                const domainRoot = domainParts.slice(-2).join('.');
                // Allow if same root domain
                if (requestRoot === domainRoot) return true;
            }

            // Subdomain match
            if (requestDomain.endsWith('.' + domain)) return true;

            // Reverse subdomain match
            if (domain.endsWith('.' + requestDomain)) return true;

            return false;
        }));

    if (isAllowedOrigin && origin) {
        res.header('Access-Control-Allow-Origin', origin);
    } else if (allowedOrigins.includes('*')) {
        res.header('Access-Control-Allow-Origin', '*');
    }

    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin, Cache-Control, Access-Control-Request-Method, Access-Control-Request-Headers, x-user-id');
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Max-Age', '86400'); // Cache preflight for 24 hours

    // Handle preflight requests
    if (req.method === 'OPTIONS') {
        console.log('🔄 Handling OPTIONS preflight request from:', origin);
        res.status(204).end();
        return;
    }

    next();
});

// Compression middleware để giảm kích thước response
// ✅ Performance: Use optimal compression level
app.use(compression({
    level: 6, // Balance between compression and CPU usage
    filter: (req, res) => {
        // Don't compress if client doesn't support it
        if (req.headers['x-no-compression']) {
            return false;
        }
        // Use compression for all other requests
        return compression.filter(req, res);
    }
}));

// Keep-alive middleware removed for Pro version

// Body parser middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging middleware
if (process.env.NODE_ENV === 'development') {
    app.use(morgan('dev'));
} else {
    app.use(morgan('combined'));
}

// Rate limiting để bảo vệ API - Tối ưu cho development và production
const isDevelopment = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;

const limiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || (isDevelopment ? 5000 : 2000), // 5000 cho dev, 2000 cho prod
    message: {
        error: 'Too Many Requests',
        message: 'Quá nhiều requests từ IP này, vui lòng thử lại sau.',
        retryAfter: Math.ceil(15 * 60 * 1000 / 1000) // seconds
    },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => {
        // Skip rate limiting for health checks
        return req.path === '/health' || req.path === '/healthz' || req.path === '/ping';
    }
    // onLimitReached deprecated in express-rate-limit v7 - removed
});

// Rate limiter riêng cho các API endpoints có thể bị gọi nhiều
const heavyApiLimiter = rateLimit({
    windowMs: 5 * 60 * 1000, // 5 minutes
    max: isDevelopment ? 1000 : 500, // Ít hơn cho các API nặng
    message: {
        error: 'Too Many Requests',
        message: 'API này đang được gọi quá nhiều, vui lòng thử lại sau.',
        retryAfter: Math.ceil(5 * 60 * 1000 / 1000)
    },
    standardHeaders: true,
    legacyHeaders: false
    // onLimitReached deprecated in express-rate-limit v7 - removed
});

// Rate limiter riêng cho Chat API - ULTRA HIGH LIMIT cho real-time
// Rate limit per user (not per IP) để tránh 429 khi nhiều users share IP
const chatApiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: isDevelopment ? 100000 : 100000, // ULTRA HIGH: 100000 cho production (tăng gấp đôi)
    message: {
        error: 'Too Many Requests',
        message: 'Quá nhiều requests chat, vui lòng thử lại sau.',
        retryAfter: Math.ceil(15 * 60 * 1000 / 1000)
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
        // Rate limit per user ID if authenticated, otherwise per IP
        // This prevents 429 when multiple users share same IP (NAT, proxy, etc.)
        return req.userId || req.ip || 'anonymous';
    },
    skip: (req) => {
        // Skip rate limiting for socket.io polling
        return req.path.includes('/socket.io/');
    }
});

// Rate limiter riêng cho mark as read - VERY HIGH (vì được gọi nhiều)
const markAsReadLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: isDevelopment ? 100000 : 100000, // Rất cao vì mark as read được gọi thường xuyên
    message: {
        error: 'Too Many Requests',
        message: 'Quá nhiều requests đánh dấu đã đọc, vui lòng thử lại sau.',
        retryAfter: Math.ceil(15 * 60 * 1000 / 1000)
    },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
        // Rate limit per user, not per IP (for mark as read)
        return req.userId || req.ip;
    }
});

// Áp dụng rate limiting cho tất cả API routes
app.use('/api/', limiter);

// Áp dụng rate limiting cho Chat API (cao hơn vì real-time)
app.use('/api/chat/', chatApiLimiter);
app.use('/api/admin/', chatApiLimiter);

// Áp dụng rate limiting nặng hơn cho các API cụ thể
app.use('/api/soicau-page/', heavyApiLimiter);

// Health check endpoint for UptimeRobot monitoring
// Endpoint này phải response nhanh để Render không kill service
app.get('/health', (req, res) => {
    // Response ngay lập tức, không chờ bất kỳ thứ gì
    res.status(200).json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// Alternative health check endpoint for external monitoring
app.get('/healthz', (req, res) => {
    res.status(200).json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: Math.floor(process.uptime()),
        service: 'dande-api'
    });
});

// Keep-alive endpoint to prevent cold start
app.get('/ping', (req, res) => {
    res.status(200).json({
        message: 'pong',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// Keep-alive endpoint removed for Pro version

// Utility function to format uptime
function formatUptime(seconds) {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    return `${days}d ${hours}h ${minutes}m ${secs}s`;
}

// Debug endpoint to test database connection
app.get('/debug/db', async (req, res) => {
    try {
        const database = require('./src/config/database');
        const status = database.getConnectionStatus();
        const ping = await database.ping();

        res.status(200).json({
            success: true,
            database: {
                status: status,
                ping: ping,
                connected: status.state === 'connected'
            }
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            error: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

// Root endpoint for Render health check
app.get('/', (req, res) => {
    res.status(200).json({
        message: 'Dàn Đề API is running',
        timestamp: new Date().toISOString(),
        status: 'OK'
    });
});

// API routes
app.use('/api/dande', danDeRoutes);
app.use('/api/articles', articleRoutes);
app.use('/api/predictions', predictionRoutes);
app.use('/api/xsmb', xsmbScraperRoutes);
app.use('/api/xsmn', xsmnScraperRoutes);
app.use('/api/xsmn-result', xsmnResultRoutes);
app.use('/api/kqxs', resultMBRoutes);
app.use('/api/kqxs', statsUpdateRoutes);
app.use('/api/position-soicau', positionSoiCauRoutes);
app.use('/api/position-soicau-loto', positionSoiCauLotoRoutes);
app.use('/api/soicau-bac-cau', soiCauBacCauRoutes);
app.use('/api/bayesian', bayesianRoutes);
app.use('/api/soicau-page', soicauPageRoutes);
app.use('/api/advanced-gap-analysis', advancedGapAnalysisRoutes);
app.use('/api/ultra-advanced-soicau', ultraAdvancedSoiCauRoutes);
app.use('/api', uploadRoutes);

// Auth routes
app.use('/api/auth', authRoutes);

// Chat routes
app.use('/api/chat', chatRoutes);

// Admin routes
app.use('/api/admin', adminRoutes);

// Serve static files from uploads directory with CORS headers
app.use('/uploads', (req, res, next) => {
    // Set CORS headers for static files
    const origin = req.headers.origin;
    const normalizedOrigin = normalizeOrigin(origin);

    if (!origin) {
        // Allow requests with no origin (direct access)
        res.setHeader('Access-Control-Allow-Origin', '*');
    } else if (normalizedAllowedOrigins.includes('*') ||
        normalizedAllowedOrigins.includes(normalizedOrigin) ||
        allowedOrigins.includes('*') ||
        allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    next();
}, express.static('uploads', {
    setHeaders: (res, path) => {
        // Set cache headers for images
        if (path.endsWith('.png') || path.endsWith('.jpg') || path.endsWith('.jpeg') ||
            path.endsWith('.gif') || path.endsWith('.webp')) {
            res.setHeader('Cache-Control', 'public, max-age=3600');
        }
    }
}));

// 404 handler
app.use('*', (req, res) => {
    res.status(404).json({
        success: false,
        message: 'Endpoint không tồn tại',
        path: req.originalUrl
    });
});

// Global error handler
app.use((err, req, res, next) => {
    console.error('Error:', err);

    res.status(err.status || 500).json({
        success: false,
        message: err.message || 'Lỗi server nội bộ',
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
});

// Start server
const startServer = async () => {
    try {
        console.log('🔄 Đang khởi động server...');

        // Khởi động server NGAY LẬP TỨC (không chờ bất cứ thứ gì)
        // Điều này đảm bảo health check có thể response ngay
        const server = app.listen(PORT, '0.0.0.0', () => {
            console.log(`🚀 Server đang chạy trên port ${PORT}`);
            console.log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
            console.log(`🌐 Frontend URL: ${process.env.FRONTEND_URL || 'Not set'}`);
            console.log(`✅ Health check available at: http://localhost:${PORT}/health`);
            console.log(`✅ Root endpoint available at: http://localhost:${PORT}/`);
            console.log('✅ Server ready to accept requests');
        });

        // Đảm bảo server không bị block bởi bất kỳ thứ gì
        server.timeout = 120000; // 2 minutes timeout
        server.keepAliveTimeout = 65000;
        server.headersTimeout = 66000;

        // Initialize Socket.io ngay lập tức (không block server start)
        const { initializeSocket } = require('./src/services/socket.service');
        initializeSocket(server, null); // Pass null initially, Redis sẽ connect sau
        console.log('✅ Socket.io initialized for real-time chat');

        // Connect Redis trong background (không block server start)
        let redisClient = null;
        let redisErrorLogged = false;
        const connectRedisInBackground = async () => {
            try {
                if (process.env.REDIS_URL) {
                    const redis = require('redis');
                    redisClient = redis.createClient({
                        url: process.env.REDIS_URL,
                        socket: {
                            reconnectStrategy: (retries) => {
                                if (retries > 3) {
                                    return false;
                                }
                                return retries * 100;
                            },
                            connectTimeout: 2000 // Giảm timeout xuống 2 giây
                        }
                    });

                    redisClient.on('error', (err) => {
                        if (!redisErrorLogged) {
                            console.warn('⚠️ Redis connection error:', err.message);
                            console.log('🔄 Continuing without Redis cache...');
                            redisErrorLogged = true;
                        }
                    });

                    redisClient.on('connect', () => {
                        console.log('✅ Redis connected for caching');
                        redisErrorLogged = false;
                    });

                    // Try to connect với timeout ngắn hơn
                    await Promise.race([
                        redisClient.connect(),
                        new Promise((resolve) => setTimeout(() => {
                            console.log('⚠️ Redis connection timeout, continuing without cache');
                            resolve();
                        }, 2000)) // 2 giây timeout thay vì 3
                    ]);
                }
            } catch (error) {
                if (!redisErrorLogged) {
                    console.warn('⚠️ Redis setup failed:', error.message);
                    console.log('🔄 Continuing without Redis cache...');
                    redisErrorLogged = true;
                }
            }
        };

        // Connect Redis trong background sau khi server đã start
        setTimeout(() => {
            connectRedisInBackground();
        }, 1000);

        // Kết nối MongoDB trong background (không block server start)
        const connectMongoDBInBackground = async () => {
            try {
                console.log('🔄 Đang kết nối MongoDB trong background...');

                const connectWithTimeout = async () => {
                    const timeout = new Promise((_, reject) => {
                        setTimeout(() => reject(new Error('MongoDB connection timeout')), 15000);
                    });

                    const connect = database.connect();
                    return Promise.race([connect, timeout]);
                };

                await connectWithTimeout();
                console.log('✅ Kết nối MongoDB thành công');

            } catch (error) {
                console.warn('⚠️ MongoDB connection failed:', error.message);
                console.log('🔄 Server vẫn hoạt động bình thường, sẽ thử kết nối lại...');

                // Retry connection after 30 seconds
                setTimeout(connectMongoDBInBackground, 30000);
            }
        };

        // Start MongoDB connection in background
        connectMongoDBInBackground();

        // Initialize XSMB Scheduler
        xsmbScheduler.init();
        // Initialize XSMN Scheduler
        xsmnScheduler.init();
        // Khởi động stats scheduler để tự động cập nhật thống kê
        statsScheduler.init();

        // Graceful shutdown
        process.on('SIGTERM', async () => {
            console.log('SIGTERM signal received: closing HTTP server');
            xsmbScheduler.stop();
            xsmnScheduler.stop();
            statsScheduler.stop();
            server.close(async () => {
                console.log('HTTP server closed');
                await database.disconnect();
                process.exit(0);
            });
        });

        process.on('SIGINT', async () => {
            console.log('SIGINT signal received: closing HTTP server');
            xsmbScheduler.stop();
            xsmnScheduler.stop();
            server.close(async () => {
                console.log('HTTP server closed');
                await database.disconnect();
                process.exit(0);
            });
        });

        // Handle uncaught exceptions - Don't exit in development
        process.on('uncaughtException', (error) => {
            console.error('❌ Uncaught Exception:', error);
            if (process.env.NODE_ENV === 'production') {
                process.exit(1);
            } else {
                console.log('🔄 Continuing in development mode...');
            }
        });

        process.on('unhandledRejection', (reason, promise) => {
            console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
            if (process.env.NODE_ENV === 'production') {
                process.exit(1);
            } else {
                console.log('🔄 Continuing in development mode...');
            }
        });

    } catch (error) {
        console.error('❌ Không thể khởi động server:', error);
        console.error('Stack trace:', error.stack);
        process.exit(1);
    }
};

startServer();

