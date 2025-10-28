const mongoose = require('mongoose');

async function checkXSMBs() {
    try {
        await mongoose.connect('mongodb://localhost:27017/lottery_prediction');
        console.log('✅ Connected to MongoDB');

        // Kiểm tra collection xsmbs
        const db = mongoose.connection.db;
        const collections = await db.listCollections().toArray();
        console.log('📊 Available collections:');
        collections.forEach(col => {
            console.log(`  - ${col.name}`);
        });

        // Kiểm tra số lượng bản ghi trong collection xsmbs
        const xsmbsCount = await db.collection('xsmbs').countDocuments();
        console.log(`📊 Total records in xsmbs collection: ${xsmbsCount}`);

        // Lấy vài bản ghi mẫu
        const sampleData = await db.collection('xsmbs').find().sort({ drawDate: -1 }).limit(10).toArray();
        console.log('📅 Recent 10 records:');
        sampleData.forEach((record, index) => {
            console.log(`  ${index + 1}. ${record.drawDate} - ${record.specialPrize}`);
        });

        // Kiểm tra query như trong service
        const targetDate = new Date('2025-10-27');
        const endDate = new Date(targetDate);
        const startDate = new Date(endDate);
        startDate.setDate(startDate.getDate() - 14);

        console.log(`🔍 Query range: ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`);

        const queryResult = await db.collection('xsmbs').find({
            drawDate: {
                $gte: startDate,
                $lte: endDate
            }
        }).sort({ drawDate: -1 }).toArray();

        console.log(`📊 Query result: ${queryResult.length} records`);

        await mongoose.disconnect();
    } catch (error) {
        console.error('❌ Error:', error);
    }
}

checkXSMBs();
