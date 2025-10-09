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

app.use(cors({
    origin: process.env.FRONTEND_URL ? process.env.FRONTEND_URL.split(',') : '*',
    credentials: true
}));

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
