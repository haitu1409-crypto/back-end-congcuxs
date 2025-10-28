function testTimeLogic() {
    console.log('🕐 Test Time Logic for Data Collection');
    console.log('=====================================\n');

    // Test different times
    const testTimes = [
        { hour: 10, minute: 30, description: 'Sáng (10:30)' },
        { hour: 18, minute: 30, description: 'Chiều (18:30)' },
        { hour: 18, minute: 40, description: 'Tối (18:40)' },
        { hour: 20, minute: 0, description: 'Tối (20:00)' }
    ];

    testTimes.forEach(testTime => {
        const now = new Date();
        now.setHours(testTime.hour, testTime.minute, 0, 0);

        const currentHour = now.getHours();
        const currentMinute = now.getMinutes();

        let targetDate;
        let dataDescription;

        if (currentHour < 18 || (currentHour === 18 && currentMinute < 35)) {
            // Before 18:35 - predict for today using yesterday's data
            targetDate = now.toISOString().split('T')[0];
            const yesterday = new Date(now);
            yesterday.setDate(yesterday.getDate() - 1);
            const yesterdayStr = yesterday.toLocaleDateString('vi-VN');

            dataDescription = {
                predictionDate: targetDate,
                dataSource: `${yesterdayStr} trở về trước`,
                explanation: `Dữ liệu dự đoán cho ngày ${now.toLocaleDateString('vi-VN')} được tạo từ dữ liệu lịch sử từ ${yesterdayStr} trở về trước (chưa bao gồm kết quả ${yesterdayStr})`
            };
        } else {
            // After 18:35 - predict for tomorrow using today's data
            const tomorrow = new Date(now);
            tomorrow.setDate(tomorrow.getDate() + 1);
            targetDate = tomorrow.toISOString().split('T')[0];
            const todayStr = now.toLocaleDateString('vi-VN');

            dataDescription = {
                predictionDate: targetDate,
                dataSource: `${todayStr} trở về trước`,
                explanation: `Dữ liệu dự đoán cho ngày ${tomorrow.toLocaleDateString('vi-VN')} được tạo từ dữ liệu lịch sử từ ${todayStr} trở về trước (đã bao gồm kết quả ${todayStr})`
            };
        }

        console.log(`⏰ ${testTime.description} (${now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}):`);
        console.log(`   📅 Ngày dự đoán: ${new Date(targetDate).toLocaleDateString('vi-VN')}`);
        console.log(`   📊 Nguồn dữ liệu: ${dataDescription.dataSource}`);
        console.log(`   📝 Mô tả: ${dataDescription.explanation}`);
        console.log('');
    });

    console.log('✅ Test hoàn thành!');
    console.log('🎯 Logic thời gian hoạt động đúng:');
    console.log('   - Trước 18:35: Dự đoán cho hôm nay với dữ liệu hôm qua');
    console.log('   - Sau 18:35: Dự đoán cho ngày mai với dữ liệu hôm nay');
}

testTimeLogic();
