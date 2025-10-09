/**
 * Optimized startup script for Render deployment
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');

const app = express();
const PORT = process.env.PORT || 10000;

// Basic middleware setup
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
        console.log('✅ Checking against allowed origins:', allowedOrigins);
        console.log('🔧 Environment:', process.env.NODE_ENV);

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

app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health check endpoints (essential for Render)
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || 'production',
        service: 'dande-api'
    });
});

app.get('/healthz', (req, res) => {
    res.status(200).json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: Math.floor(process.uptime()),
        service: 'dande-api'
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
        message: 'Dàn Đề API is running',
        timestamp: new Date().toISOString(),
        status: 'OK',
        version: '1.0.0'
    });
});

// Load routes dynamically (with error handling)
let routesLoaded = false;

const loadRoutes = async () => {
    try {
        console.log('🔄 Loading API routes...');

        const danDeRoutes = require('./src/routes/dande.routes');
        const thongKeRoutes = require('./src/routes/thongke.routes');
        const articleRoutes = require('./src/routes/article.routes');
        const uploadRoutes = require('./src/routes/upload.routes');

        app.use('/api/dande', danDeRoutes);
        app.use('/api/thongke', thongKeRoutes);
        app.use('/api/articles', articleRoutes);
        app.use('/api', uploadRoutes);

        // Serve static files
        app.use('/uploads', express.static('uploads'));

        console.log('✅ API routes loaded successfully');
        routesLoaded = true;
    } catch (error) {
        console.error('❌ Failed to load routes:', error.message);
        console.log('🔄 Will retry in 10 seconds...');
        setTimeout(loadRoutes, 10000);
    }
};

// 404 handler
app.use('*', (req, res) => {
    res.status(404).json({
        success: false,
        message: 'Endpoint không tồn tại',
        path: req.originalUrl,
        routesLoaded: routesLoaded
    });
});

// Global error handler
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(err.status || 500).json({
        success: false,
        message: err.message || 'Lỗi server nội bộ',
        routesLoaded: routesLoaded
    });
});

// Start server immediately
const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server started on port ${PORT}`);
    console.log(`📝 Environment: ${process.env.NODE_ENV || 'production'}`);
    console.log(`✅ Health check: http://localhost:${PORT}/health`);
    console.log(`✅ Root endpoint: http://localhost:${PORT}/`);
});

// Load routes in background
loadRoutes();

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received: shutting down gracefully');
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    console.log('SIGINT received: shutting down gracefully');
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});

console.log('🎯 Render-optimized server starting...');
