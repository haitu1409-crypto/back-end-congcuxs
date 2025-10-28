/**
 * Optimized Soi Cầu Scheduler - Tự động cập nhật soi cầu sau 18h40
 * Tối ưu hóa để user đầu tiên không cần tính toán
 */

const cron = require('node-cron');
const SoiCauService = require('./soicau.service');
const BachThuDeService = require('./bachThuDe.service');
const XSMB = require('../models/xsmb.model');

class OptimizedSoiCauScheduler {
    constructor() {
        this.soiCauService = new SoiCauService();
        this.bachThuDeService = new BachThuDeService();
        this.isRunning = false;
        this.lastRun = null;
        this.isProcessing = false;

        console.log('✅ OptimizedSoiCauScheduler initialized (time-based scheduling removed)');
    }

    /**
     * Khởi động scheduler tối ưu hóa
     */
    init() {
        if (this.isRunning) {
            console.log('⚠️ OptimizedSoiCauScheduler đã đang chạy');
            return;
        }

        console.log('🚀 Starting OptimizedSoiCauScheduler...');

        // Loại bỏ tất cả logic thời gian - không còn scheduler tự động
        this.isRunning = true;

        console.log('✅ OptimizedSoiCauScheduler started successfully');
        console.log('📝 Note: Time-based scheduling removed - manual execution only');
    }

    /**
     * Chạy cập nhật soi cầu tối ưu hóa
     */
    async runOptimizedSoiCauUpdate() {
        if (this.isProcessing) {
            console.log('⚠️ Soi cầu update đang chạy, bỏ qua...');
            return;
        }

        try {
            this.isProcessing = true;
            console.log('🔄 Starting optimized soi cầu update...');
            this.lastRun = new Date();

            // Tạo soi cầu cho ngày hôm sau
            const tomorrow = new Date();
            tomorrow.setDate(tomorrow.getDate() + 1);

            console.log(`📅 Generating soi cầu for ${tomorrow.toISOString().split('T')[0]}`);

            // Tính toán song song cả soi cầu lô và đề
            const [soiCauResult, bachThuDeResult] = await Promise.all([
                this.generateSoiCauForDate(tomorrow, 14),
                this.generateBachThuDeForDate(tomorrow, 14)
            ]);

            console.log('✅ Optimized soi cầu update completed');
            console.log(`📊 Results:`);
            console.log(`  - Soi cầu lô: ${soiCauResult ? 'Generated' : 'Failed'}`);
            console.log(`  - Bạch thủ đề: ${bachThuDeResult ? 'Generated' : 'Failed'}`);

            // Gửi thông báo thành công
            this.sendNotification('success', {
                date: tomorrow.toISOString().split('T')[0],
                soiCauGenerated: !!soiCauResult,
                bachThuDeGenerated: !!bachThuDeResult,
                timestamp: new Date().toISOString()
            });

        } catch (error) {
            console.error('❌ Error in optimized soi cầu update:', error);
            this.sendNotification('error', {
                type: 'soiCauUpdate',
                error: error.message,
                timestamp: new Date().toISOString()
            });
        } finally {
            this.isProcessing = false;
        }
    }

    /**
     * Tạo soi cầu cho ngày cụ thể
     */
    async generateSoiCauForDate(targetDate, days = 14) {
        try {
            console.log(`🎯 Generating soi cầu lô for ${targetDate.toISOString().split('T')[0]}`);

            // Kiểm tra xem đã có chưa
            const existingResult = await this.soiCauService.getSoiCauByDate(targetDate);
            if (existingResult) {
                console.log(`📋 Soi cầu lô đã tồn tại cho ${targetDate.toISOString().split('T')[0]}`);
                return existingResult;
            }

            // Tạo mới
            const result = await this.soiCauService.generateSoiCau(targetDate, days);
            console.log(`✅ Soi cầu lô generated for ${targetDate.toISOString().split('T')[0]}`);
            return result;

        } catch (error) {
            console.error(`❌ Error generating soi cầu lô for ${targetDate.toISOString().split('T')[0]}:`, error);
            return null;
        }
    }

    /**
     * Tạo bạch thủ đề cho ngày cụ thể
     */
    async generateBachThuDeForDate(targetDate, days = 14) {
        try {
            console.log(`🎯 Generating bạch thủ đề for ${targetDate.toISOString().split('T')[0]}`);

            // Kiểm tra xem đã có chưa
            const BachThuDeResult = require('../models/bachThuDeResult.model');
            const existingResult = await BachThuDeResult.findByPredictionDate(targetDate, days);
            if (existingResult) {
                console.log(`📋 Bạch thủ đề đã tồn tại cho ${targetDate.toISOString().split('T')[0]}`);
                return existingResult;
            }

            // Tạo mới
            const result = await this.bachThuDeService.generateBachThuDe(targetDate, days);
            console.log(`✅ Bạch thủ đề generated for ${targetDate.toISOString().split('T')[0]}`);
            return result;

        } catch (error) {
            console.error(`❌ Error generating bạch thủ đề for ${targetDate.toISOString().split('T')[0]}:`, error);
            return null;
        }
    }

    /**
     * Chạy cập nhật kết quả thực tế
     */
    async runResultUpdate() {
        try {
            console.log('🔄 Starting scheduled result update...');

            // Cập nhật kết quả cho ngày hôm nay
            const today = new Date();

            // Cập nhật cả soi cầu lô và đề
            const [soiCauUpdated, bachThuDeUpdated] = await Promise.all([
                this.updateSoiCauActualResults(today),
                this.updateBachThuDeActualResults(today)
            ]);

            console.log(`✅ Actual results updated for ${today.toISOString().split('T')[0]}`);
            console.log(`📊 Updates:`);
            console.log(`  - Soi cầu lô: ${soiCauUpdated ? 'Updated' : 'No data'}`);
            console.log(`  - Bạch thủ đề: ${bachThuDeUpdated ? 'Updated' : 'No data'}`);

        } catch (error) {
            console.error('❌ Error in scheduled result update:', error);
        }
    }

    /**
     * Cập nhật kết quả thực tế cho soi cầu lô
     */
    async updateSoiCauActualResults(drawDate) {
        try {
            const soiCau = await this.soiCauService.updateActualResults(drawDate);
            return soiCau;
        } catch (error) {
            console.error('❌ Error updating soi cầu actual results:', error);
            return null;
        }
    }

    /**
     * Cập nhật kết quả thực tế cho bạch thủ đề
     */
    async updateBachThuDeActualResults(drawDate) {
        try {
            // Lấy kết quả xổ số thực tế
            const actualResult = await XSMB.findByDate(drawDate);
            if (!actualResult) {
                console.log(`⚠️ No actual result found for ${drawDate.toISOString().split('T')[0]}`);
                return null;
            }

            // Cập nhật tất cả bạch thủ đề có liên quan
            const BachThuDeResult = require('../models/bachThuDeResult.model');
            const results = await BachThuDeResult.find({
                'history.date': drawDate.toLocaleDateString('vi-VN')
            });

            for (const result of results) {
                await result.updateActualResults([actualResult.specialPrize[0].slice(-2)]);
            }

            return results.length > 0;
        } catch (error) {
            console.error('❌ Error updating bach thu de actual results:', error);
            return null;
        }
    }

    /**
     * Chạy cleanup dữ liệu cũ
     */
    async runCleanup() {
        try {
            console.log('🔄 Starting scheduled cleanup...');

            const deletedCount = await this.soiCauService.cleanupOldSoiCau(90);

            console.log(`✅ Cleanup completed: ${deletedCount} old records deleted`);

        } catch (error) {
            console.error('❌ Error in scheduled cleanup:', error);
        }
    }

    /**
     * Chạy ngay lập tức (không chờ schedule)
     */
    async runNow(type = 'soiCau') {
        try {
            console.log(`🔄 Running ${type} update now...`);

            switch (type) {
                case 'soiCau':
                    await this.runOptimizedSoiCauUpdate();
                    break;
                case 'result':
                    await this.runResultUpdate();
                    break;
                case 'cleanup':
                    await this.runCleanup();
                    break;
                default:
                    throw new Error(`Unknown type: ${type}`);
            }

            console.log(`✅ ${type} update completed`);
        } catch (error) {
            console.error(`❌ Error in manual ${type} update:`, error);
            throw error;
        }
    }

    /**
     * Dừng scheduler
     */
    stop() {
        if (!this.isRunning) {
            console.log('⚠️ OptimizedSoiCauScheduler chưa chạy');
            return;
        }

        this.isRunning = false;
        console.log('🛑 OptimizedSoiCauScheduler stopped');
    }

    /**
     * Lấy thời gian chạy tiếp theo (đã loại bỏ logic thời gian)
     */
    getNextRunTime() {
        return null; // Không còn scheduler tự động
    }

    /**
     * Gửi thông báo
     */
    sendNotification(type, data) {
        console.log(`📢 Notification [${type}]:`, JSON.stringify(data, null, 2));
    }

    /**
     * Lấy trạng thái scheduler
     */
    getStatus() {
        return {
            isRunning: this.isRunning,
            isProcessing: this.isProcessing,
            lastRun: this.lastRun,
            tasks: {
                soiCau: 'manual_only',
                resultUpdate: 'manual_only',
                cleanup: 'manual_only'
            }
        };
    }

    /**
     * Health check
     */
    async healthCheck() {
        try {
            const status = this.getStatus();
            const today = new Date();
            const tomorrow = new Date(today);
            tomorrow.setDate(tomorrow.getDate() + 1);

            // Kiểm tra xem có soi cầu hôm nay và ngày mai không
            let hasTodaySoiCau = false;
            let hasTomorrowSoiCau = false;
            let hasTomorrowBachThuDe = false;

            try {
                await this.soiCauService.getSoiCauByDate(today);
                hasTodaySoiCau = true;
            } catch (error) {
                hasTodaySoiCau = false;
            }

            try {
                await this.soiCauService.getSoiCauByDate(tomorrow);
                hasTomorrowSoiCau = true;
            } catch (error) {
                hasTomorrowSoiCau = false;
            }

            try {
                const BachThuDeResult = require('../models/bachThuDeResult.model');
                await BachThuDeResult.findByPredictionDate(tomorrow, 14);
                hasTomorrowBachThuDe = true;
            } catch (error) {
                hasTomorrowBachThuDe = false;
            }

            return {
                status: 'healthy',
                isRunning: status.isRunning,
                isProcessing: status.isProcessing,
                lastRun: status.lastRun,
                nextRun: status.nextRun,
                dataStatus: {
                    hasTodaySoiCau,
                    hasTomorrowSoiCau,
                    hasTomorrowBachThuDe
                },
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            return {
                status: 'unhealthy',
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }
}

module.exports = new OptimizedSoiCauScheduler();

