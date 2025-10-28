/**
 * Database Optimizer
 * Tối ưu hóa database với indexes, connection pooling và query optimization
 */

const mongoose = require('mongoose');

class DatabaseOptimizer {
    constructor() {
        this.connectionPool = null;
        this.indexesCreated = false;
    }

    /**
     * Khởi tạo connection pool
     */
    async initializeConnectionPool() {
        try {
            const options = {
                maxPoolSize: 10, // Maintain up to 10 socket connections
                serverSelectionTimeoutMS: 5000, // Keep trying to send operations for 5 seconds
                socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
                bufferMaxEntries: 0, // Disable mongoose buffering
                bufferCommands: false, // Disable mongoose buffering
                useNewUrlParser: true,
                useUnifiedTopology: true,
            };

            if (!this.connectionPool) {
                this.connectionPool = await mongoose.connect(process.env.MONGODB_URI, options);
                console.log('✅ Database connection pool initialized');
            }

            return this.connectionPool;
        } catch (error) {
            console.error('❌ Database connection failed:', error);
            throw error;
        }
    }

    /**
     * Tạo indexes cho tối ưu hóa queries
     */
    async createOptimizedIndexes() {
        if (this.indexesCreated) return;

        try {
            const XSMB = require('../models/xsmb.model');

            // Compound indexes cho queries phổ biến
            await XSMB.collection.createIndexes([
                // Index cho queries theo ngày
                {
                    key: { drawDate: -1, station: 1 },
                    name: 'drawDate_station_idx',
                    background: true
                },
                // Index cho queries theo ngày và trạng thái
                {
                    key: { drawDate: -1, station: 1, isComplete: 1 },
                    name: 'drawDate_station_isComplete_idx',
                    background: true
                },
                // Index cho range queries
                {
                    key: { drawDate: 1 },
                    name: 'drawDate_asc_idx',
                    background: true
                },
                // Index cho station queries
                {
                    key: { station: 1 },
                    name: 'station_idx',
                    background: true
                }
            ]);

            console.log('✅ Database indexes created successfully');
            this.indexesCreated = true;
        } catch (error) {
            console.error('❌ Failed to create indexes:', error);
            throw error;
        }
    }

    /**
     * Tối ưu hóa query với projection và lean
     */
    optimizeQuery(query, projection = {}) {
        return query
            .select(projection)
            .lean() // Sử dụng lean() để trả về plain objects thay vì Mongoose documents
            .hint('drawDate_station_idx'); // Sử dụng index cụ thể
    }

    /**
     * Batch processing cho large datasets
     */
    async batchProcess(collection, pipeline, batchSize = 1000) {
        const cursor = collection.aggregate(pipeline, {
            allowDiskUse: true,
            cursor: { batchSize }
        });

        const results = [];
        for await (const doc of cursor) {
            results.push(doc);
        }

        return results;
    }

    /**
     * Connection health check
     */
    async healthCheck() {
        try {
            const state = mongoose.connection.readyState;
            const states = {
                0: 'disconnected',
                1: 'connected',
                2: 'connecting',
                3: 'disconnecting'
            };

            return {
                status: states[state] || 'unknown',
                readyState: state,
                isConnected: state === 1
            };
        } catch (error) {
            return {
                status: 'error',
                error: error.message
            };
        }
    }

    /**
     * Cleanup connections
     */
    async cleanup() {
        try {
            if (this.connectionPool) {
                await mongoose.disconnect();
                this.connectionPool = null;
                console.log('✅ Database connections closed');
            }
        } catch (error) {
            console.error('❌ Error closing database connections:', error);
        }
    }
}

module.exports = new DatabaseOptimizer();
