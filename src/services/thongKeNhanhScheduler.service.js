const cron = require('node-cron');

const LoGanStats = require('../models/stats/loganStats.model');
const GiaiDacBietStats = require('../models/stats/giaiDacBietStats.model');
const TanSuatLotoStats = require('../models/stats/tanSuatLotoStats.model');

const {
    calculateLoGanStats,
    calculateSpecialPrizeStats,
    calculateTanSuatLotoStats
} = require('../controllers/xsmbController');

const DEFAULT_TIME = '18:34';
const DEFAULT_TIMEZONE = process.env.TIME_UPDATE_THONGKENHANH_TZ ||
    process.env.XSMB_SCRAPER_TIMEZONE ||
    'Asia/Ho_Chi_Minh';

const DAYS_CONFIG = {
    loGan: 60,
    tanSuat: 30,
    dacBiet: 365
};

class ThongKeNhanhSchedulerService {
    constructor() {
        this.job = null;
        this.isRunning = false;
        this.config = null;
    }

    parseTime(timeString) {
        if (!timeString || typeof timeString !== 'string') {
            return null;
        }

        const match = /^(\d{1,2}):(\d{1,2})$/.exec(timeString.trim());
        if (!match) return null;

        const hour = Number(match[1]);
        const minute = Number(match[2]);

        if (Number.isNaN(hour) || Number.isNaN(minute)) return null;
        if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;

        return { hour, minute };
    }

    init() {
        const timeString = (process.env.TIME_UPDATE_THONGKENHANH || DEFAULT_TIME).trim();

        if (timeString.toLowerCase() === 'off') {
            console.log('[ThongKeNhanhScheduler] ⏸️ TIME_UPDATE_THONGKENHANH=off, bỏ qua auto update.');
            return this;
        }

        const parsedTime = this.parseTime(timeString);
        if (!parsedTime) {
            console.warn(`[ThongKeNhanhScheduler] ⚠️ TIME_UPDATE_THONGKENHANH không hợp lệ ("${timeString}"). Tự động cập nhật bị tắt.`);
            return this;
        }

        const cronExpression = `${parsedTime.minute} ${parsedTime.hour} * * *`;
        this.config = {
            ...parsedTime,
            timeString,
            timezone: DEFAULT_TIMEZONE,
            cronExpression
        };

        this.job = cron.schedule(
            cronExpression,
            () => this.runUpdate(),
            { timezone: DEFAULT_TIMEZONE }
        );

        console.log(
            `[ThongKeNhanhScheduler] ✅ Đã lên lịch cập nhật Thống Kê Nhanh vào ${timeString} (${DEFAULT_TIMEZONE}) – cron: ${cronExpression}`
        );

        return this;
    }

    async runUpdate() {
        if (this.isRunning) {
            console.log('[ThongKeNhanhScheduler] ⏳ Đang cập nhật, bỏ qua lần trigger này.');
            return;
        }

        this.isRunning = true;
        const timeLabel = new Date().toLocaleString('vi-VN', { timeZone: this.config?.timezone || DEFAULT_TIMEZONE });
        console.log(`[ThongKeNhanhScheduler] 🚀 Bắt đầu cập nhật dữ liệu Thống Kê Nhanh (${timeLabel})`);

        try {
            await this.updateLoGan();
            await this.updateTanSuatLoto();
            await this.updateSpecialPrize();
            console.log('[ThongKeNhanhScheduler] ✅ Hoàn tất cập nhật dữ liệu Thống Kê Nhanh');
        } catch (error) {
            console.error('[ThongKeNhanhScheduler] ❌ Lỗi cập nhật Thống Kê Nhanh:', error.message || error);
        } finally {
            this.isRunning = false;
        }
    }

    async updateLoGan() {
        const days = DAYS_CONFIG.loGan;
        const result = await calculateLoGanStats(days);
        const filterType = this.getLoGanFilterType(days);

        await LoGanStats.findOneAndUpdate(
            { filterType },
            {
                filterType,
                description: result?.metadata?.description || `${days} ngày`,
                statistics: result?.statistics || [],
                metadata: result?.metadata,
                lastUpdated: new Date()
            },
            { upsert: true, new: true }
        );

        console.log(
            `[ThongKeNhanhScheduler] • Lô gan (${days} ngày) đã cập nhật (${result?.statistics?.length || 0} bản ghi)`
        );
    }

    async updateTanSuatLoto() {
        const days = DAYS_CONFIG.tanSuat;
        const result = await calculateTanSuatLotoStats(days);

        await TanSuatLotoStats.findOneAndUpdate(
            { days },
            {
                days,
                statistics: result?.statistics || [],
                metadata: result?.metadata,
                lastUpdated: new Date()
            },
            { upsert: true, new: true }
        );

        console.log(
            `[ThongKeNhanhScheduler] • Tần suất Loto (${days} ngày) đã cập nhật (${result?.statistics?.length || 0} bản ghi)`
        );
    }

    async updateSpecialPrize() {
        const days = DAYS_CONFIG.dacBiet;
        const result = await calculateSpecialPrizeStats(days);

        await GiaiDacBietStats.findOneAndUpdate(
            { days },
            {
                days,
                statistics: result?.statistics || [],
                metadata: result?.metadata,
                lastUpdated: new Date()
            },
            { upsert: true, new: true }
        );

        console.log(
            `[ThongKeNhanhScheduler] • Giải đặc biệt (${days} ngày) đã cập nhật (${result?.statistics?.length || 0} bản ghi)`
        );
    }

    getLoGanFilterType(days) {
        switch (Number(days)) {
            case 6:
                return 'below-7';
            case 7:
                return '7-14';
            case 14:
                return '14-28';
            case 30:
                return '30';
            case 60:
                return '60';
            default:
                return String(days);
        }
    }

    stop() {
        if (this.job) {
            this.job.stop();
            this.job = null;
            console.log('[ThongKeNhanhScheduler] ⏹️ Đã dừng scheduler Thống Kê Nhanh');
        }
    }
}

module.exports = new ThongKeNhanhSchedulerService();










