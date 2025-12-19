const cron = require('node-cron');
const xsmnScraperService = require('./xsmnScraper.service');
const XSMN = require('../models/xsmn.models');

class XSMNSchedulerService {
    constructor() {
        this.isRunning = false;
        this.scheduledJob = null;
        this.lastRun = null;
        this.nextRun = null;
        this.scheduledHour = 16;
        this.scheduledMinute = 14;
        this.timezone = 'Asia/Ho_Chi_Minh';
    }

    init() {
        console.log('🕐 Khởi tạo XSMN Scheduler...');

        let hour = parseInt(process.env.XSMN_SCRAPER_HOUR) || 16;
        let minute = parseInt(process.env.XSMN_SCRAPER_MINUTE) || 14;
        const timezone = process.env.XSMN_SCRAPER_TIMEZONE || 'Asia/Ho_Chi_Minh';

        if (isNaN(hour) || hour < 0 || hour > 23) {
            console.error(`❌ XSMN_SCRAPER_HOUR không hợp lệ: ${process.env.XSMN_SCRAPER_HOUR}, sử dụng giá trị mặc định: 16`);
            hour = 16;
        }
        if (isNaN(minute) || minute < 0 || minute > 59) {
            console.error(`❌ XSMN_SCRAPER_MINUTE không hợp lệ: ${process.env.XSMN_SCRAPER_MINUTE}, sử dụng giá trị mặc định: 14`);
            minute = 14;
        }

        this.scheduledHour = hour;
        this.scheduledMinute = minute;
        this.timezone = timezone;

        const cronExpression = `${minute} ${hour} * * *`;

        console.log('📅 Cấu hình XSMN scheduler:');
        console.log(`   - Hour: ${hour}`);
        console.log(`   - Minute: ${minute}`);
        console.log(`   - Timezone: ${timezone}`);
        console.log(`   - Cron: ${cronExpression}`);

        this.scheduledJob = cron.schedule(cronExpression, async () => {
            await this.runDailyScraping();
        }, {
            scheduled: true,
            timezone
        });

        this.calculateNextRun();
        console.log('✅ XSMN Scheduler đã được khởi tạo');
        console.log(`⏰ Thời gian chạy tiếp theo: ${this.nextRun}`);
        return this;
    }

    calculateNextRun() {
        const hour = this.scheduledHour || 16;
        const minute = this.scheduledMinute || 14;
        const timezone = this.timezone || 'Asia/Ho_Chi_Minh';

        const now = new Date();
        const nowStr = now.toLocaleString('en-US', { timeZone: timezone });
        const nowInTimezone = new Date(nowStr);

        const todayScheduled = new Date(nowInTimezone);
        todayScheduled.setHours(hour, minute, 0, 0);

        if (nowInTimezone >= todayScheduled) {
            todayScheduled.setDate(todayScheduled.getDate() + 1);
        }

        this.nextRun = todayScheduled.toLocaleString('vi-VN', {
            timeZone: timezone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    }

    async runDailyScraping() {
        if (this.isRunning) {
            console.log('⚠️ XSMN Scraper đang chạy, bỏ qua lần này...');
            return;
        }

        this.isRunning = true;
        this.lastRun = new Date();

        try {
            console.log('🚀 Bắt đầu cào dữ liệu XSMN hàng ngày...');

            const today = new Date();
            const existingResult = await XSMN.findByDate(today);
            if (existingResult && Array.isArray(existingResult) && existingResult.length > 0) {
                console.log('✅ Đã có dữ liệu XSMN cho ngày hôm nay, bỏ qua...');
                return;
            }

            const result = await xsmnScraperService.scrapeToday();
            if (result && result.success) {
                console.log('✅ Cào dữ liệu XSMN thành công');
            } else {
                console.log('❌ Cào dữ liệu XSMN thất bại');
            }

            this.calculateNextRun();
        } catch (error) {
            console.error('❌ Lỗi khi chạy cào dữ liệu XSMN hàng ngày:', error.message);
        } finally {
            this.isRunning = false;
        }
    }

    async runManualScraping(date = null) {
        if (this.isRunning) {
            throw new Error('XSMN Scraper đang chạy, vui lòng thử lại sau');
        }

        this.isRunning = true;
        this.lastRun = new Date();

        try {
            console.log(`🚀 Bắt đầu cào dữ liệu XSMN thủ công${date ? ` cho ngày ${date}` : ' cho ngày hiện tại'}...`);

            let result;
            if (date) {
                result = await xsmnScraperService.scrapeSpecificDate(date);
            } else {
                result = await xsmnScraperService.scrapeToday();
            }

            console.log('✅ Cào dữ liệu XSMN thủ công hoàn thành');
            return result;

        } catch (error) {
            console.error('❌ Lỗi khi chạy cào dữ liệu XSMN thủ công:', error.message);
            throw error;
        } finally {
            this.isRunning = false;
        }
    }

    stop() {
        if (this.scheduledJob) {
            this.scheduledJob.stop();
            console.log('⏹️ XSMN Scheduler đã dừng');
        }
    }

    restart() {
        this.stop();
        this.init();
    }

    getStatus() {
        return {
            isRunning: this.isRunning,
            isScheduled: this.scheduledJob ? this.scheduledJob.running : false,
            lastRun: this.lastRun,
            nextRun: this.nextRun,
            scheduledHour: this.scheduledHour,
            scheduledMinute: this.scheduledMinute,
            timezone: this.timezone
        };
    }

    shouldRunNow() {
        const timezone = this.timezone || 'Asia/Ho_Chi_Minh';
        const now = new Date();
        const nowInTimezone = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
        const currentHour = nowInTimezone.getHours();
        const currentMinute = nowInTimezone.getMinutes();

        const scheduledHour = this.scheduledHour || 16;
        const scheduledMinute = this.scheduledMinute || 14;

        return currentHour === scheduledHour && currentMinute >= scheduledMinute && currentMinute <= 59;
    }

    async runIfScheduled() {
        if (this.shouldRunNow() && !this.isRunning) {
            console.log('⏰ Đã đến thời gian chạy XSMN Scraper...');
            await this.runDailyScraping();
        }
    }
}

module.exports = new XSMNSchedulerService();
























