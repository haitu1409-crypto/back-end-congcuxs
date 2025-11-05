/**
 * Database Configuration
 * Cấu hình kết nối MongoDB
 */

const mongoose = require('mongoose');

class Database {
    constructor() {
        this.connection = null;
    }

    async connect() {
        try {
            const mongoUri = process.env.MONGODB_URI || process.env.DATABASE_URL || 'mongodb://localhost:27017/dande_thongke';

            const options = {
                // 🔥 FIX: Increased from 10 to 50 for handling 100+ concurrent users
                // 100 users sending messages = 500-800 concurrent DB queries
                // Need at least 50 connections to avoid queue buildup
                maxPoolSize: parseInt(process.env.MONGODB_POOL_SIZE) || 50,
                minPoolSize: 5, // Maintain minimum connections for faster response
                serverSelectionTimeoutMS: 5000,
                socketTimeoutMS: 45000,
                bufferCommands: false,
                // Additional optimizations for high concurrency
                maxIdleTimeMS: 30000, // Close idle connections after 30s
                connectTimeoutMS: 10000, // Connection timeout
                heartbeatFrequencyMS: 10000 // Heartbeat every 10s
            };

            this.connection = await mongoose.connect(mongoUri, options);

            console.log('✅ Kết nối MongoDB thành công');
            console.log(`📍 Database: ${this.connection.connection.name}`);
            console.log(`🌐 Host: ${this.connection.connection.host}:${this.connection.connection.port}`);

            // Xử lý các sự kiện connection
            mongoose.connection.on('error', (err) => {
                console.error('❌ Lỗi MongoDB:', err);
            });

            mongoose.connection.on('disconnected', () => {
                console.warn('⚠️ MongoDB đã ngắt kết nối');
            });

            mongoose.connection.on('reconnected', () => {
                console.log('🔄 MongoDB đã kết nối lại');
            });

            return this.connection;
        } catch (error) {
            console.error('❌ Không thể kết nối MongoDB:', error.message);
            console.error('🔍 MongoDB URI:', mongoUri.replace(/\/\/.*@/, '//***:***@')); // Hide credentials
            console.error('💡 Hãy kiểm tra MONGODB_URI environment variable');
            throw error;
        }
    }

    async disconnect() {
        try {
            if (this.connection) {
                await mongoose.disconnect();
                console.log('✅ Đã ngắt kết nối MongoDB');
            }
        } catch (error) {
            console.error('❌ Lỗi khi ngắt kết nối MongoDB:', error.message);
            throw error;
        }
    }

    async ping() {
        try {
            await mongoose.connection.db.admin().ping();
            return true;
        } catch (error) {
            console.error('❌ Không thể ping MongoDB:', error.message);
            return false;
        }
    }

    getConnectionStatus() {
        const states = {
            0: 'disconnected',
            1: 'connected',
            2: 'connecting',
            3: 'disconnecting'
        };

        return {
            state: states[mongoose.connection.readyState],
            host: mongoose.connection.host,
            port: mongoose.connection.port,
            name: mongoose.connection.name
        };
    }
}

// Singleton instance
const database = new Database();

module.exports = database;
