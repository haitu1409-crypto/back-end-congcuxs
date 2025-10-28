const mongoose = require('mongoose');
const XSMBResult = require('./src/models/xsmb.model');

async function testQuery() {
    try {
        await mongoose.connect('mongodb://localhost:27017/dande_thongke');
        console.log('✅ Connected to MongoDB');

        // Test query như trong service
        const targetDate = new Date('2025-10-27T00:00:00.000Z');
        const days = 14;

        const endDate = new Date(targetDate);
        const startDate = new Date(endDate);
        startDate.setDate(startDate.getDate() - days);

        console.log('🔍 Target date:', targetDate.toISOString().split('T')[0]);
        console.log('📅 Start date:', startDate.toISOString().split('T')[0]);
        console.log('📅 End date:', endDate.toISOString().split('T')[0]);

        const historicalData = await XSMBResult.find({
            drawDate: {
                $gte: startDate,
                $lte: endDate
            }
        }).sort({ drawDate: -1 });

        console.log('📊 Found records:', historicalData.length);

        if (historicalData.length > 0) {
            console.log('📅 First record:', historicalData[0].drawDate.toISOString().split('T')[0]);
            console.log('📅 Last record:', historicalData[historicalData.length - 1].drawDate.toISOString().split('T')[0]);
        }

        await mongoose.disconnect();
        console.log('✅ Disconnected from MongoDB');
    } catch (error) {
        console.error('❌ Error:', error.message);
    }
}

testQuery();
