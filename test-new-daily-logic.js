const mongoose = require('mongoose');
const DailyDataCollectionService = require('./src/services/dailyDataCollection.service');

async function testNewDailyLogic() {
    try {
        await mongoose.connect('mongodb://localhost:27017/dande_thongke');
        console.log('✅ Connected to MongoDB');

        const dailyDataService = new DailyDataCollectionService();

        // Test thu thập dữ liệu cho ngày 24/10
        console.log('\n🔄 Test 1: Thu thập dữ liệu cho ngày 24/10');
        const date24 = new Date('2025-10-24');
        const result24 = await dailyDataService.collectAndSaveDailyData(date24, 30);

        console.log(`✅ Đã thu thập dữ liệu cho 24/10:`);
        console.log(`📊 Historical data: ${result24.data.historicalData.recordCount} records`);
        console.log(`📅 Date range: ${result24.data.historicalData.startDate.toISOString().split('T')[0]} to ${result24.data.historicalData.endDate.toISOString().split('T')[0]}`);
        console.log(`🎯 CDM DE predictions: ${result24.data.predictions.cdm.de.length} numbers`);
        console.log(`🎯 Ensemble DE predictions: ${result24.data.predictions.ensemble.de.length} numbers`);

        // Test thu thập dữ liệu cho ngày 23/10
        console.log('\n🔄 Test 2: Thu thập dữ liệu cho ngày 23/10');
        const date23 = new Date('2025-10-23');
        const result23 = await dailyDataService.collectAndSaveDailyData(date23, 30);

        console.log(`✅ Đã thu thập dữ liệu cho 23/10:`);
        console.log(`📊 Historical data: ${result23.data.historicalData.recordCount} records`);
        console.log(`📅 Date range: ${result23.data.historicalData.startDate.toISOString().split('T')[0]} to ${result23.data.historicalData.endDate.toISOString().split('T')[0]}`);
        console.log(`🎯 CDM DE predictions: ${result23.data.predictions.cdm.de.length} numbers`);
        console.log(`🎯 Ensemble DE predictions: ${result23.data.predictions.ensemble.de.length} numbers`);

        // So sánh dữ liệu
        console.log('\n🔍 Test 3: So sánh dữ liệu giữa 2 ngày');
        const isDifferentData = JSON.stringify(result24.data.historicalData.rawData) !== JSON.stringify(result23.data.historicalData.rawData);
        console.log(`📊 Dữ liệu lịch sử khác nhau: ${isDifferentData ? '✅ YES' : '❌ NO'}`);

        // So sánh predictions
        const isDifferentPredictions = JSON.stringify(result24.data.predictions.ensemble.de) !== JSON.stringify(result23.data.predictions.ensemble.de);
        console.log(`🎯 Predictions khác nhau: ${isDifferentPredictions ? '✅ YES' : '❌ NO'}`);

        // Test lấy dữ liệu từ database
        console.log('\n🔄 Test 4: Lấy dữ liệu từ database');
        const retrieved24 = await dailyDataService.getDailyData(date24);
        const retrieved23 = await dailyDataService.getDailyData(date23);

        console.log(`📋 Retrieved 24/10 data: ${retrieved24.metadata.status}`);
        console.log(`📋 Retrieved 23/10 data: ${retrieved23.metadata.status}`);

        // Test lấy top predictions
        console.log('\n🔄 Test 5: Lấy top predictions');
        const top24 = await dailyDataService.getTopPredictions(date24, 'ensemble', 'de', 3);
        const top23 = await dailyDataService.getTopPredictions(date23, 'ensemble', 'de', 3);

        console.log(`🎯 Top 3 DE predictions for 24/10:`);
        top24.forEach((pred, index) => {
            console.log(`  ${index + 1}. ${pred.number} - ${pred.percentage}%`);
        });

        console.log(`🎯 Top 3 DE predictions for 23/10:`);
        top23.forEach((pred, index) => {
            console.log(`  ${index + 1}. ${pred.number} - ${pred.percentage}%`);
        });

        // Kiểm tra xem có khác nhau không
        const isTopDifferent = JSON.stringify(top24) !== JSON.stringify(top23);
        console.log(`🎯 Top predictions khác nhau: ${isTopDifferent ? '✅ YES' : '❌ NO'}`);

        console.log('\n✅ Test hoàn thành!');
        process.exit(0);

    } catch (error) {
        console.error('❌ Test error:', error.message);
        process.exit(1);
    }
}

testNewDailyLogic();







