const cron = require('node-cron');
const { 
    calculateSpecialPrizeStats, 
    calculateSpecialPrizeStatsByWeek
} = require('../controllers/xsmbController');
const GiaiDacBietStats = require('../models/stats/giaiDacBietStats.model');
const GiaiDacBietTuanStats = require('../models/stats/giaiDacBietTuanStats.model');
const { calculateAndSaveSpecialDetailedStats } = require('./specialDetailedStats.service');

/**
 * Stats Scheduler Service
 * Tự động tính toán và lưu thống kê vào database theo lịch
 */
class StatsSchedulerService {
    constructor() {
        this.isRunningGiaiDacBiet = false;
        this.isRunningGiaiDacBietTuan = false;
        this.scheduledJobGiaiDacBiet = null;
        this.scheduledJobGiaiDacBietTuan = null;
        this.lastRunGiaiDacBiet = null;
        this.lastRunGiaiDacBietTuan = null;
        this.nextRunGiaiDacBiet = null;
        this.nextRunGiaiDacBietTuan = null;
        this.timezone = 'Asia/Ho_Chi_Minh';
        
        // Các khoảng thời gian cần tính toán cho giải đặc biệt
        this.giaiDacBietDays = [10, 20, 30, 60, 90, 180, 270, 365];
    }

    /**
     * Parse thời gian từ string "HH:MM" thành {hour, minute}
     */
    parseTime(timeString) {
        if (!timeString || typeof timeString !== 'string') {
            return null;
        }

        const parts = timeString.split(':');
        if (parts.length !== 2) {
            return null;
        }

        const hour = parseInt(parts[0], 10);
        const minute = parseInt(parts[1], 10);

        if (isNaN(hour) || hour < 0 || hour > 23) {
            return null;
        }
        if (isNaN(minute) || minute < 0 || minute > 59) {
            return null;
        }

        return { hour, minute };
    }

    /**
     * Khởi tạo scheduler cho thống kê giải đặc biệt
     */
    initGiaiDacBietScheduler() {
        const timeString = process.env.TIME_UPDATE_GIAIDACBIET || '18:40';
        let timeConfig = this.parseTime(timeString);

        if (!timeConfig) {
            console.error(`❌ TIME_UPDATE_GIAIDACBIET không hợp lệ: ${timeString}, sử dụng mặc định 18:40`);
            timeConfig = { hour: 18, minute: 40 };
        }

        const { hour, minute } = timeConfig;
        const cronExpression = `${minute} ${hour} * * *`;

        console.log(`📅 Cấu hình scheduler thống kê Giải Đặc Biệt:`);
        console.log(`   - Time: ${hour}:${minute.toString().padStart(2, '0')}`);
        console.log(`   - Timezone: ${this.timezone}`);
        console.log(`   - Cron: ${cronExpression}`);

        this.scheduledJobGiaiDacBiet = cron.schedule(cronExpression, async () => {
            await this.runGiaiDacBietUpdate();
        }, {
            scheduled: true,
            timezone: this.timezone
        });

        this.calculateNextRunGiaiDacBiet(hour, minute);
        console.log(`✅ Scheduler thống kê Giải Đặc Biệt đã được khởi tạo`);
        console.log(`⏰ Thời gian chạy tiếp theo: ${this.nextRunGiaiDacBiet}`);
    }

    /**
     * Khởi tạo scheduler cho thống kê giải đặc biệt tuần
     */
    initGiaiDacBietTuanScheduler() {
        const timeString = process.env.TIME_UPDATE_GIAIDACBIETTUAN || '18:42';
        let timeConfig = this.parseTime(timeString);

        if (!timeConfig) {
            console.error(`❌ TIME_UPDATE_GIAIDACBIETTUAN không hợp lệ: ${timeString}, sử dụng mặc định 18:42`);
            timeConfig = { hour: 18, minute: 42 };
        }

        const { hour, minute } = timeConfig;
        const cronExpression = `${minute} ${hour} * * *`;

        console.log(`📅 Cấu hình scheduler thống kê Giải Đặc Biệt Tuần:`);
        console.log(`   - Time: ${hour}:${minute.toString().padStart(2, '0')}`);
        console.log(`   - Timezone: ${this.timezone}`);
        console.log(`   - Cron: ${cronExpression}`);

        this.scheduledJobGiaiDacBietTuan = cron.schedule(cronExpression, async () => {
            await this.runGiaiDacBietTuanUpdate();
        }, {
            scheduled: true,
            timezone: this.timezone
        });

        this.calculateNextRunGiaiDacBietTuan(hour, minute);
        console.log(`✅ Scheduler thống kê Giải Đặc Biệt Tuần đã được khởi tạo`);
        console.log(`⏰ Thời gian chạy tiếp theo: ${this.nextRunGiaiDacBietTuan}`);
    }

    /**
     * Tính toán thời gian chạy tiếp theo cho giải đặc biệt
     */
    calculateNextRunGiaiDacBiet(hour, minute) {
        const now = new Date();
        const nowStr = now.toLocaleString('en-US', { timeZone: this.timezone });
        const nowInTimezone = new Date(nowStr);

        const todayScheduled = new Date(nowInTimezone);
        todayScheduled.setHours(hour, minute, 0, 0);

        if (nowInTimezone >= todayScheduled) {
            todayScheduled.setDate(todayScheduled.getDate() + 1);
        }

        this.nextRunGiaiDacBiet = todayScheduled.toLocaleString('vi-VN', {
            timeZone: this.timezone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    }

    /**
     * Tính toán thời gian chạy tiếp theo cho giải đặc biệt tuần
     */
    calculateNextRunGiaiDacBietTuan(hour, minute) {
        const now = new Date();
        const nowStr = now.toLocaleString('en-US', { timeZone: this.timezone });
        const nowInTimezone = new Date(nowStr);

        const todayScheduled = new Date(nowInTimezone);
        todayScheduled.setHours(hour, minute, 0, 0);

        if (nowInTimezone >= todayScheduled) {
            todayScheduled.setDate(todayScheduled.getDate() + 1);
        }

        this.nextRunGiaiDacBietTuan = todayScheduled.toLocaleString('vi-VN', {
            timeZone: this.timezone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    }

    /**
     * Chạy cập nhật thống kê giải đặc biệt cho tất cả các khoảng thời gian
     */
    async runGiaiDacBietUpdate() {
        if (this.isRunningGiaiDacBiet) {
            console.log('⚠️ Cập nhật thống kê Giải Đặc Biệt đang chạy, bỏ qua lần này...');
            return;
        }

        this.isRunningGiaiDacBiet = true;
        this.lastRunGiaiDacBiet = new Date();

        try {
            console.log('🚀 Bắt đầu cập nhật thống kê Giải Đặc Biệt...');
            const startTime = Date.now();

            // Tính toán song song cho tất cả các khoảng thời gian để tăng hiệu suất
            const updatePromises = this.giaiDacBietDays.map(async (days) => {
                try {
                    console.log(`  📊 Tính toán thống kê cho ${days} ngày...`);
                    
                    // Tính toán thống kê
                    const result = await calculateSpecialPrizeStats(days);

                    // Lưu vào database
                    await GiaiDacBietStats.findOneAndUpdate(
                        { days: Number(days) },
                        {
                            days: Number(days),
                            statistics: result.statistics,
                            metadata: result.metadata,
                            lastUpdated: new Date()
                        },
                        { upsert: true, new: true }
                    );

                    console.log(`  ✅ Đã cập nhật thống kê cho ${days} ngày`);

                    // Tính toán và lưu thống kê chi tiết (nếu có)
                    try {
                        await calculateAndSaveSpecialDetailedStats(days);
                        console.log(`  ✅ Đã tính toán thống kê chi tiết cho ${days} ngày`);
                    } catch (detailedError) {
                        console.warn(`  ⚠️ Không thể tính toán thống kê chi tiết cho ${days} ngày: ${detailedError.message}`);
                    }

                    return { days, success: true };
                } catch (error) {
                    console.error(`  ❌ Lỗi khi cập nhật thống kê cho ${days} ngày:`, error.message);
                    return { days, success: false, error: error.message };
                }
            });

            // Chờ tất cả các promise hoàn thành
            const results = await Promise.allSettled(updatePromises);
            
            const successCount = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
            const failCount = results.length - successCount;
            const duration = ((Date.now() - startTime) / 1000).toFixed(2);

            console.log(`✅ Hoàn thành cập nhật thống kê Giải Đặc Biệt:`);
            console.log(`   - Thành công: ${successCount}/${results.length}`);
            console.log(`   - Thất bại: ${failCount}`);
            console.log(`   - Thời gian: ${duration}s`);

            // Tính toán thời gian chạy tiếp theo
            const timeString = process.env.TIME_UPDATE_GIAIDACBIET || '18:40';
            const timeConfig = this.parseTime(timeString) || { hour: 18, minute: 40 };
            this.calculateNextRunGiaiDacBiet(timeConfig.hour, timeConfig.minute);

        } catch (error) {
            console.error('❌ Lỗi khi chạy cập nhật thống kê Giải Đặc Biệt:', error);
        } finally {
            this.isRunningGiaiDacBiet = false;
        }
    }

    /**
     * Chạy cập nhật thống kê giải đặc biệt tuần
     */
    async runGiaiDacBietTuanUpdate() {
        if (this.isRunningGiaiDacBietTuan) {
            console.log('⚠️ Cập nhật thống kê Giải Đặc Biệt Tuần đang chạy, bỏ qua lần này...');
            return;
        }

        this.isRunningGiaiDacBietTuan = true;
        this.lastRunGiaiDacBietTuan = new Date();

        try {
            console.log('🚀 Bắt đầu cập nhật thống kê Giải Đặc Biệt Tuần...');
            const startTime = Date.now();

            const now = new Date();
            const currentMonth = now.getMonth() + 1;
            const currentYear = now.getFullYear();
            
            // Tính toán cho tháng hiện tại và tháng trước
            const monthsToUpdate = [
                { month: currentMonth, year: currentYear },
                { month: currentMonth === 1 ? 12 : currentMonth - 1, year: currentMonth === 1 ? currentYear - 1 : currentYear }
            ];

            const updatePromises = monthsToUpdate.map(async ({ month, year }) => {
                try {
                    console.log(`  📊 Tính toán thống kê cho tháng ${month}/${year}...`);

                    // Tính toán thống kê
                    const result = await calculateSpecialPrizeStatsByWeek(month, year);

                    // Lưu vào database
                    await GiaiDacBietTuanStats.findOneAndUpdate(
                        { month: Number(month), year: Number(year) },
                        {
                            month: Number(month),
                            year: Number(year),
                            statistics: result.statistics,
                            metadata: result.metadata,
                            lastUpdated: new Date()
                        },
                        { upsert: true, new: true }
                    );

                    console.log(`  ✅ Đã cập nhật thống kê cho tháng ${month}/${year}`);
                    return { month, year, success: true };
                } catch (error) {
                    console.error(`  ❌ Lỗi khi cập nhật thống kê cho tháng ${month}/${year}:`, error.message);
                    return { month, year, success: false, error: error.message };
                }
            });

            // Chờ tất cả các promise hoàn thành
            const results = await Promise.allSettled(updatePromises);
            
            const successCount = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
            const failCount = results.length - successCount;
            const duration = ((Date.now() - startTime) / 1000).toFixed(2);

            console.log(`✅ Hoàn thành cập nhật thống kê Giải Đặc Biệt Tuần:`);
            console.log(`   - Thành công: ${successCount}/${results.length}`);
            console.log(`   - Thất bại: ${failCount}`);
            console.log(`   - Thời gian: ${duration}s`);

            // Tính toán thời gian chạy tiếp theo
            const timeString = process.env.TIME_UPDATE_GIAIDACBIETTUAN || '18:42';
            const timeConfig = this.parseTime(timeString) || { hour: 18, minute: 42 };
            this.calculateNextRunGiaiDacBietTuan(timeConfig.hour, timeConfig.minute);

        } catch (error) {
            console.error('❌ Lỗi khi chạy cập nhật thống kê Giải Đặc Biệt Tuần:', error);
        } finally {
            this.isRunningGiaiDacBietTuan = false;
        }
    }

    /**
     * Khởi tạo tất cả schedulers
     */
    init() {
        console.log('🕐 Khởi tạo Stats Schedulers...');
        
        this.initGiaiDacBietScheduler();
        this.initGiaiDacBietTuanScheduler();
        
        console.log('✅ Tất cả Stats Schedulers đã được khởi tạo');
        
        return this;
    }

    /**
     * Dừng tất cả schedulers
     */
    stop() {
        if (this.scheduledJobGiaiDacBiet) {
            this.scheduledJobGiaiDacBiet.stop();
            console.log('⏹️ Scheduler thống kê Giải Đặc Biệt đã dừng');
        }
        if (this.scheduledJobGiaiDacBietTuan) {
            this.scheduledJobGiaiDacBietTuan.stop();
            console.log('⏹️ Scheduler thống kê Giải Đặc Biệt Tuần đã dừng');
        }
    }

    /**
     * Khởi động lại schedulers
     */
    restart() {
        this.stop();
        this.init();
    }

    /**
     * Lấy trạng thái schedulers
     */
    getStatus() {
        return {
            giaiDacBiet: {
                isRunning: this.isRunningGiaiDacBiet,
                isScheduled: this.scheduledJobGiaiDacBiet ? this.scheduledJobGiaiDacBiet.running : false,
                lastRun: this.lastRunGiaiDacBiet,
                nextRun: this.nextRunGiaiDacBiet
            },
            giaiDacBietTuan: {
                isRunning: this.isRunningGiaiDacBietTuan,
                isScheduled: this.scheduledJobGiaiDacBietTuan ? this.scheduledJobGiaiDacBietTuan.running : false,
                lastRun: this.lastRunGiaiDacBietTuan,
                nextRun: this.nextRunGiaiDacBietTuan
            }
        };
    }

    /**
     * Chạy cập nhật thủ công cho giải đặc biệt
     */
    async runManualGiaiDacBietUpdate() {
        if (this.isRunningGiaiDacBiet) {
            throw new Error('Cập nhật thống kê Giải Đặc Biệt đang chạy, vui lòng thử lại sau');
        }
        await this.runGiaiDacBietUpdate();
    }

    /**
     * Chạy cập nhật thủ công cho giải đặc biệt tuần
     */
    async runManualGiaiDacBietTuanUpdate() {
        if (this.isRunningGiaiDacBietTuan) {
            throw new Error('Cập nhật thống kê Giải Đặc Biệt Tuần đang chạy, vui lòng thử lại sau');
        }
        await this.runGiaiDacBietTuanUpdate();
    }
}

module.exports = new StatsSchedulerService();

