const cron = require('node-cron');
const xsmbScraperService = require('./xsmbScraper.service');
const XSMB = require('../models/xsmb.model');

class XSMBSchedulerService {
    constructor() {
        this.isRunning = false;
        this.scheduledJob = null;
        this.lastRun = null;
        this.nextRun = null;
    }

    /**
     * Khởi tạo scheduler
     */
    init() {
        console.log('🕐 Khởi tạo XSMB Scheduler...');

        // Lên lịch chạy hàng ngày lúc 18:35
        this.scheduledJob = cron.schedule('35 18 * * *', async () => {
            await this.runDailyScraping();
        }, {
            scheduled: true,
            timezone: 'Asia/Ho_Chi_Minh'
        });

        // Tính toán thời gian chạy tiếp theo
        this.calculateNextRun();

        console.log('✅ XSMB Scheduler đã được khởi tạo');
        console.log(`⏰ Thời gian chạy tiếp theo: ${this.nextRun}`);

        return this;
    }

    /**
     * Tính toán thời gian chạy tiếp theo
     */
    calculateNextRun() {
        const now = new Date();
        const nextRun = new Date();
        nextRun.setHours(18, 35, 0, 0);

        // Nếu đã qua 18:35 hôm nay, lên lịch cho ngày mai
        if (now > nextRun) {
            nextRun.setDate(nextRun.getDate() + 1);
        }

        this.nextRun = nextRun.toLocaleString('vi-VN', {
            timeZone: 'Asia/Ho_Chi_Minh',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    }

    /**
     * Chạy cào dữ liệu hàng ngày
     */
    async runDailyScraping() {
        if (this.isRunning) {
            console.log('⚠️ XSMB Scraper đang chạy, bỏ qua lần này...');
            return;
        }

        this.isRunning = true;
        this.lastRun = new Date();

        try {
            console.log('🚀 Bắt đầu cào dữ liệu XSMB hàng ngày...');

            // Kiểm tra xem đã có dữ liệu cho ngày hôm nay chưa
            const today = new Date();
            const existingResult = await XSMB.findByDate(today);

            if (existingResult && existingResult.isComplete) {
                console.log('✅ Đã có dữ liệu đầy đủ cho ngày hôm nay, bỏ qua...');
                return;
            }

            // Cào dữ liệu cho ngày hiện tại
            const result = await xsmbScraperService.scrapeToday();

            if (result.success && result.isComplete) {
                console.log('✅ Cào dữ liệu XSMB thành công và đầy đủ');
            } else if (result.success && !result.isComplete) {
                console.log('⚠️ Cào dữ liệu XSMB thành công nhưng chưa đầy đủ');
            } else {
                console.log('❌ Cào dữ liệu XSMB thất bại');
            }

            // Tính toán thời gian chạy tiếp theo
            this.calculateNextRun();

        } catch (error) {
            console.error('❌ Lỗi khi chạy cào dữ liệu XSMB hàng ngày:', error.message);
        } finally {
            this.isRunning = false;
        }
    }

    /**
     * Chạy cào dữ liệu thủ công
     */
    async runManualScraping(date = null) {
        if (this.isRunning) {
            throw new Error('XSMB Scraper đang chạy, vui lòng thử lại sau');
        }

        this.isRunning = true;
        this.lastRun = new Date();

        try {
            console.log(`🚀 Bắt đầu cào dữ liệu XSMB thủ công${date ? ` cho ngày ${date}` : ' cho ngày hiện tại'}...`);

            let result;
            if (date) {
                result = await xsmbScraperService.scrapeSpecificDate(date);
            } else {
                result = await xsmbScraperService.scrapeToday();
            }

            console.log('✅ Cào dữ liệu XSMB thủ công hoàn thành');
            return result;

        } catch (error) {
            console.error('❌ Lỗi khi chạy cào dữ liệu XSMB thủ công:', error.message);
            throw error;
        } finally {
            this.isRunning = false;
        }
    }

    /**
     * Dừng scheduler
     */
    stop() {
        if (this.scheduledJob) {
            this.scheduledJob.stop();
            console.log('⏹️ XSMB Scheduler đã dừng');
        }
    }

    /**
     * Khởi động lại scheduler
     */
    restart() {
        this.stop();
        this.init();
    }

    /**
     * Lấy trạng thái scheduler
     */
    getStatus() {
        return {
            isRunning: this.isRunning,
            isScheduled: this.scheduledJob ? this.scheduledJob.running : false,
            lastRun: this.lastRun,
            nextRun: this.nextRun,
            timezone: 'Asia/Ho_Chi_Minh'
        };
    }

    /**
     * Kiểm tra xem có nên chạy scraper không (dựa trên thời gian)
     */
    shouldRunNow() {
        const now = new Date();
        const currentHour = now.getHours();
        const currentMinute = now.getMinutes();

        // Chạy từ 18:35 đến 19:00
        return currentHour === 18 && currentMinute >= 35 && currentMinute <= 59;
    }

    /**
     * Chạy scraper nếu đúng thời gian
     */
    async runIfScheduled() {
        if (this.shouldRunNow() && !this.isRunning) {
            console.log('⏰ Đã đến thời gian chạy XSMB Scraper...');
            await this.runDailyScraping();
        }
    }
}

module.exports = new XSMBSchedulerService();
