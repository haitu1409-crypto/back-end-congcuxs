const mongoose = require('mongoose');
const XSMB = require('./src/models/xsmb.model');

async function testDataComparison() {
    try {
        await mongoose.connect('mongodb://localhost:27017/dande_thongke');
        console.log('✅ Connected to MongoDB');

        // Test data for 24/10 (should include 23/10 data)
        const date24 = new Date('2025-10-24');
        const endDate24 = new Date(date24);
        endDate24.setDate(endDate24.getDate() - 1); // 23/10
        endDate24.setHours(23, 59, 59, 999);

        const startDate24 = new Date(endDate24);
        startDate24.setDate(startDate24.getDate() - 30 + 1); // 30 days back from 23/10
        startDate24.setHours(0, 0, 0, 0);

        const dayOffset24 = (date24.getDate() + date24.getMonth() * 3 + date24.getFullYear() % 10 + date24.getDay()) % 14;
        startDate24.setDate(startDate24.getDate() - dayOffset24);
        endDate24.setDate(endDate24.getDate() - dayOffset24);

        console.log('📊 Data for 24/10 prediction:');
        console.log(`Date range: ${startDate24.toISOString().split('T')[0]} to ${endDate24.toISOString().split('T')[0]}`);
        console.log(`Offset: ${dayOffset24}`);

        const data24 = await XSMB.find({
            drawDate: { $gte: startDate24, $lte: endDate24 },
            station: 'xsmb'
        })
        .select('drawDate specialPrize firstPrize')
        .sort({ drawDate: -1 })
        .limit(5);

        console.log(`Found ${data24.length} records for 24/10`);
        data24.forEach(record => {
            console.log(`  ${record.drawDate.toISOString().split('T')[0]} - Special: ${record.specialPrize}, First: ${record.firstPrize}`);
        });

        console.log('\n' + '='.repeat(50) + '\n');

        // Test data for 23/10 (should NOT include 23/10 data)
        const date23 = new Date('2025-10-23');
        const endDate23 = new Date(date23);
        endDate23.setDate(endDate23.getDate() - 1); // 22/10
        endDate23.setHours(23, 59, 59, 999);

        const startDate23 = new Date(endDate23);
        startDate23.setDate(startDate23.getDate() - 30 + 1); // 30 days back from 22/10
        startDate23.setHours(0, 0, 0, 0);

        const dayOffset23 = (date23.getDate() + date23.getMonth() * 3 + date23.getFullYear() % 10 + date23.getDay()) % 14;
        startDate23.setDate(startDate23.getDate() - dayOffset23);
        endDate23.setDate(endDate23.getDate() - dayOffset23);

        console.log('📊 Data for 23/10 prediction:');
        console.log(`Date range: ${startDate23.toISOString().split('T')[0]} to ${endDate23.toISOString().split('T')[0]}`);
        console.log(`Offset: ${dayOffset23}`);

        const data23 = await XSMB.find({
            drawDate: { $gte: startDate23, $lte: endDate23 },
            station: 'xsmb'
        })
        .select('drawDate specialPrize firstPrize')
        .sort({ drawDate: -1 })
        .limit(5);

        console.log(`Found ${data23.length} records for 23/10`);
        data23.forEach(record => {
            console.log(`  ${record.drawDate.toISOString().split('T')[0]} - Special: ${record.specialPrize}, First: ${record.firstPrize}`);
        });

        console.log('\n' + '='.repeat(50) + '\n');

        // Check if 23/10 data is included in 24/10 but not in 23/10
        const has23In24 = data24.some(record => record.drawDate.toISOString().split('T')[0] === '2025-10-23');
        const has23In23 = data23.some(record => record.drawDate.toISOString().split('T')[0] === '2025-10-23');

        console.log('🔍 Key Check:');
        console.log(`Does 24/10 data include 23/10? ${has23In24 ? '✅ YES' : '❌ NO'}`);
        console.log(`Does 23/10 data include 23/10? ${has23In23 ? '❌ YES (WRONG!)' : '✅ NO (CORRECT)'}`);

        // Check if the datasets are different
        const data24Dates = data24.map(r => r.drawDate.toISOString().split('T')[0]);
        const data23Dates = data23.map(r => r.drawDate.toISOString().split('T')[0]);
        const isDifferent = JSON.stringify(data24Dates.sort()) !== JSON.stringify(data23Dates.sort());

        console.log(`Are the datasets different? ${isDifferent ? '✅ YES' : '❌ NO'}`);

        process.exit(0);
    } catch (error) {
        console.error('Error:', error.message);
        process.exit(1);
    }
}

testDataComparison();







