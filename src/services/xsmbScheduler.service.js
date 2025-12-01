const cron = require('node-cron');
const xsmbScraperService = require('./xsmbScraper.service');
const XSMB = require('../models/xsmb.model');

class XSMBSchedulerService {
    constructor() {
        this.isRunning = false;
        this.scheduledJob = null;
        this.lastRun = null;
        this.nextRun = null;
        this.scheduledHour = 18;
        this.scheduledMinute = 35;
        this.timezone = 'Asia/Ho_Chi_Minh';
    }

    /**
     * Khởi tạo scheduler
     */
    init() {
        console.log('🕐 Khởi tạo XSMB Scheduler...');

        // Đọc cấu hình từ environment variables
        let hour = parseInt(process.env.XSMB_SCRAPER_HOUR) || 18;
        let minute = parseInt(process.env.XSMB_SCRAPER_MINUTE) || 35;
        const timezone = process.env.XSMB_SCRAPER_TIMEZONE || 'Asia/Ho_Chi_Minh';

        // Validate giá trị
        if (isNaN(hour) || hour < 0 || hour > 23) {
            console.error(`❌ XSMB_SCRAPER_HOUR không hợp lệ: ${process.env.XSMB_SCRAPER_HOUR}, sử dụng giá trị mặc định: 18`);
            hour = 18;
        }
        if (isNaN(minute) || minute < 0 || minute > 59) {
            console.error(`❌ XSMB_SCRAPER_MINUTE không hợp lệ: ${process.env.XSMB_SCRAPER_MINUTE}, sử dụng giá trị mặc định: 35`);
            minute = 35;
        }

        // Lưu cấu hình để sử dụng sau
        this.scheduledHour = hour;
        this.scheduledMinute = minute;
        this.timezone = timezone;

        // Tạo cron expression từ cấu hình
        const cronExpression = `${minute} ${hour} * * *`;

        console.log(`📅 Cấu hình scheduler:`);
        console.log(`   - Hour: ${hour}`);
        console.log(`   - Minute: ${minute}`);
        console.log(`   - Timezone: ${timezone}`);
        console.log(`   - Cron: ${cronExpression}`);

        // Lên lịch chạy hàng ngày theo cấu hình
        this.scheduledJob = cron.schedule(cronExpression, async () => {
            await this.runDailyScraping();
        }, {
            scheduled: true,
            timezone: timezone
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
        // Sử dụng giá trị từ cấu hình thay vì hardcode
        const hour = this.scheduledHour || 18;
        const minute = this.scheduledMinute || 35;
        const timezone = this.timezone || 'Asia/Ho_Chi_Minh';

        // Lấy thời gian hiện tại theo timezone
        const now = new Date();
        const nowStr = now.toLocaleString('en-US', { timeZone: timezone });
        const nowInTimezone = new Date(nowStr);

        // Tạo thời gian scheduled cho hôm nay
        const todayScheduled = new Date(nowInTimezone);
        todayScheduled.setHours(hour, minute, 0, 0);

        // Nếu đã qua thời gian hôm nay, lên lịch cho ngày mai
        if (nowInTimezone >= todayScheduled) {
            todayScheduled.setDate(todayScheduled.getDate() + 1);
        }

        // Format để hiển thị
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

            if (existingResult) {
                console.log('✅ Đã có dữ liệu cho ngày hôm nay, bỏ qua...');
                return;
            }

            // Cào dữ liệu cho ngày hiện tại
            const result = await xsmbScraperService.scrapeToday();

            if (result.success) {
                console.log('✅ Cào dữ liệu XSMB thành công');
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
            scheduledHour: this.scheduledHour,
            scheduledMinute: this.scheduledMinute,
            timezone: this.timezone
        };
    }

    /**
     * Kiểm tra xem có nên chạy scraper không (dựa trên thời gian)
     */
    shouldRunNow() {
        const timezone = this.timezone || 'Asia/Ho_Chi_Minh';
        const now = new Date();
        
        // Lấy thời gian hiện tại theo timezone đã cấu hình
        const nowInTimezone = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
        const currentHour = nowInTimezone.getHours();
        const currentMinute = nowInTimezone.getMinutes();

        const scheduledHour = this.scheduledHour || 18;
        const scheduledMinute = this.scheduledMinute || 35;

        // Chạy trong khoảng từ scheduled time đến cuối giờ
        return currentHour === scheduledHour && currentMinute >= scheduledMinute && currentMinute <= 59;
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
