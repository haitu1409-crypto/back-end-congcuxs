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
const thongKeImageRoutes = require('./src/routes/thongKeImage.routes');
const initTelegramBot = require('./src/services/telegramBot.service');

const database = require('./src/config/database');
const xsmbScheduler = require('./src/services/xsmbScheduler.service');
const thongKeNhanhScheduler = require('./src/services/thongKeNhanhScheduler.service');
// Keep-alive middleware removed for Pro version

const app = express();
const PORT = process.env.PORT || 5000;

// Security middleware
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// CORS configuration
const defaultOrigins = [
    'https://www.taodandewukong.pro',
    'https://taodandewukong.pro',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://localhost:3002',
    'http://localhost:3003',
    'http://localhost:3004'
];

let allowedOrigins = process.env.FRONTEND_URL
    ? process.env.FRONTEND_URL.split(',').map(origin => origin.trim())
    : defaultOrigins;

// Đảm bảo luôn có cả www và non-www cho taodandewukong.pro
const ensureTaodandewukongOrigins = (origins) => {
    const hasWww = origins.some(o => o.includes('www.taodandewukong.pro'));
    const hasNonWww = origins.some(o => o.includes('taodandewukong.pro') && !o.includes('www.'));

    const result = [...origins];

    if (!hasWww && origins.some(o => o.includes('taodandewukong.pro'))) {
        result.push('https://www.taodandewukong.pro');
        console.log('🔧 Added www.taodandewukong.pro to allowed origins');
    }

    if (!hasNonWww && origins.some(o => o.includes('www.taodandewukong.pro'))) {
        result.push('https://taodandewukong.pro');
        console.log('🔧 Added taodandewukong.pro (non-www) to allowed origins');
    }

    return result;
};

allowedOrigins = ensureTaodandewukongOrigins(allowedOrigins);

// Add wildcard support for development
if (process.env.NODE_ENV === 'development' || !process.env.NODE_ENV) {
    allowedOrigins.push('*');
}

console.log('🌐 Allowed CORS Origins:', allowedOrigins);

app.use(cors({
    origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);

        console.log('🔍 Request Origin:', origin);
        console.log('✅ Checking against allowed origins:', allowedOrigins);
        console.log('🔧 Environment:', process.env.NODE_ENV);

        // Check exact match or wildcard
        if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
            console.log('✅ CORS allowed for:', origin);
            return callback(null, true);
        }

        // Check for subdomain matches (e.g., www.taodandewukong.pro matches taodandewukong.pro)
        const isSubdomainMatch = allowedOrigins.some(allowedOrigin => {
            if (allowedOrigin.includes('.')) {
                const domain = allowedOrigin.replace(/^https?:\/\//, '').toLowerCase();
                const requestDomain = origin.replace(/^https?:\/\//, '').toLowerCase();

                // Exact match
                if (requestDomain === domain) {
                    console.log('✅ Exact domain match:', requestDomain, '===', domain);
                    return true;
                }

                // Subdomain match (e.g., www.taodandewukong.pro matches taodandewukong.pro)
                if (requestDomain.endsWith('.' + domain)) {
                    console.log('✅ Subdomain match (request is subdomain of allowed):', requestDomain, 'ends with', '.' + domain);
                    return true;
                }

                // Reverse subdomain match (e.g., taodandewukong.pro matches www.taodandewukong.pro)
                if (domain.endsWith('.' + requestDomain)) {
                    console.log('✅ Reverse subdomain match (allowed is subdomain of request):', domain, 'ends with', '.' + requestDomain);
                    return true;
                }

                // Check if both are subdomains of the same root domain
                const requestParts = requestDomain.split('.');
                const domainParts = domain.split('.');

                if (requestParts.length >= 2 && domainParts.length >= 2) {
                    const requestRoot = requestParts.slice(-2).join('.');
                    const domainRoot = domainParts.slice(-2).join('.');
                    if (requestRoot === domainRoot) {
                        console.log('✅ Same root domain match:', requestRoot, '===', domainRoot);
                        return true;
                    }
                }
            }
            return false;
        });

        if (isSubdomainMatch) {
            console.log('✅ CORS allowed for subdomain:', origin);
            return callback(null, true);
        }

        console.log('❌ CORS blocked for:', origin);
        console.log('🔍 Debug - Request domain parts:', origin.replace(/^https?:\/\//, '').split('.'));
        console.log('🔍 Debug - Allowed origins domain parts:', allowedOrigins.map(o => o.replace(/^https?:\/\//, '').split('.')));
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

// Additional CORS headers for preflight requests
app.options('*', cors());

// Manual CORS headers for all responses (backup)
app.use((req, res, next) => {
    const origin = req.headers.origin;

    // Check if origin is allowed (same logic as CORS middleware)
    const isAllowedOrigin = allowedOrigins.includes('*') ||
        allowedOrigins.includes(origin) ||
        (origin && allowedOrigins.some(allowedOrigin => {
            if (allowedOrigin.includes('.')) {
                const domain = allowedOrigin.replace(/^https?:\/\//, '').toLowerCase();
                const requestDomain = origin.replace(/^https?:\/\//, '').toLowerCase();

                // Exact match
                if (requestDomain === domain) return true;

                // Subdomain match (e.g., www.taodandewukong.pro matches taodandewukong.pro)
                if (requestDomain.endsWith('.' + domain)) return true;

                // Reverse subdomain match (e.g., taodandewukong.pro matches www.taodandewukong.pro)
                if (domain.endsWith('.' + requestDomain)) return true;

                // Check if both are subdomains of the same root domain
                const requestParts = requestDomain.split('.');
                const domainParts = domain.split('.');

                if (requestParts.length >= 2 && domainParts.length >= 2) {
                    const requestRoot = requestParts.slice(-2).join('.');
                    const domainRoot = domainParts.slice(-2).join('.');
                    return requestRoot === domainRoot;
                }
            }
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
app.use(compression());

// Keep-alive middleware removed for Pro version

// Body parser middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

const telegramBot = initTelegramBot();
if (telegramBot) {
    const webhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET || 'telegram-webhook';
    const webhookPath = '/telegram/' + webhookSecret;
    const publicWebhookUrl = process.env.TELEGRAM_WEBHOOK_URL;

    if (publicWebhookUrl) {
        console.log('[TelegramBot] Using webhook at ' + publicWebhookUrl + webhookPath);
        app.use(webhookPath, telegramBot.webhookCallback(webhookPath));

        telegramBot.telegram.setWebhook(publicWebhookUrl + webhookPath)
            .then(() => console.log('[TelegramBot] Webhook registered successfully'))
            .catch(error => console.error('[TelegramBot] Failed to set webhook:', error.message));
    } else {
        telegramBot.launch()
            .then(() => console.log('[TelegramBot] Running in long-polling mode'))
            .catch(error => console.error('[TelegramBot] Unable to start long-polling:', error.message));

        process.once('SIGINT', () => telegramBot.stop('SIGINT'));
        process.once('SIGTERM', () => telegramBot.stop('SIGTERM'));
    }
} else {
    console.warn('[TelegramBot] Bot disabled (missing TELEGRAM_BOT_TOKEN).');
}


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
app.get('/health', (req, res) => {
    const startTime = Date.now();

    res.status(200).json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || 'development',
        memory: process.memoryUsage(),
        version: process.version,
        responseTime: `${Date.now() - startTime}ms`,
        pid: process.pid,
        uptimeFormatted: formatUptime(process.uptime())
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
app.use('/api', thongKeImageRoutes);

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
    if (!origin) {
        // Allow requests with no origin (direct access)
        res.setHeader('Access-Control-Allow-Origin', '*');
    } else if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
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

        // Khởi động server ngay lập tức (không chờ MongoDB)
        const server = app.listen(PORT, '0.0.0.0', () => {
            console.log(`🚀 Server đang chạy trên port ${PORT}`);
            console.log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
            console.log(`🌐 Frontend URL: ${process.env.FRONTEND_URL || 'Not set'}`);
            console.log(`✅ Health check available at: http://localhost:${PORT}/health`);
            console.log(`✅ Root endpoint available at: http://localhost:${PORT}/`);
        });

        // Initialize Socket.io for real-time chat
        let redisClient = null;
        let redisErrorLogged = false; // Flag để tránh spam log
        try {
            // Try to connect Redis (optional)
            if (process.env.REDIS_URL) {
                const redis = require('redis');
                redisClient = redis.createClient({
                    url: process.env.REDIS_URL,
                    socket: {
                        reconnectStrategy: (retries) => {
                            // Disable auto-reconnect để tránh spam log
                            if (retries > 3) {
                                return false; // Stop reconnecting after 3 retries
                            }
                            return retries * 100; // Exponential backoff
                        }
                    }
                });

                // Only log error once
                redisClient.on('error', (err) => {
                    if (!redisErrorLogged) {
                        console.warn('⚠️ Redis connection error:', err.message);
                        console.log('🔄 Continuing without Redis cache...');
                        redisErrorLogged = true;
                    }
                });

                redisClient.on('connect', () => {
                    console.log('✅ Redis connected for caching');
                    redisErrorLogged = false; // Reset flag on successful connection
                });

                // Try to connect with timeout
                const connectPromise = redisClient.connect().catch((err) => {
                    if (!redisErrorLogged) {
                        console.log('⚠️ Redis not available, continuing without cache');
                        redisErrorLogged = true;
                    }
                });

                // Set timeout for connection attempt
                await Promise.race([
                    connectPromise,
                    new Promise((resolve) => setTimeout(resolve, 3000)) // 3 second timeout
                ]);
            }
        } catch (error) {
            if (!redisErrorLogged) {
                console.warn('⚠️ Redis setup failed:', error.message);
                console.log('🔄 Continuing without Redis cache...');
                redisErrorLogged = true;
            }
        }

        // Initialize Socket.io
        const { initializeSocket } = require('./src/services/socket.service');
        initializeSocket(server, redisClient);
        console.log('✅ Socket.io initialized for real-time chat');

        // Initialize Lottery Socket Service (namespace /lottery)
        // Service sẽ tự động khởi tạo sau 1 giây để đảm bảo socket.io đã sẵn sàng
        require('./src/services/lotterySocket.service');
        console.log('✅ Lottery Socket Service đang khởi tạo...');

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

        // Initialize schedulers
        xsmbScheduler.init();
        thongKeNhanhScheduler.init();

        // Graceful shutdown
        process.on('SIGTERM', async () => {
            console.log('SIGTERM signal received: closing HTTP server');
            xsmbScheduler.stop();
            thongKeNhanhScheduler.stop();
            server.close(async () => {
                console.log('HTTP server closed');
                await database.disconnect();
                process.exit(0);
            });
        });

        process.on('SIGINT', async () => {
            console.log('SIGINT signal received: closing HTTP server');
            xsmbScheduler.stop();
            thongKeNhanhScheduler.stop();
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

