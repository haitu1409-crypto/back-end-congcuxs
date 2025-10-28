/**
 * XSMB Scraper CLI
 * Chạy thủ công XSMB scraper cho ngày cụ thể
 * Sử dụng: npm run dev 21/10/2025 xsmb
 */

require('dotenv').config();
const xsmbScraperService = require('./src/services/xsmbScraper.service');
const database = require('./src/config/database');

async function runXSMBScraper() {
    try {
        // Lấy tham số từ command line
        const [, , date, station = 'xsmb'] = process.argv;

        if (!date) {
            console.log('❌ Vui lòng cung cấp ngày (format: DD/MM/YYYY)');
            console.log('📖 Cách sử dụng: npm run dev 21/10/2025 xsmb');
            console.log('📖 Hoặc: node xsmb-scraper-cli.js 21/10/2025 xsmb');
            process.exit(1);
        }

        // Validate date format
        const dateRegex = /^\d{2}\/\d{2}\/\d{4}$/;
        if (!dateRegex.test(date)) {
            console.log('❌ Định dạng ngày không hợp lệ. Vui lòng sử dụng DD/MM/YYYY');
            console.log('📖 Ví dụ: 21/10/2025');
            process.exit(1);
        }

        console.log('🚀 Bắt đầu cào XSMB thủ công...');
        console.log(`📅 Ngày: ${date}`);
        console.log(`🏛️ Đài: ${station}`);
        console.log('⏰ Thời gian bắt đầu:', new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }));

        // Kết nối database
        console.log('📡 Đang kết nối MongoDB...');
        await database.connect();
        console.log('✅ Kết nối MongoDB thành công');

        // Chạy scraper
        console.log('🔄 Bắt đầu cào dữ liệu...');
        const result = await xsmbScraperService.scrapeXSMB(date, station, false);

        if (result.success) {
            console.log('✅ Cào dữ liệu thành công!');
            console.log(`📊 Hoàn thành: ${result.isComplete ? 'Có' : 'Chưa'}`);
            console.log(`📊 Số lần cào: ${result.stats.totalIterations}`);
            console.log(`📊 Thời gian: ${result.stats.totalDuration.toFixed(2)}s`);
            console.log(`📊 Thành công: ${result.stats.successCount}`);
            console.log(`📊 Lỗi: ${result.stats.errorCount}`);

            if (result.result) {
                console.log('\n🎯 Dữ liệu cào được:');
                console.log(`📅 Ngày: ${result.result.drawDate.toLocaleDateString('vi-VN')}`);
                console.log(`🏛️ Tỉnh: ${result.result.tentinh} (${result.result.tinh})`);
                console.log(`🎰 Mã DB: ${result.result.maDB}`);
                console.log(`🏆 Giải đặc biệt: ${result.result.specialPrize.join(', ')}`);
                console.log(`🥇 Giải nhất: ${result.result.firstPrize.join(', ')}`);
                console.log(`🥈 Giải nhì: ${result.result.secondPrize.join(', ')}`);
                console.log(`🥉 Giải ba: ${result.result.threePrizes.join(', ')}`);
                console.log(`🏅 Giải tư: ${result.result.fourPrizes.join(', ')}`);
                console.log(`🏅 Giải năm: ${result.result.fivePrizes.join(', ')}`);
                console.log(`🏅 Giải sáu: ${result.result.sixPrizes.join(', ')}`);
                console.log(`🏅 Giải bảy: ${result.result.sevenPrizes.join(', ')}`);
            }
        } else {
            console.log('❌ Cào dữ liệu thất bại');
        }

        console.log('\n⏰ Thời gian hoàn thành:', new Date().toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }));
        console.log('✅ Hoàn thành!');

    } catch (error) {
        console.error('❌ Lỗi khi cào dữ liệu XSMB:', error.message);
        console.error('Stack trace:', error.stack);
        process.exit(1);
    } finally {
        // Đóng kết nối database
        try {
            await database.disconnect();
            console.log('🔌 Đã đóng kết nối MongoDB');
        } catch (error) {
            console.error('❌ Lỗi khi đóng kết nối MongoDB:', error.message);
        }
    }
}

// Chạy scraper
if (require.main === module) {
    runXSMBScraper();
}

module.exports = runXSMBScraper;
