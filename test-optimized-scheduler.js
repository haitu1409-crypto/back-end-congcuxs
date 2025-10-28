/**
 * Test Optimized Soi Cầu Scheduler
 * Kiểm tra scheduler tự động tính toán soi cầu
 */

const optimizedSoiCauScheduler = require('./src/services/optimizedSoiCauScheduler.service');

async function testScheduler() {
    console.log('🧪 Testing Optimized Soi Cầu Scheduler...\n');

    try {
        // Test 1: Khởi động scheduler
        console.log('1️⃣ Testing scheduler initialization...');
        optimizedSoiCauScheduler.init();
        console.log('✅ Scheduler initialized successfully\n');

        // Test 2: Lấy trạng thái
        console.log('2️⃣ Testing scheduler status...');
        const status = optimizedSoiCauScheduler.getStatus();
        console.log('📊 Scheduler Status:', JSON.stringify(status, null, 2));
        console.log('✅ Status retrieved successfully\n');

        // Test 3: Health check
        console.log('3️⃣ Testing scheduler health check...');
        const health = await optimizedSoiCauScheduler.healthCheck();
        console.log('🏥 Health Check:', JSON.stringify(health, null, 2));
        console.log('✅ Health check completed\n');

        // Test 4: Chạy manual soi cầu update
        console.log('4️⃣ Testing manual soi cầu update...');
        await optimizedSoiCauScheduler.runNow('soiCau');
        console.log('✅ Manual soi cầu update completed\n');

        // Test 5: Lấy thời gian chạy tiếp theo
        console.log('5️⃣ Testing next run time...');
        const nextRun = optimizedSoiCauScheduler.getNextRunTime();
        console.log('⏰ Next run time:', nextRun.toLocaleString('vi-VN'));
        console.log('✅ Next run time retrieved successfully\n');

        // Test 6: Dừng scheduler
        console.log('6️⃣ Testing scheduler stop...');
        optimizedSoiCauScheduler.stop();
        console.log('✅ Scheduler stopped successfully\n');

        console.log('🎉 All tests completed successfully!');

    } catch (error) {
        console.error('❌ Test failed:', error);
        process.exit(1);
    }
}

// Chạy test
testScheduler();

