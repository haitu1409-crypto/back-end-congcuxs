/**
 * Database Connection Pool
 * Quản lý connection pool tối ưu hóa cho MongoDB
 */

const mongoose = require('mongoose');

class ConnectionPool {
    constructor() {
        this.connection = null;
        this.isConnected = false;
        this.retryCount = 0;
        this.maxRetries = 5;
        this.retryDelay = 1000;

        // Connection statistics
        this.stats = {
            totalConnections: 0,
            activeConnections: 0,
            failedConnections: 0,
            totalQueries: 0,
            slowQueries: 0,
            errors: 0
        };
    }

    /**
     * Khởi tạo connection pool
     */
    async initialize() {
        try {
            const options = {
                maxPoolSize: 20, // Tối đa 20 connections
                minPoolSize: 5,  // Tối thiểu 5 connections
                maxIdleTimeMS: 30000, // 30 giây
                serverSelectionTimeoutMS: 5000, // 5 giây
                socketTimeoutMS: 45000, // 45 giây
                bufferMaxEntries: 0, // Disable mongoose buffering
                bufferCommands: false, // Disable mongoose buffering
                useNewUrlParser: true,
                useUnifiedTopology: true,

                // Connection pool options
                maxConnecting: 10, // Tối đa 10 connections đang kết nối
                heartbeatFrequencyMS: 10000, // 10 giây
                serverSelectionRetryDelayMS: 2000, // 2 giây

                // Read preferences
                readPreference: 'secondaryPreferred',

                // Write concerns
                writeConcern: {
                    w: 'majority',
                    j: true,
                    wtimeout: 10000
                }
            };

            this.connection = await mongoose.connect(process.env.MONGODB_URI, options);
            this.isConnected = true;
            this.retryCount = 0;

            console.log('✅ Database connection pool initialized');
            this.setupEventListeners();

        } catch (error) {
            console.error('❌ Database connection failed:', error);
            this.stats.failedConnections++;
            throw error;
        }
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        mongoose.connection.on('connected', () => {
            console.log('✅ MongoDB connected');
            this.isConnected = true;
            this.stats.totalConnections++;
        });

        mongoose.connection.on('error', (err) => {
            console.error('❌ MongoDB connection error:', err);
            this.isConnected = false;
            this.stats.errors++;
        });

        mongoose.connection.on('disconnected', () => {
            console.log('🔌 MongoDB disconnected');
            this.isConnected = false;
        });

        mongoose.connection.on('reconnected', () => {
            console.log('🔄 MongoDB reconnected');
            this.isConnected = true;
        });

        // Query monitoring
        mongoose.set('debug', (collectionName, method, query, doc) => {
            const startTime = Date.now();

            // Track slow queries
            setTimeout(() => {
                const duration = Date.now() - startTime;
                if (duration > 1000) { // Queries > 1 second
                    this.stats.slowQueries++;
                    console.warn(`🐌 Slow query detected: ${collectionName}.${method} - ${duration}ms`);
                }
            }, 1000);
        });
    }

    /**
     * Get connection status
     */
    getStatus() {
        return {
            isConnected: this.isConnected,
            readyState: mongoose.connection.readyState,
            host: mongoose.connection.host,
            port: mongoose.connection.port,
            name: mongoose.connection.name,
            stats: this.getStats()
        };
    }

    /**
     * Get connection statistics
     */
    getStats() {
        return {
            ...this.stats,
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Health check
     */
    async healthCheck() {
        try {
            if (!this.isConnected) {
                return {
                    status: 'disconnected',
                    error: 'Database not connected'
                };
            }

            // Ping database
            await mongoose.connection.db.admin().ping();

            return {
                status: 'healthy',
                readyState: mongoose.connection.readyState,
                stats: this.getStats()
            };
        } catch (error) {
            return {
                status: 'unhealthy',
                error: error.message
            };
        }
    }

    /**
     * Optimize connection pool
     */
    async optimize() {
        try {
            // Set connection pool options
            mongoose.connection.db.admin().command({
                setParameter: 1,
                maxPoolSize: 20,
                minPoolSize: 5
            });

            console.log('🔧 Database connection pool optimized');
            return true;
        } catch (error) {
            console.error('❌ Failed to optimize connection pool:', error);
            return false;
        }
    }

    /**
     * Close connection
     */
    async close() {
        try {
            if (this.connection) {
                await mongoose.disconnect();
                this.isConnected = false;
                console.log('🔌 Database connection closed');
            }
        } catch (error) {
            console.error('❌ Error closing database connection:', error);
        }
    }

    /**
     * Get connection info
     */
    getConnectionInfo() {
        return {
            isConnected: this.isConnected,
            readyState: mongoose.connection.readyState,
            host: mongoose.connection.host,
            port: mongoose.connection.port,
            name: mongoose.connection.name,
            collections: Object.keys(mongoose.connection.collections),
            models: Object.keys(mongoose.connection.models)
        };
    }
}

// Export singleton instance
module.exports = new ConnectionPool();
