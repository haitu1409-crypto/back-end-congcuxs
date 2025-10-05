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
const thongKeRoutes = require('./src/routes/thongke.routes');
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
    ? process.env.FRONTEND_URL.split(',')
    : [
        'https://www.taodandewukong.pro',
        'https://taodandewukong.pro',
        'http://localhost:3000',
        'http://localhost:3001',
        'http://localhost:3002',
        'http://localhost:3003',
        'http://localhost:3004'
    ];

console.log('🌐 Allowed CORS Origins:', allowedOrigins);

app.use(cors({
    origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);

        console.log('🔍 Request Origin:', origin);
        console.log('✅ Checking against allowed origins:', allowedOrigins);

        if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
            console.log('✅ CORS allowed for:', origin);
            return callback(null, true);
        }

        console.log('❌ CORS blocked for:', origin);
        return callback(new Error(`Not allowed by CORS: ${origin}`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
    preflightContinue: false,
    optionsSuccessStatus: 200
}));

// Compression middleware để giảm kích thước response
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

// Rate limiting để bảo vệ API
const limiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // limit each IP to 100 requests per windowMs
    message: 'Quá nhiều requests từ IP này, vui lòng thử lại sau.',
    standardHeaders: true,
    legacyHeaders: false,
});

app.use('/api/', limiter);

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || 'development',
        memory: process.memoryUsage(),
        version: process.version
    });
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
app.use('/api/thongke', thongKeRoutes);

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

        // Kết nối MongoDB với timeout
        const connectWithTimeout = async () => {
            const timeout = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('MongoDB connection timeout')), 30000);
            });

            const connect = database.connect();
            return Promise.race([connect, timeout]);
        };

        await connectWithTimeout();
        console.log('✅ Kết nối MongoDB thành công');

        // Khởi động server
        const server = app.listen(PORT, '0.0.0.0', () => {
            console.log(`🚀 Server đang chạy trên port ${PORT}`);
            console.log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
            console.log(`🌐 Frontend URL: ${process.env.FRONTEND_URL || 'Not set'}`);
            console.log(`✅ Health check available at: http://localhost:${PORT}/health`);
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

