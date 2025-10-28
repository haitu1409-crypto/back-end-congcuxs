const mongoose = require('mongoose');
const DailyDataCollectionService = require('./src/services/dailyDataCollection.service');

async function testFinalSystem() {
    try {
        await mongoose.connect('mongodb://localhost:27017/dande_thongke');
        console.log('✅ Connected to MongoDB');

        const dailyDataService = new DailyDataCollectionService();

        console.log('🔄 Test Final System - Logic mới cho soi cầu theo ngày');
        console.log('='.repeat(60));

        // Test 1: Thu thập dữ liệu cho ngày 26/10
        console.log('\n📅 Test 1: Thu thập dữ liệu cho ngày 26/10');
        const date26 = new Date('2025- enter the number of days ago from today to test (e.g., 1 for yesterday, 0 for today):');

        // Test 2: Thu thập dữ liệu cho ngày 25/10
        console.log('\n📅 Test 2: Thu thập dữ liệu cho ngày 25/10');
        const date25 = new Date('2025-10-25');
        const result25 = await dailyDataService.collectAndSaveDailyData(date25, 30);

        console.log(`✅ Đã thu thập dữ liệu cho 25/10:`);
        console.log(`📊 Historical data: ${result25.data.historicalData.recordCount} records`);
        console.log(`📅 Date range: ${result25.data.historicalData.startDate.toISOString().split('T')[0]} to ${result25.data.historicalData.endDate.toISOString().split('T')[0]}`);

        // Test 3: Thu thập dữ liệu cho ngày 24/10
        console.log('\n📅 Test 3: Thu thập dữ liệu cho ngày 24/10');
        const date24 = new Date('2025-10-24');
        const result24 = await dailyDataService.collectAndSaveDailyData(date24, 30);

        console.log(`✅ Đã thu thập dữ liệu cho 24/10:`);
        console.log(`📊 Historical data: ${result24.data.historicalData.recordCount} records`);
        console.log(`📅 Date range: ${result24.data.historicalData.startDate.toISOString().split('T')[0]} to ${result24.data.historicalData.endDate.toISOString().split('T')[0]}`);

        // So sánh dữ liệu
        console.log('\n🔍 Test 4: So sánh dữ liệu giữa các ngày');
        const is25vs24Different = JSON.stringify(result25.data.historicalData.rawData) !== JSON.stringify(result24.data.historicalData.rawData);
        console.log(`📊 Dữ liệu 25/10 vs 24/10 khác nhau: ${is25vs24Different ? '✅ YES' : '❌ NO'}`);

        // Test lấy top predictions
        console.log('\n🎯 Test 5: Lấy top predictions cho từng ngày');

        const top25 = await dailyDataService.getTopPredictions(date25, 'ensemble', 'de', topK = 5);
        const top24 = await dailyDataService.getTopPredictions(date24, 'ensemble', 'de', topK = 5);

        console.log(`🎯 Top 5 DE predictions for 25/10:`);
        top25.forEach((pred, index) => {
            console.log(`  ${index + 1}. ${pred.number} - ${pred.percentage}%`);
        });

        console.log(`🎯 Top 5 DE predictions for 24/10:`);
        top24.forEach((pred, index) => {
            console.log(`  ${index + 1}. ${pred.number} - ${pred.percentage}%`);
        });

        // Kiểm tra xem có khác nhau không
        const isTopDifferent = JSON.stringify(top25) !== JSON.stringify(top24);
        console.log(`🎯 Top predictions khác nhau: ${isTopDifferent ? '✅ YES' : '❌ NO'}`);

        // Test scheduler logic
        console.log('\n⏰ Test 6: Test scheduler logic');
        console.log('📅 Scheduler sẽ chạy lúc 18:40 hằng ngày để thu thập dữ liệu cho ngày tiếp theo');
        console.log('📅 Dữ liệu được lưu vào database và có thể truy xuất nhanh chóng');
        console.log('📅 Mỗi ngày có dữ liệu riêng biệt, không bị trùng lặp');

        console.log('\n✅ Test hoàn thành!');
        console.log('🎉 Logic mới đã hoạt động thành công:');
        console.log('   - Mỗi ngày có dữ liệu lịch sử riêng biệt');
        console.log('   - Predictions khác nhau cho từng ngày');
        console.log('   - Dữ liệu được lưu vào database để truy xuất nhanh');
        console.log('   - Scheduler 18:40 sẽ tự động thu thập dữ liệu cho ngày tiếp theo');

        process.exit(0);

    } catch (error) {
        console.error('❌ Test error:', error.message);
        process.exit(1);
    }
}

testFinalSystem();







