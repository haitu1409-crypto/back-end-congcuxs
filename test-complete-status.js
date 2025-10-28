const mongoose = require('mongoose');
const XSMB = require('./src/models/xsmb.model');

async function testCompleteStatus() {
    try {
        await mongoose.connect('mongodb://localhost:27017/dande_thongke');
        console.log('✅ Connected to MongoDB');

        // Count by isComplete status
        const completeCount = await XSMB.find({ isComplete: true }).countDocuments();
        const incompleteCount = await XSMB.find({ isComplete: false }).countDocuments();
        const nullCount = await XSMB.find({ isComplete: null }).countDocuments();
        const undefinedCount = await XSMB.find({ isComplete: { $exists: false } }).countDocuments();

        console.log('Complete (true):', completeCount);
        console.log('Incomplete (false):', incompleteCount);
        console.log('Null:', nullCount);
        console.log('Undefined:', undefinedCount);

        // Get some sample records
        const samples = await XSMB.find().limit(5).select('drawDate isComplete station');
        console.log('\nSample records:');
        samples.forEach(record => {
            console.log(`${record.drawDate.toISOString().split('T')[0]} - isComplete: ${record.isComplete}, station: ${record.station}`);
        });

        // Test without isComplete filter
        const allCount = await XSMB.countDocuments();
        console.log('\nTotal records:', allCount);

        process.exit(0);
    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
}

testCompleteStatus();







