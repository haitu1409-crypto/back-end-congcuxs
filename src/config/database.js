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
            const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/dande_thongke';

            const options = {
                useNewUrlParser: true,
                useUnifiedTopology: true,
                maxPoolSize: 10,
                serverSelectionTimeoutMS: 5000,
                socketTimeoutMS: 45000,
                bufferCommands: false
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
