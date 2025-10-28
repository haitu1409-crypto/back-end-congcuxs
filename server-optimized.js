/**
 * Optimized Server Configuration
 * Server tối ưu hóa với clustering, caching, monitoring và performance optimization
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const cluster = require('cluster');
const os = require('os');
const path = require('path');

// Import optimized modules
const connectionPool = require('./src/utils/connectionPool');
const redisCacheManager = require('./src/utils/redisCacheManager');
const databaseOptimizer = require('./src/utils/databaseOptimizer');
const advancedCache = require('./src/utils/advancedCache');

// Import routes
const optimizedPositionSoiCauRoutes = require('./src/routes/optimizedPositionSoiCau.routes');

// Performance monitoring
const performanceMonitor = {
    startTime: Date.now(),
    requestCount: 0,
    totalResponseTime: 0,
    errors: 0,
    cacheHits: 0,
    cacheMisses: 0
};

class OptimizedServer {
    constructor() {
        this.app = express();
        this.port = process.env.PORT || 3000;
        this.isProduction = process.env.NODE_ENV === 'production';
        this.numCPUs = os.cpus().length;
    }

    /**
     * Khởi tạo server
     */
    async initialize() {
        try {
            console.log('🚀 Starting Optimized Server...');

            // Initialize database
            await this.initializeDatabase();

            // Initialize cache
            await this.initializeCache();

            // Setup middleware
            this.setupMiddleware();

            // Setup routes
            this.setupRoutes();

            // Setup error handling
            this.setupErrorHandling();

            // Setup monitoring
            this.setupMonitoring();

            console.log('✅ Optimized Server initialized successfully');

        } catch (error) {
            console.error('❌ Failed to initialize server:', error);
            process.exit(1);
        }
    }

    /**
     * Khởi tạo database
     */
    async initializeDatabase() {
        try {
            await connectionPool.initialize();
            await databaseOptimizer.createOptimizedIndexes();
            console.log('✅ Database initialized');
        } catch (error) {
            console.error('❌ Database initialization failed:', error);
            throw error;
        }
    }

    /**
     * Khởi tạo cache
     */
    async initializeCache() {
        try {
            // Initialize Redis if available
            if (process.env.REDIS_HOST) {
                await redisCacheManager.initialize();
                console.log('✅ Redis cache initialized');
            } else {
                console.log('⚠️ Redis not configured, using in-memory cache');
            }

            // Initialize advanced cache
            console.log('✅ Advanced cache initialized');
        } catch (error) {
            console.error('❌ Cache initialization failed:', error);
            // Continue without cache
            console.log('⚠️ Continuing without cache');
        }
    }

    /**
     * Setup middleware
     */
    setupMiddleware() {
        // Security middleware
        this.app.use(helmet({
            contentSecurityPolicy: {
                directives: {
                    defaultSrc: ["'self'"],
                    styleSrc: ["'self'", "'unsafe-inline'"],
                    scriptSrc: ["'self'"],
                    imgSrc: ["'self'", "data:", "https:"],
                },
            },
            crossOriginEmbedderPolicy: false
        }));

        // CORS
        this.app.use(cors({
            origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
            credentials: true,
            methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
            allowedHeaders: ['Content-Type', 'Authorization', 'x-user-id', 'x-admin-key']
        }));

        // Compression
        this.app.use(compression({
            level: 6,
            threshold: 1024,
            filter: (req, res) => {
                if (req.headers['x-no-compression']) {
                    return false;
                }
                return compression.filter(req, res);
            }
        }));

        // Body parsing
        this.app.use(express.json({ limit: '10mb' }));
        this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

        // Request logging
        this.app.use((req, res, next) => {
            const startTime = Date.now();

            res.on('finish', () => {
                const duration = Date.now() - startTime;
                performanceMonitor.requestCount++;
                performanceMonitor.totalResponseTime += duration;

                if (res.statusCode >= 400) {
                    performanceMonitor.errors++;
                }

                console.log(`📊 ${req.method} ${req.path} - ${res.statusCode} - ${duration}ms`);
            });

            next();
        });

        // Global rate limiting
        const globalLimiter = rateLimit({
            windowMs: 15 * 60 * 1000, // 15 phút
            max: 1000, // Tối đa 1000 requests/15 phút
            message: {
                error: 'Quá nhiều yêu cầu từ IP này, vui lòng thử lại sau',
                success: false
            },
            standardHeaders: true,
            legacyHeaders: false
        });

        this.app.use(globalLimiter);
    }

    /**
     * Setup routes
     */
    setupRoutes() {
        // Health check
        this.app.get('/health', async (req, res) => {
            try {
                const dbHealth = await connectionPool.healthCheck();
                const cacheHealth = await redisCacheManager.healthCheck();

                const isHealthy = dbHealth.status === 'healthy';

                res.status(isHealthy ? 200 : 503).json({
                    status: isHealthy ? 'OK' : 'UNHEALTHY',
                    timestamp: new Date().toISOString(),
                    uptime: process.uptime(),
                    memory: process.memoryUsage(),
                    database: dbHealth,
                    cache: cacheHealth,
                    performance: {
                        requestCount: performanceMonitor.requestCount,
                        averageResponseTime: performanceMonitor.requestCount > 0
                            ? Math.round(performanceMonitor.totalResponseTime / performanceMonitor.requestCount)
                            : 0,
                        errorRate: performanceMonitor.requestCount > 0
                            ? Math.round((performanceMonitor.errors / performanceMonitor.requestCount) * 100)
                            : 0
                    }
                });
            } catch (error) {
                res.status(503).json({
                    status: 'ERROR',
                    error: error.message,
                    timestamp: new Date().toISOString()
                });
            }
        });

        // Metrics endpoint
        this.app.get('/metrics', (req, res) => {
            const metrics = {
                uptime: process.uptime(),
                memory: process.memoryUsage(),
                cpu: process.cpuUsage(),
                performance: {
                    requestCount: performanceMonitor.requestCount,
                    averageResponseTime: performanceMonitor.requestCount > 0
                        ? Math.round(performanceMonitor.totalResponseTime / performanceMonitor.requestCount)
                        : 0,
                    errorRate: performanceMonitor.requestCount > 0
                        ? Math.round((performanceMonitor.errors / performanceMonitor.requestCount) * 100)
                        : 0,
                    cacheHits: performanceMonitor.cacheHits,
                    cacheMisses: performanceMonitor.cacheMisses
                },
                database: connectionPool.getStats(),
                cache: advancedCache.getStats(),
                timestamp: new Date().toISOString()
            };

            res.json(metrics);
        });

        // API routes
        this.app.use('/api/optimized-position-soicau', optimizedPositionSoiCauRoutes);

        // Root endpoint
        this.app.get('/', (req, res) => {
            res.json({
                message: 'Optimized Position Soi Cau API',
                version: '2.0.0',
                status: 'running',
                timestamp: new Date().toISOString(),
                endpoints: {
                    health: '/health',
                    metrics: '/metrics',
                    api: '/api/optimized-position-soicau'
                }
            });
        });
    }

    /**
     * Setup error handling
     */
    setupErrorHandling() {
        // 404 handler
        this.app.use('*', (req, res) => {
            res.status(404).json({
                error: 'Endpoint not found',
                success: false,
                timestamp: new Date().toISOString()
            });
        });

        // Global error handler
        this.app.use((error, req, res, next) => {
            console.error('❌ Server error:', error);
            performanceMonitor.errors++;

            res.status(500).json({
                error: this.isProduction ? 'Internal server error' : error.message,
                success: false,
                timestamp: new Date().toISOString()
            });
        });

        // Graceful shutdown
        process.on('SIGTERM', this.gracefulShutdown.bind(this));
        process.on('SIGINT', this.gracefulShutdown.bind(this));
    }

    /**
     * Setup monitoring
     */
    setupMonitoring() {
        // Memory monitoring
        setInterval(() => {
            const memUsage = process.memoryUsage();
            if (memUsage.heapUsed > 500 * 1024 * 1024) { // 500MB
                console.warn('⚠️ High memory usage:', Math.round(memUsage.heapUsed / 1024 / 1024) + 'MB');
            }
        }, 30000); // Check every 30 seconds

        // Performance monitoring
        setInterval(() => {
            const avgResponseTime = performanceMonitor.requestCount > 0
                ? Math.round(performanceMonitor.totalResponseTime / performanceMonitor.requestCount)
                : 0;

            console.log(`📊 Performance: ${performanceMonitor.requestCount} requests, ${avgResponseTime}ms avg, ${performanceMonitor.errors} errors`);
        }, 60000); // Log every minute
    }

    /**
     * Graceful shutdown
     */
    async gracefulShutdown(signal) {
        console.log(`🛑 Received ${signal}, shutting down gracefully...`);

        try {
            // Close database connections
            await connectionPool.close();

            // Close cache connections
            await redisCacheManager.close();

            console.log('✅ Graceful shutdown completed');
            process.exit(0);
        } catch (error) {
            console.error('❌ Error during shutdown:', error);
            process.exit(1);
        }
    }

    /**
     * Start server
     */
    async start() {
        try {
            await this.initialize();

            this.app.listen(this.port, () => {
                console.log(`🚀 Optimized Server running on port ${this.port}`);
                console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
                console.log(`💾 Database: ${connectionPool.isConnected ? 'Connected' : 'Disconnected'}`);
                console.log(`🗄️ Cache: ${redisCacheManager.isConnected ? 'Redis' : 'Memory'}`);
            });
        } catch (error) {
            console.error('❌ Failed to start server:', error);
            process.exit(1);
        }
    }
}

// Cluster mode for production
if (cluster.isMaster && process.env.NODE_ENV === 'production') {
    console.log(`👑 Master process ${process.pid} is running`);
    console.log(`💻 Starting ${os.cpus().length} worker processes`);

    // Fork workers
    for (let i = 0; i < os.cpus().length; i++) {
        cluster.fork();
    }

    cluster.on('exit', (worker, code, signal) => {
        console.log(`💀 Worker ${worker.process.pid} died`);
        console.log('🔄 Starting a new worker');
        cluster.fork();
    });

    cluster.on('online', (worker) => {
        console.log(`✅ Worker ${worker.process.pid} is online`);
    });
} else {
    // Start server
    const server = new OptimizedServer();
    server.start();
}

module.exports = OptimizedServer;
