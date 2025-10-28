require('dotenv').config();
const mongoose = require('mongoose');

async function debugConnection() {
    try {
        console.log('🔍 Environment variables:');
        console.log('MONGODB_URI:', process.env.MONGODB_URI || 'NOT SET');
        console.log('DATABASE_URL:', process.env.DATABASE_URL || 'NOT SET');

        const mongoUri = process.env.MONGODB_URI || process.env.DATABASE_URL || 'mongodb://localhost:27017/dande_thongke';
        console.log('🔍 Final connection string:', mongoUri);

        const connection = await mongoose.connect(mongoUri);
        console.log('✅ Connected to MongoDB');
        console.log(`📍 Database: ${connection.connection.name}`);
        console.log(`🌐 Host: ${connection.connection.host}:${connection.connection.port}`);

        // Test query
        const XSMBResult = require('./src/models/xsmb.model');
        const count = await XSMBResult.countDocuments();
        console.log('📊 XSMB records count:', count);

        await mongoose.disconnect();
        console.log('✅ Disconnected from MongoDB');
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

debugConnection();
