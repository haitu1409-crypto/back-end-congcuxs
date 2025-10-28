const mongoose = require('mongoose');
const XSMB = require('./src/models/xsmb.model');

async function testDataCount() {
    try {
        await mongoose.connect('mongodb://localhost:27017/dande_thongke');
        console.log('✅ Connected to MongoDB');

        const date = new Date('2025-10-24');
        const endDate = new Date(date);
        endDate.setDate(endDate.getDate() - 1);
        endDate.setHours(23, 59, 59, 999);

        const startDate = new Date(endDate);
        startDate.setDate(startDate.getDate() - 100 + 1);
        startDate.setHours(0, 0, 0, 0);

        const dayOffset = (date.getDate() + date.getMonth() + date.getFullYear()) % 14;
        startDate.setDate(startDate.getDate() - dayOffset);
        endDate.setDate(endDate.getDate() - dayOffset);

        console.log('Date range:', startDate.toISOString().split('T')[0], 'to', endDate.toISOString().split('T')[0]);
        console.log('Offset:', dayOffset);

        const count = await XSMB.find({
            drawDate: { $gte: startDate, $lte: endDate },
            station: 'xsmb',
            isComplete: true
        }).countDocuments();

        console.log('Records found:', count);

        // Test without offset
        const startDateNoOffset = new Date(date);
        startDateNoOffset.setDate(startDateNoOffset.getDate() - 1);
        startDateNoOffset.setHours(23, 59, 59, 999);
        const endDateNoOffset = new Date(startDateNoOffset);
        endDateNoOffset.setDate(endDateNoOffset.getDate() - 100 + 1);
        endDateNoOffset.setHours(0, 0, 0, 0);

        const countNoOffset = await XSMB.find({
            drawDate: { $gte: endDateNoOffset, $lte: startDateNoOffset },
            station: 'xsmb',
            isComplete: true
        }).countDocuments();

        console.log('Records without offset:', countNoOffset);

        process.exit(0);
    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
}

testDataCount();







