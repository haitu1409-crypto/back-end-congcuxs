/**
 * Simplified Server for Render Pro
 * No need for complex cold start prevention
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');

const danDeRoutes = require('./src/routes/dande.routes');
const thongKeRoutes = require('./src/routes/thongke.routes');
const articleRoutes = require('./src/routes/article.routes');
const uploadRoutes = require('./src/routes/upload.routes');
const database = require('./src/config/database');

const app = express();
const PORT = process.env.PORT || 5000;

// Security middleware
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
}));

// CORS configuration
const allowedOrigins = process.env.FRONTEND_URL
    ? process.env.FRONTEND_URL.split(',').map(origin => origin.trim())
    : [
        'https://www.taodandewukong.pro',
        'https://taodandewukong.pro',
        'http://localhost:3000',
        'http://localhost:3001',
        'http://localhost:3002',
        'http://localhost:3003',
        'http://localhost:3004'
    ];

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

        // Check exact match or wildcard
        if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
            console.log('✅ CORS allowed for:', origin);
            return callback(null, true);
        }

        // Check for subdomain matches
        const isSubdomainMatch = allowedOrigins.some(allowedOrigin => {
            if (allowedOrigin.includes('.')) {
                const domain = allowedOrigin.replace(/^https?:\/\//, '');
                const requestDomain = origin.replace(/^https?:\/\//, '');

                // Exact match
                if (requestDomain === domain) return true;

                // Subdomain match
                if (requestDomain.endsWith('.' + domain)) return true;

                // Reverse subdomain match
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
        });

        if (isSubdomainMatch) {
            console.log('✅ CORS allowed for subdomain:', origin);
            return callback(null, true);
        }

        console.log('❌ CORS blocked for:', origin);
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
        'Access-Control-Request-Headers'
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

    // Check if origin is allowed
    const isAllowedOrigin = allowedOrigins.includes('*') ||
        allowedOrigins.includes(origin) ||
        (origin && allowedOrigins.some(allowedOrigin => {
            if (allowedOrigin.includes('.')) {
                const domain = allowedOrigin.replace(/^https?:\/\//, '');
                const requestDomain = origin.replace(/^https?:\/\//, '');

                // Exact match
                if (requestDomain === domain) return true;

                // Subdomain match
                if (requestDomain.endsWith('.' + domain)) return true;

                // Reverse subdomain match
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
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin, Cache-Control, Access-Control-Request-Method, Access-Control-Request-Headers');
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

// Compression middleware
app.use(compression());

// Body parser middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging middleware
if (process.env.NODE_ENV === 'development') {
    app.use(morgan('dev'));
} else {
    app.use(morgan('combined'));
}

// Rate limiting
const rateLimit = require('express-rate-limit');
const limiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // limit each IP to 100 requests per windowMs
    message: 'Quá nhiều requests từ IP này, vui lòng thử lại sau.',
    standardHeaders: true,
    legacyHeaders: false,
});

app.use('/api/', limiter);

// Health check endpoints
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || 'production',
        memory: process.memoryUsage(),
        version: process.version,
        service: 'dande-api-pro'
    });
});

app.get('/healthz', (req, res) => {
    res.status(200).json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: Math.floor(process.uptime()),
        service: 'dande-api-pro'
    });
});

app.get('/ping', (req, res) => {
    res.status(200).json({
        message: 'pong',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// Root endpoint
app.get('/', (req, res) => {
    res.status(200).json({
        message: 'Dàn Đề API Pro is running',
        timestamp: new Date().toISOString(),
        status: 'OK',
        version: '2.0.0',
        plan: 'pro'
    });
});

// API routes
app.use('/api/dande', danDeRoutes);
app.use('/api/thongke', thongKeRoutes);
app.use('/api/articles', articleRoutes);
app.use('/api', uploadRoutes);

// Serve static files from uploads directory
app.use('/uploads', express.static('uploads'));

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
        console.log('🔄 Đang khởi động server Pro...');

        // Connect to MongoDB (can wait since Pro plan is always-on)
        await database.connect();
        console.log('✅ Kết nối MongoDB thành công');

        // Start server
        const server = app.listen(PORT, '0.0.0.0', () => {
            console.log(`🚀 Server Pro đang chạy trên port ${PORT}`);
            console.log(`📝 Environment: ${process.env.NODE_ENV || 'production'}`);
            console.log(`🌐 Frontend URL: ${process.env.FRONTEND_URL || 'Not set'}`);
            console.log(`✅ Health check: http://localhost:${PORT}/health`);
            console.log(`🎯 Plan: Pro (Always-on)`);
        });

        // Graceful shutdown
        process.on('SIGTERM', async () => {
            console.log('SIGTERM signal received: closing HTTP server');
            server.close(async () => {
                console.log('HTTP server closed');
                await database.disconnect();
                process.exit(0);
            });
        });

        process.on('SIGINT', async () => {
            console.log('SIGINT signal received: closing HTTP server');
            server.close(async () => {
                console.log('HTTP server closed');
                await database.disconnect();
                process.exit(0);
            });
        });

        // Handle uncaught exceptions
        process.on('uncaughtException', (error) => {
            console.error('❌ Uncaught Exception:', error);
            process.exit(1);
        });

        process.on('unhandledRejection', (reason, promise) => {
            console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
            process.exit(1);
        });

    } catch (error) {
        console.error('❌ Không thể khởi động server:', error);
        console.error('Stack trace:', error.stack);
        process.exit(1);
    }
};

startServer();
