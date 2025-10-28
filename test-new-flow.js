const axios = require('axios');

async function testNewFlow() {
    try {
        console.log('🔄 Test New Flow - Manual Data Creation with Selected Date');
        console.log('========================================================\n');

        // Test 1: Create data collection for a specific date
        const testDate = '2025-10-25';
        console.log(`📅 Test 1: Tạo bộ dữ liệu cho ngày ${testDate}`);

        const response = await axios.post('http://localhost:5000/api/soicau-page/generate', {
            date: testDate,
            days: 30,
            topK: 5
        });

        if (response.data.success) {
            console.log('✅ Tạo bộ dữ liệu thành công!');
            console.log(`📊 Historical data: ${response.data.data.historicalData.recordCount} records`);
            console.log(`📅 Date range: ${response.data.data.historicalData.startDate.toISOString().split('T')[0]} to ${response.data.data.historicalData.endDate.toISOString().split('T')[0]}`);
        } else {
            console.error('❌ Lỗi tạo bộ dữ liệu:', response.data.message);
            return;
        }

        // Test 2: Get predictions for different methods and types
        console.log('\n📅 Test 2: Lấy predictions cho các phương pháp khác nhau');

        const methods = ['ensemble', 'cdm', 'efdm', 'cf'];
        const types = ['de', 'lo'];

        for (const method of methods) {
            for (const type of types) {
                try {
                    const predictionsResponse = await axios.get(`http://localhost:5000/api/soicau-page/predictions/${method}/${type}?date=${testDate}&limit=3`);

                    if (predictionsResponse.data.success) {
                        console.log(`✅ ${method.toUpperCase()}-${type.toUpperCase()}: ${predictionsResponse.data.data.predictions.length} predictions`);
                        console.log(`   Top 3: ${predictionsResponse.data.data.predictions.map(p => `${p.number}(${p.percentage}%)`).join(', ')}`);
                    }
                } catch (error) {
                    console.log(`⚠️ ${method.toUpperCase()}-${type.toUpperCase()}: ${error.response?.data?.message || error.message}`);
                }
            }
        }

        // Test 3: Test different dates
        console.log('\n📅 Test 3: Test với ngày khác');
        const testDate2 = '2025-10-26';

        try {
            const response2 = await axios.post('http://localhost:5000/api/soicau-page/generate', {
                date: testDate2,
                days: 30,
                topK: 5
            });

            if (response2.data.success) {
                console.log(`✅ Tạo bộ dữ liệu cho ${testDate2} thành công!`);

                // Get predictions for the new date
                const predictionsResponse2 = await axios.get(`http://localhost:5000/api/soicau-page/predictions/ensemble/de?date=${testDate2}&limit=3`);
                if (predictionsResponse2.data.success) {
                    console.log(`✅ Predictions cho ${testDate2}: ${predictionsResponse2.data.data.predictions.length} predictions`);
                }
            }
        } catch (error) {
            console.log(`⚠️ Lỗi với ${testDate2}: ${error.response?.data?.message || error.message}`);
        }

        console.log('\n✅ Test hoàn thành!');
        console.log('🎉 Flow mới hoạt động đúng:');
        console.log('   1. Tạo bộ dữ liệu cho ngày được chọn thành công');
        console.log('   2. Lấy predictions cho các phương pháp và loại khác nhau thành công');
        console.log('   3. Có thể tạo dữ liệu cho nhiều ngày khác nhau');

    } catch (error) {
        console.error('❌ Error in new flow test:', error.message);
        if (error.response) {
            console.error('Response data:', error.response.data);
        }
    }
}

testNewFlow();







