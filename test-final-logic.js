const mongoose = require('mongoose');
const XSMB = require('./src/models/xsmb.model');

async function testFinalLogic() {
    try {
        await mongoose.connect('mongodb://localhost:27017/dande_thongke');
        console.log('✅ Connected to MongoDB');

        const date = new Date('2025-10-24');
        const endDate = new Date(date);
        endDate.setDate(endDate.getDate() - 1);
        endDate.setHours(23, 59, 59, 999);

        const startDate = new Date(endDate);
        startDate.setDate(startDate.getDate() - 30 + 1);
        startDate.setHours(0, 0, 0, 0);

        const dayOffset = date.getDate() % 3;
        startDate.setDate(startDate.getDate() - dayOffset);
        endDate.setDate(endDate.getDate() - dayOffset);

        console.log('Date range (30 days):', startDate.toISOString().split('T')[0], 'to', endDate.toISOString().split('T')[0]);
        console.log('Offset:', dayOffset);

        const count = await XSMB.find({
            drawDate: { $gte: startDate, $lte: endDate },
            station: 'xsmb'
        }).countDocuments();

        console.log('Records found:', count);

        // Test without any offset
        const endDateNoOffset = new Date(date);
        endDateNoOffset.setDate(endDateNoOffset.getDate() - 1);
        endDateNoOffset.setHours(23, 59, 59, 999);
        const startDateNoOffset = new Date(endDateNoOffset);
        startDateNoOffset.setDate(startDateNoOffset.getDate() - 30 + 1);
        startDateNoOffset.setHours(0, 0, 0, 0);

        const countNoOffset = await XSMB.find({
            drawDate: { $gte: startDateNoOffset, $lte: endDateNoOffset },
            station: 'xsmb'
        }).countDocuments();

        console.log('Records without offset:', countNoOffset);

        // Test with all available data
        const allCount = await XSMB.find({
            station: 'xsmb'
        }).countDocuments();

        console.log('All available records:', allCount);

        process.exit(0);
    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
}

testFinalLogic();







