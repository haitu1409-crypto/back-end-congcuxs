const mongoose = require('mongoose');
const SoiCauScheduler = require('./src/services/soicauScheduler.service');

async function testScheduler() {
    try {
        await mongoose.connect('mongodb://localhost:27017/dande_thongke');
        console.log('✅ Connected to MongoDB');

        console.log('🔄 Test Scheduler Logic');
        console.log('='.repeat(50));

        // Test chạy scheduler ngay lập tức
        console.log('\n⏰ Test 1: Chạy scheduler ngay lập tức');
        await SoiCauScheduler.runNow('soiCau');

        console.log('\n✅ Test hoàn thành!');
        console.log('🎉 Scheduler đã chạy thành công và thu thập dữ liệu cho ngày tiếp theo');

        process.exit(0);

    } catch (error) {
        console.error('❌ Test error:', error.message);
        process.exit(1);
    }
}

testScheduler();







