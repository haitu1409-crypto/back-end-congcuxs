const cron = require('node-cron');
const { 
    calculateSpecialPrizeStats, 
    calculateSpecialPrizeStatsByWeek,
    calculateDauDuoiStats,
    calculateDauDuoiStatsByDate,
    calculateLoGanStats,
    calculateTanSuatLotoStats,
    calculateTanSuatLoCapStats
} = require('../controllers/xsmbController');
const GiaiDacBietStats = require('../models/stats/giaiDacBietStats.model');
const GiaiDacBietTuanStats = require('../models/stats/giaiDacBietTuanStats.model');
const DauDuoiStats = require('../models/stats/dauDuoiStats.model');
const LoGanStats = require('../models/stats/loganStats.model');
const TanSuatLotoStats = require('../models/stats/tanSuatLotoStats.model');
const TanSuatLoCapStats = require('../models/stats/tanSuatLoCapStats.model');
const { calculateAndSaveSpecialDetailedStats } = require('./specialDetailedStats.service');

/**
 * Stats Scheduler Service
 * Tự động tính toán và lưu thống kê vào database theo lịch
 */
class StatsSchedulerService {
    constructor() {
        this.isRunningGiaiDacBiet = false;
        this.isRunningGiaiDacBietTuan = false;
        this.isRunningDauDuoi = false;
        this.isRunningLoGan = false;
        this.isRunningTanSuatLoto = false;
        this.isRunningTanSuatLoCap = false;
        this.scheduledJobGiaiDacBiet = null;
        this.scheduledJobGiaiDacBietTuan = null;
        this.scheduledJobDauDuoi = null;
        this.scheduledJobLoGan = null;
        this.scheduledJobTanSuatLoto = null;
        this.scheduledJobTanSuatLoCap = null;
        this.lastRunGiaiDacBiet = null;
        this.lastRunGiaiDacBietTuan = null;
        this.lastRunDauDuoi = null;
        this.lastRunLoGan = null;
        this.lastRunTanSuatLoto = null;
        this.lastRunTanSuatLoCap = null;
        this.nextRunGiaiDacBiet = null;
        this.nextRunGiaiDacBietTuan = null;
        this.nextRunDauDuoi = null;
        this.nextRunLoGan = null;
        this.nextRunTanSuatLoto = null;
        this.nextRunTanSuatLoCap = null;
        this.timezone = 'Asia/Ho_Chi_Minh';
        
        // Các khoảng thời gian cần tính toán cho giải đặc biệt
        this.giaiDacBietDays = [10, 20, 30, 60, 90, 180, 270, 365];
        // Các khoảng thời gian cần tính toán cho đầu đuôi, tần suất lô tô và lô cặp
        this.dauDuoiDays = [30, 60, 90, 120, 180, 270, 365];
        this.tanSuatDays = [30, 60, 90, 120, 180, 365];
        // Các khoảng thời gian cần tính toán cho lô gan
        this.loGanDays = [6, 7, 14, 30, 60];
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
     * Khởi tạo scheduler cho thống kê Đầu Đuôi
     */
    initDauDuoiScheduler() {
        const timeString = process.env.TIME_UPDATE_THONGKEDAUDUOI || '18:38';
        let timeConfig = this.parseTime(timeString);

        if (!timeConfig) {
            console.error(`❌ TIME_UPDATE_THONGKEDAUDUOI không hợp lệ: ${timeString}, sử dụng mặc định 18:38`);
            timeConfig = { hour: 18, minute: 38 };
        }

        const { hour, minute } = timeConfig;
        const cronExpression = `${minute} ${hour} * * *`;

        console.log(`📅 Cấu hình scheduler thống kê Đầu Đuôi:`);
        console.log(`   - Time: ${hour}:${minute.toString().padStart(2, '0')}`);
        console.log(`   - Timezone: ${this.timezone}`);
        console.log(`   - Cron: ${cronExpression}`);

        this.scheduledJobDauDuoi = cron.schedule(cronExpression, async () => {
            await this.runDauDuoiUpdate();
        }, {
            scheduled: true,
            timezone: this.timezone
        });

        this.calculateNextRunDauDuoi(hour, minute);
        console.log(`✅ Scheduler thống kê Đầu Đuôi đã được khởi tạo`);
        console.log(`⏰ Thời gian chạy tiếp theo: ${this.nextRunDauDuoi}`);
    }

    /**
     * Tính toán thời gian chạy tiếp theo cho đầu đuôi
     */
    calculateNextRunDauDuoi(hour, minute) {
        const now = new Date();
        const nowStr = now.toLocaleString('en-US', { timeZone: this.timezone });
        const nowInTimezone = new Date(nowStr);

        const todayScheduled = new Date(nowInTimezone);
        todayScheduled.setHours(hour, minute, 0, 0);

        if (nowInTimezone >= todayScheduled) {
            todayScheduled.setDate(todayScheduled.getDate() + 1);
        }

        this.nextRunDauDuoi = todayScheduled.toLocaleString('vi-VN', {
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
     * Chạy cập nhật thống kê Đầu Đuôi cho tất cả các khoảng thời gian
     */
    async runDauDuoiUpdate() {
        if (this.isRunningDauDuoi) {
            console.log('⚠️ Cập nhật thống kê Đầu Đuôi đang chạy, bỏ qua lần này...');
            return;
        }

        this.isRunningDauDuoi = true;
        this.lastRunDauDuoi = new Date();

        try {
            console.log('🚀 Bắt đầu cập nhật thống kê Đầu Đuôi...');
            const startTime = Date.now();

            // Tính toán song song cho tất cả các khoảng thời gian để tăng hiệu suất
            const updatePromises = this.dauDuoiDays.map(async (days) => {
                try {
                    console.log(`  📊 Tính toán thống kê Đầu Đuôi cho ${days} ngày...`);
                    
                    // Tính toán thống kê chính (dauStats, duoiStats, specialDauDuoiStats)
                    const result = await calculateDauDuoiStats(days);
                    
                    // Tính toán thống kê theo ngày (dauStatsByDate, duoiStatsByDate)
                    const resultByDate = await calculateDauDuoiStatsByDate(days);

                    // Lưu vào database (kết hợp cả 2 kết quả)
                    await DauDuoiStats.findOneAndUpdate(
                        { days: Number(days) },
                        {
                            days: Number(days),
                            dauStats: result.dauStats,
                            duoiStats: result.duoiStats,
                            specialDauDuoiStats: result.specialDauDuoiStats,
                            dauStatsByDate: resultByDate.dauStatsByDate,
                            duoiStatsByDate: resultByDate.duoiStatsByDate,
                            metadata: {
                                ...result.metadata,
                                ...resultByDate.metadata
                            },
                            lastUpdated: new Date()
                        },
                        { upsert: true, new: true }
                    );

                    console.log(`  ✅ Đã cập nhật thống kê Đầu Đuôi cho ${days} ngày`);
                    return { days, success: true };
                } catch (error) {
                    console.error(`  ❌ Lỗi khi cập nhật thống kê Đầu Đuôi cho ${days} ngày:`, error.message);
                    return { days, success: false, error: error.message };
                }
            });

            // Chờ tất cả các promise hoàn thành
            const results = await Promise.allSettled(updatePromises);
            
            const successCount = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
            const failCount = results.length - successCount;
            const duration = ((Date.now() - startTime) / 1000).toFixed(2);

            console.log(`✅ Hoàn thành cập nhật thống kê Đầu Đuôi:`);
            console.log(`   - Thành công: ${successCount}/${results.length}`);
            console.log(`   - Thất bại: ${failCount}`);
            console.log(`   - Thời gian: ${duration}s`);

            // Tính toán thời gian chạy tiếp theo
            const timeString = process.env.TIME_UPDATE_THONGKEDAUDUOI || '18:38';
            const timeConfig = this.parseTime(timeString) || { hour: 18, minute: 38 };
            this.calculateNextRunDauDuoi(timeConfig.hour, timeConfig.minute);

        } catch (error) {
            console.error('❌ Lỗi khi chạy cập nhật thống kê Đầu Đuôi:', error);
        } finally {
            this.isRunningDauDuoi = false;
        }
    }

    /**
     * Khởi tạo scheduler cho thống kê Lô Gan
     */
    initLoGanScheduler() {
        const timeString = process.env.TIME_UPDATE_THONGKELOGAN || '18:39';
        let timeConfig = this.parseTime(timeString);

        if (!timeConfig) {
            console.error(`❌ TIME_UPDATE_THONGKELOGAN không hợp lệ: ${timeString}, sử dụng mặc định 18:39`);
            timeConfig = { hour: 18, minute: 39 };
        }

        const { hour, minute } = timeConfig;
        const cronExpression = `${minute} ${hour} * * *`;

        console.log(`📅 Cấu hình scheduler thống kê Lô Gan:`);
        console.log(`   - Time: ${hour}:${minute.toString().padStart(2, '0')}`);
        console.log(`   - Timezone: ${this.timezone}`);
        console.log(`   - Cron: ${cronExpression}`);

        this.scheduledJobLoGan = cron.schedule(cronExpression, async () => {
            await this.runLoGanUpdate();
        }, {
            scheduled: true,
            timezone: this.timezone
        });

        this.calculateNextRunLoGan(hour, minute);
        console.log(`✅ Scheduler thống kê Lô Gan đã được khởi tạo`);
        console.log(`⏰ Thời gian chạy tiếp theo: ${this.nextRunLoGan}`);
    }

    /**
     * Tính toán thời gian chạy tiếp theo cho lô gan
     */
    calculateNextRunLoGan(hour, minute) {
        const now = new Date();
        const nowStr = now.toLocaleString('en-US', { timeZone: this.timezone });
        const nowInTimezone = new Date(nowStr);

        const todayScheduled = new Date(nowInTimezone);
        todayScheduled.setHours(hour, minute, 0, 0);

        if (nowInTimezone >= todayScheduled) {
            todayScheduled.setDate(todayScheduled.getDate() + 1);
        }

        this.nextRunLoGan = todayScheduled.toLocaleString('vi-VN', {
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
     * Chạy cập nhật thống kê Lô Gan cho tất cả các khoảng thời gian
     */
    async runLoGanUpdate() {
        if (this.isRunningLoGan) {
            console.log('⚠️ Cập nhật thống kê Lô Gan đang chạy, bỏ qua lần này...');
            return;
        }

        this.isRunningLoGan = true;
        this.lastRunLoGan = new Date();

        try {
            console.log('🚀 Bắt đầu cập nhật thống kê Lô Gan...');
            const startTime = Date.now();

            // Tính toán song song cho tất cả các khoảng thời gian để tăng hiệu suất
            const updatePromises = this.loGanDays.map(async (days) => {
                try {
                    console.log(`  📊 Tính toán thống kê Lô Gan cho ${days} ngày...`);
                    
                    // Tính toán thống kê
                    const result = await calculateLoGanStats(days);

                    // Xác định filterType dựa trên days
                    const filterType = days === 6 ? 'below-7' :
                        days === 7 ? '7-14' :
                            days === 14 ? '14-28' :
                                days === 30 ? '30' : '60';

                    // Lưu vào database
                    await LoGanStats.findOneAndUpdate(
                        { filterType },
                        {
                            filterType,
                            description: result.metadata?.description || `${days} ngày`,
                            statistics: result.statistics,
                            metadata: result.metadata,
                            lastUpdated: new Date()
                        },
                        { upsert: true, new: true }
                    );

                    console.log(`  ✅ Đã cập nhật thống kê Lô Gan cho ${days} ngày (filterType: ${filterType})`);
                    return { days, filterType, success: true };
                } catch (error) {
                    console.error(`  ❌ Lỗi khi cập nhật thống kê Lô Gan cho ${days} ngày:`, error.message);
                    return { days, success: false, error: error.message };
                }
            });

            // Chờ tất cả các promise hoàn thành
            const results = await Promise.allSettled(updatePromises);
            
            const successCount = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
            const failCount = results.length - successCount;
            const duration = ((Date.now() - startTime) / 1000).toFixed(2);

            console.log(`✅ Hoàn thành cập nhật thống kê Lô Gan:`);
            console.log(`   - Thành công: ${successCount}/${results.length}`);
            console.log(`   - Thất bại: ${failCount}`);
            console.log(`   - Thời gian: ${duration}s`);

            // Tính toán thời gian chạy tiếp theo
            const timeString = process.env.TIME_UPDATE_THONGKELOGAN || '18:39';
            const timeConfig = this.parseTime(timeString) || { hour: 18, minute: 39 };
            this.calculateNextRunLoGan(timeConfig.hour, timeConfig.minute);

        } catch (error) {
            console.error('❌ Lỗi khi chạy cập nhật thống kê Lô Gan:', error);
        } finally {
            this.isRunningLoGan = false;
        }
    }

    /**
     * Khởi tạo scheduler cho thống kê Tần Suất Lô Tô
     */
    initTanSuatLotoScheduler() {
        const timeString = process.env.TIME_UPDATE_TANSUATLOTO || '18:44';
        let timeConfig = this.parseTime(timeString);

        if (!timeConfig) {
            console.error(`❌ TIME_UPDATE_TANSUATLOTO không hợp lệ: ${timeString}, sử dụng mặc định 18:44`);
            timeConfig = { hour: 18, minute: 44 };
        }

        const { hour, minute } = timeConfig;
        const cronExpression = `${minute} ${hour} * * *`;

        console.log(`📅 Cấu hình scheduler thống kê Tần Suất Lô Tô:`);
        console.log(`   - Time: ${hour}:${minute.toString().padStart(2, '0')}`);
        console.log(`   - Timezone: ${this.timezone}`);
        console.log(`   - Cron: ${cronExpression}`);

        this.scheduledJobTanSuatLoto = cron.schedule(cronExpression, async () => {
            await this.runTanSuatLotoUpdate();
        }, {
            scheduled: true,
            timezone: this.timezone
        });

        this.calculateNextRunTanSuatLoto(hour, minute);
        console.log(`✅ Scheduler thống kê Tần Suất Lô Tô đã được khởi tạo`);
        console.log(`⏰ Thời gian chạy tiếp theo: ${this.nextRunTanSuatLoto}`);
    }

    /**
     * Khởi tạo scheduler cho thống kê Tần Suất Lô Cặp
     */
    initTanSuatLoCapScheduler() {
        const timeString = process.env.TIME_UPDATE_TANSUATLOCAP || '18:46';
        let timeConfig = this.parseTime(timeString);

        if (!timeConfig) {
            console.error(`❌ TIME_UPDATE_TANSUATLOCAP không hợp lệ: ${timeString}, sử dụng mặc định 18:46`);
            timeConfig = { hour: 18, minute: 46 };
        }

        const { hour, minute } = timeConfig;
        const cronExpression = `${minute} ${hour} * * *`;

        console.log(`📅 Cấu hình scheduler thống kê Tần Suất Lô Cặp:`);
        console.log(`   - Time: ${hour}:${minute.toString().padStart(2, '0')}`);
        console.log(`   - Timezone: ${this.timezone}`);
        console.log(`   - Cron: ${cronExpression}`);

        this.scheduledJobTanSuatLoCap = cron.schedule(cronExpression, async () => {
            await this.runTanSuatLoCapUpdate();
        }, {
            scheduled: true,
            timezone: this.timezone
        });

        this.calculateNextRunTanSuatLoCap(hour, minute);
        console.log(`✅ Scheduler thống kê Tần Suất Lô Cặp đã được khởi tạo`);
        console.log(`⏰ Thời gian chạy tiếp theo: ${this.nextRunTanSuatLoCap}`);
    }

    /**
     * Tính toán thời gian chạy tiếp theo cho tần suất lô tô
     */
    calculateNextRunTanSuatLoto(hour, minute) {
        const now = new Date();
        const nowStr = now.toLocaleString('en-US', { timeZone: this.timezone });
        const nowInTimezone = new Date(nowStr);

        const todayScheduled = new Date(nowInTimezone);
        todayScheduled.setHours(hour, minute, 0, 0);

        if (nowInTimezone >= todayScheduled) {
            todayScheduled.setDate(todayScheduled.getDate() + 1);
        }

        this.nextRunTanSuatLoto = todayScheduled.toLocaleString('vi-VN', {
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
     * Tính toán thời gian chạy tiếp theo cho tần suất lô cặp
     */
    calculateNextRunTanSuatLoCap(hour, minute) {
        const now = new Date();
        const nowStr = now.toLocaleString('en-US', { timeZone: this.timezone });
        const nowInTimezone = new Date(nowStr);

        const todayScheduled = new Date(nowInTimezone);
        todayScheduled.setHours(hour, minute, 0, 0);

        if (nowInTimezone >= todayScheduled) {
            todayScheduled.setDate(todayScheduled.getDate() + 1);
        }

        this.nextRunTanSuatLoCap = todayScheduled.toLocaleString('vi-VN', {
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
     * Chạy cập nhật thống kê Tần Suất Lô Tô cho tất cả các khoảng thời gian
     */
    async runTanSuatLotoUpdate() {
        if (this.isRunningTanSuatLoto) {
            console.log('⚠️ Cập nhật thống kê Tần Suất Lô Tô đang chạy, bỏ qua lần này...');
            return;
        }

        this.isRunningTanSuatLoto = true;
        this.lastRunTanSuatLoto = new Date();

        try {
            console.log('🚀 Bắt đầu cập nhật thống kê Tần Suất Lô Tô...');
            const startTime = Date.now();

            // Tính toán song song cho tất cả các khoảng thời gian để tăng hiệu suất
            const updatePromises = this.tanSuatDays.map(async (days) => {
                try {
                    console.log(`  📊 Tính toán thống kê Tần Suất Lô Tô cho ${days} ngày...`);
                    
                    // Tính toán thống kê
                    const result = await calculateTanSuatLotoStats(days);

                    // Lưu vào database
                    await TanSuatLotoStats.findOneAndUpdate(
                        { days: Number(days) },
                        {
                            days: Number(days),
                            statistics: result.statistics,
                            metadata: result.metadata,
                            lastUpdated: new Date()
                        },
                        { upsert: true, new: true }
                    );

                    console.log(`  ✅ Đã cập nhật thống kê Tần Suất Lô Tô cho ${days} ngày`);
                    return { days, success: true };
                } catch (error) {
                    console.error(`  ❌ Lỗi khi cập nhật thống kê Tần Suất Lô Tô cho ${days} ngày:`, error.message);
                    return { days, success: false, error: error.message };
                }
            });

            // Chờ tất cả các promise hoàn thành
            const results = await Promise.allSettled(updatePromises);
            
            const successCount = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
            const failCount = results.length - successCount;
            const duration = ((Date.now() - startTime) / 1000).toFixed(2);

            console.log(`✅ Hoàn thành cập nhật thống kê Tần Suất Lô Tô:`);
            console.log(`   - Thành công: ${successCount}/${results.length}`);
            console.log(`   - Thất bại: ${failCount}`);
            console.log(`   - Thời gian: ${duration}s`);

            // Tính toán thời gian chạy tiếp theo
            const timeString = process.env.TIME_UPDATE_TANSUATLOTO || '18:44';
            const timeConfig = this.parseTime(timeString) || { hour: 18, minute: 44 };
            this.calculateNextRunTanSuatLoto(timeConfig.hour, timeConfig.minute);

        } catch (error) {
            console.error('❌ Lỗi khi chạy cập nhật thống kê Tần Suất Lô Tô:', error);
        } finally {
            this.isRunningTanSuatLoto = false;
        }
    }

    /**
     * Chạy cập nhật thống kê Tần Suất Lô Cặp cho tất cả các khoảng thời gian
     */
    async runTanSuatLoCapUpdate() {
        if (this.isRunningTanSuatLoCap) {
            console.log('⚠️ Cập nhật thống kê Tần Suất Lô Cặp đang chạy, bỏ qua lần này...');
            return;
        }

        this.isRunningTanSuatLoCap = true;
        this.lastRunTanSuatLoCap = new Date();

        try {
            console.log('🚀 Bắt đầu cập nhật thống kê Tần Suất Lô Cặp...');
            const startTime = Date.now();

            // Tính toán song song cho tất cả các khoảng thời gian để tăng hiệu suất
            const updatePromises = this.tanSuatDays.map(async (days) => {
                try {
                    console.log(`  📊 Tính toán thống kê Tần Suất Lô Cặp cho ${days} ngày...`);
                    
                    // Tính toán thống kê
                    const result = await calculateTanSuatLoCapStats(days);

                    // Lưu vào database
                    await TanSuatLoCapStats.findOneAndUpdate(
                        { days: Number(days) },
                        {
                            days: Number(days),
                            statistics: result.statistics,
                            metadata: result.metadata,
                            lastUpdated: new Date()
                        },
                        { upsert: true, new: true }
                    );

                    console.log(`  ✅ Đã cập nhật thống kê Tần Suất Lô Cặp cho ${days} ngày`);
                    return { days, success: true };
                } catch (error) {
                    console.error(`  ❌ Lỗi khi cập nhật thống kê Tần Suất Lô Cặp cho ${days} ngày:`, error.message);
                    return { days, success: false, error: error.message };
                }
            });

            // Chờ tất cả các promise hoàn thành
            const results = await Promise.allSettled(updatePromises);
            
            const successCount = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
            const failCount = results.length - successCount;
            const duration = ((Date.now() - startTime) / 1000).toFixed(2);

            console.log(`✅ Hoàn thành cập nhật thống kê Tần Suất Lô Cặp:`);
            console.log(`   - Thành công: ${successCount}/${results.length}`);
            console.log(`   - Thất bại: ${failCount}`);
            console.log(`   - Thời gian: ${duration}s`);

            // Tính toán thời gian chạy tiếp theo
            const timeString = process.env.TIME_UPDATE_TANSUATLOCAP || '18:46';
            const timeConfig = this.parseTime(timeString) || { hour: 18, minute: 46 };
            this.calculateNextRunTanSuatLoCap(timeConfig.hour, timeConfig.minute);

        } catch (error) {
            console.error('❌ Lỗi khi chạy cập nhật thống kê Tần Suất Lô Cặp:', error);
        } finally {
            this.isRunningTanSuatLoCap = false;
        }
    }

    /**
     * Khởi tạo tất cả schedulers
     */
    init() {
        console.log('🕐 Khởi tạo Stats Schedulers...');
        
        this.initGiaiDacBietScheduler();
        this.initGiaiDacBietTuanScheduler();
        this.initDauDuoiScheduler();
        this.initLoGanScheduler();
        this.initTanSuatLotoScheduler();
        this.initTanSuatLoCapScheduler();
        
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
        if (this.scheduledJobDauDuoi) {
            this.scheduledJobDauDuoi.stop();
            console.log('⏹️ Scheduler thống kê Đầu Đuôi đã dừng');
        }
        if (this.scheduledJobLoGan) {
            this.scheduledJobLoGan.stop();
            console.log('⏹️ Scheduler thống kê Lô Gan đã dừng');
        }
        if (this.scheduledJobTanSuatLoto) {
            this.scheduledJobTanSuatLoto.stop();
            console.log('⏹️ Scheduler thống kê Tần Suất Lô Tô đã dừng');
        }
        if (this.scheduledJobTanSuatLoCap) {
            this.scheduledJobTanSuatLoCap.stop();
            console.log('⏹️ Scheduler thống kê Tần Suất Lô Cặp đã dừng');
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
            },
            dauDuoi: {
                isRunning: this.isRunningDauDuoi,
                isScheduled: this.scheduledJobDauDuoi ? this.scheduledJobDauDuoi.running : false,
                lastRun: this.lastRunDauDuoi,
                nextRun: this.nextRunDauDuoi
            },
            loGan: {
                isRunning: this.isRunningLoGan,
                isScheduled: this.scheduledJobLoGan ? this.scheduledJobLoGan.running : false,
                lastRun: this.lastRunLoGan,
                nextRun: this.nextRunLoGan
            },
            tanSuatLoto: {
                isRunning: this.isRunningTanSuatLoto,
                isScheduled: this.scheduledJobTanSuatLoto ? this.scheduledJobTanSuatLoto.running : false,
                lastRun: this.lastRunTanSuatLoto,
                nextRun: this.nextRunTanSuatLoto
            },
            tanSuatLoCap: {
                isRunning: this.isRunningTanSuatLoCap,
                isScheduled: this.scheduledJobTanSuatLoCap ? this.scheduledJobTanSuatLoCap.running : false,
                lastRun: this.lastRunTanSuatLoCap,
                nextRun: this.nextRunTanSuatLoCap
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

    /**
     * Chạy cập nhật thủ công cho tần suất lô tô
     */
    async runManualTanSuatLotoUpdate() {
        if (this.isRunningTanSuatLoto) {
            throw new Error('Cập nhật thống kê Tần Suất Lô Tô đang chạy, vui lòng thử lại sau');
        }
        await this.runTanSuatLotoUpdate();
    }

    /**
     * Chạy cập nhật thủ công cho tần suất lô cặp
     */
    async runManualTanSuatLoCapUpdate() {
        if (this.isRunningTanSuatLoCap) {
            throw new Error('Cập nhật thống kê Tần Suất Lô Cặp đang chạy, vui lòng thử lại sau');
        }
        await this.runTanSuatLoCapUpdate();
    }

    /**
     * Chạy cập nhật thủ công cho đầu đuôi
     */
    async runManualDauDuoiUpdate() {
        if (this.isRunningDauDuoi) {
            throw new Error('Cập nhật thống kê Đầu Đuôi đang chạy, vui lòng thử lại sau');
        }
        await this.runDauDuoiUpdate();
    }

    /**
     * Chạy cập nhật thủ công cho lô gan
     */
    async runManualLoGanUpdate() {
        if (this.isRunningLoGan) {
            throw new Error('Cập nhật thống kê Lô Gan đang chạy, vui lòng thử lại sau');
        }
        await this.runLoGanUpdate();
    }
}

module.exports = new StatsSchedulerService();

