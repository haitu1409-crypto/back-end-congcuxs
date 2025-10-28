const mongoose = require('mongoose');
const XSMB = require('./src/models/xsmb.model');

async function analyzeData() {
    try {
        await mongoose.connect('mongodb://localhost:27017/dande_thongke');
        console.log('✅ Connected to MongoDB');

        // Total count
        const totalCount = await XSMB.countDocuments();
        console.log('Total records:', totalCount);

        // Get date range
        const firstRecord = await XSMB.findOne().sort({ drawDate: 1 });
        const lastRecord = await XSMB.findOne().sort({ drawDate: -1 });

        if (firstRecord && lastRecord) {
            console.log('Date range:', firstRecord.drawDate.toISOString().split('T')[0], 'to', lastRecord.drawDate.toISOString().split('T')[0]);
        }

        // Count by month
        const monthlyCount = await XSMB.aggregate([
            {
                $group: {
                    _id: {
                        year: { $year: "$drawDate" },
                        month: { $month: "$drawDate" }
                    },
                    count: { $sum: 1 }
                }
            },
            { $sort: { "_id.year": 1, "_id.month": 1 } }
        ]);

        console.log('Monthly distribution:');
        monthlyCount.forEach(item => {
            console.log(`${item._id.year}-${item._id.month.toString().padStart(2, '0')}: ${item.count} records`);
        });

        // Test different date ranges
        const testDate = new Date('2025-10-24');
        console.log('\nTesting different date ranges for', testDate.toISOString().split('T')[0]);

        // Range 1: Last 100 days
        const endDate1 = new Date(testDate);
        endDate1.setDate(endDate1.getDate() - 1);
        endDate1.setHours(23, 59, 59, 999);
        const startDate1 = new Date(endDate1);
        startDate1.setDate(startDate1.getDate() - 100 + 1);
        startDate1.setHours(0, 0, 0, 0);

        const count1 = await XSMB.find({
            drawDate: { $gte: startDate1, $lte: endDate1 },
            station: 'xsmb',
            isComplete: true
        }).countDocuments();

        console.log(`Range 1 (${startDate1.toISOString().split('T')[0]} to ${endDate1.toISOString().split('T')[0]}): ${count1} records`);

        // Range 2: Last 30 days
        const endDate2 = new Date(testDate);
        endDate2.setDate(endDate2.getDate() - 1);
        endDate2.setHours(23, 59, 59, 999);
        const startDate2 = new Date(endDate2);
        startDate2.setDate(startDate2.getDate() - 30 + 1);
        startDate2.setHours(0, 0, 0, 0);

        const count2 = await XSMB.find({
            drawDate: { $gte: startDate2, $lte: endDate2 },
            station: 'xsmb',
            isComplete: true
        }).countDocuments();

        console.log(`Range 2 (${startDate2.toISOString().split('T')[0]} to ${endDate2.toISOString().split('T')[0]}): ${count2} records`);

        process.exit(0);
    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
}

analyzeData();







