/**
 * Soi Cầu Scheduler - Tự động cập nhật soi cầu lúc 18h40 hằng ngày
 */

const cron = require('node-cron');
const SoiCauService = require('./soicau.service');
const DailyDataCollectionService = require('./dailyDataCollection.service');

class SoiCauScheduler {
    constructor() {
        this.soiCauService = new SoiCauService();
        this.dailyDataCollectionService = new DailyDataCollectionService();
        this.isRunning = false;
        this.lastRun = null;
        this.nextRun = null;

        // Service initialized silently
    }

    /**
     * Khởi động scheduler (DISABLED - Chỉ giữ lại cleanup)
     */
    init() {
        if (this.isRunning) {
            console.log('⚠️ SoiCauScheduler đã đang chạy');
            return;
        }

        console.log('🚀 Starting SoiCauScheduler (Manual Mode - No Auto Schedule)...');

        // CHỈ GIỮ LẠI CLEANUP - BỎ SOI CẦU TỰ ĐỘNG
        // Cập nhật soi cầu lúc 18h40 hằng ngày - DISABLED
        // this.soiCauTask = cron.schedule('40 18 * * *', async () => {
        //     await this.runSoiCauUpdate();
        // }, {
        //     scheduled: true,
        //     timezone: 'Asia/Ho_Chi_Minh'
        // });

        // Cập nhật kết quả thực tế lúc 19h00 hằng ngày - DISABLED
        // this.resultUpdateTask = cron.schedule('0 19 * * *', async () => {
        //     await this.runResultUpdate();
        // }, {
        //     scheduled: true,
        //     timezone: 'Asia/Ho_Chi_Minh'
        // });

        // Cleanup dữ liệu cũ lúc 02h00 hằng ngày - KEEP
        this.cleanupTask = cron.schedule('0 2 * * *', async () => {
            await this.runCleanup();
        }, {
            scheduled: true,
            timezone: 'Asia/Ho_Chi_Minh'
        });

        this.isRunning = true;
        this.nextRun = null; // Không có schedule tự động

        console.log('✅ SoiCauScheduler started successfully (Manual Mode)');
        console.log('🕐 Schedules:');
        console.log('  - Soi cầu update: DISABLED (Manual only)');
        console.log('  - Result update: DISABLED (Manual only)');
        console.log('  - Cleanup: 02:00 daily (KEPT)');
    }

    /**
     * Dừng scheduler
     */
    stop() {
        if (!this.isRunning) {
            console.log('⚠️ SoiCauScheduler chưa chạy');
            return;
        }

        if (this.soiCauTask) {
            this.soiCauTask.stop();
        }
        if (this.resultUpdateTask) {
            this.resultUpdateTask.stop();
        }
        if (this.cleanupTask) {
            this.cleanupTask.stop();
        }

        this.isRunning = false;
        console.log('🛑 SoiCauScheduler stopped');
    }

    /**
     * Chạy cập nhật soi cầu
     */
    async runSoiCauUpdate() {
        try {
            console.log('🔄 Starting scheduled soi cầu update...');
            this.lastRun = new Date();

            // Tạo soi cầu cho ngày hiện tại
            const today = new Date();

            // Sử dụng DailyDataCollectionService để thu thập và lưu dữ liệu
            const result = await this.dailyDataCollectionService.collectAndSaveDailyData(today, 30);

            console.log(`✅ Daily data collected and saved for ${today.toISOString().split('T')[0]}`);
            console.log(`📊 Historical data:`, {
                days: result.data.historicalData.days,
                recordCount: result.data.historicalData.recordCount,
                dateRange: `${result.data.historicalData.startDate.toISOString().split('T')[0]} to ${result.data.historicalData.endDate.toISOString().split('T')[0]}`
            });
            console.log(`📈 Predictions generated:`, {
                cdmDe: result.data.predictions.cdm.de.length,
                cdmLo: result.data.predictions.cdm.lo.length,
                efdmDe: result.data.predictions.efdm.de.length,
                efdmLo: result.data.predictions.efdm.lo.length,
                cfDe: result.data.predictions.collaborativeFiltering.de.length,
                cfLo: result.data.predictions.collaborativeFiltering.lo.length,
                ensembleDe: result.data.predictions.ensemble.de.length,
                ensembleLo: result.data.predictions.ensemble.lo.length
            });

            // Gửi thông báo (có thể mở rộng để gửi email, SMS, etc.)
            this.sendNotification('soiCau', {
                date: today.toISOString().split('T')[0],
                historicalData: result.data.historicalData,
                predictions: result.data.predictions
            });

        } catch (error) {
            console.error('❌ Error in scheduled soi cầu update:', error);
            this.sendNotification('error', {
                type: 'soiCauUpdate',
                error: error.message
            });
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
            const soiCau = await this.soiCauService.updateActualResults(today);

            console.log(`✅ Actual results updated for ${today.toISOString().split('T')[0]}`);
            console.log(`📊 Accuracy stats:`, {
                cdmDe: soiCau.accuracyStats.cdmDe.isCorrect,
                efdmDe: soiCau.accuracyStats.efdmDe.isCorrect,
                cdmLoHitRate: (soiCau.accuracyStats.cdmLo.hitRate * 100).toFixed(2) + '%',
                efdmLoHitRate: (soiCau.accuracyStats.efdmLo.hitRate * 100).toFixed(2) + '%',
                cfHitRate: (soiCau.accuracyStats.cf.hitRate * 100).toFixed(2) + '%',
                ensembleHitRate: (soiCau.accuracyStats.ensemble.hitRate * 100).toFixed(2) + '%'
            });

            // Gửi thông báo kết quả
            this.sendNotification('resultUpdate', {
                date: today.toISOString().split('T')[0],
                accuracy: soiCau.accuracyStats
            });

        } catch (error) {
            console.error('❌ Error in scheduled result update:', error);
            this.sendNotification('error', {
                type: 'resultUpdate',
                error: error.message
            });
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
            this.sendNotification('error', {
                type: 'cleanup',
                error: error.message
            });
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
                    await this.runSoiCauUpdate();
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
     * Lấy thời gian chạy tiếp theo (đã loại bỏ logic thời gian)
     */
    getNextRunTime() {
        return null; // Không còn scheduler tự động
    }

    /**
     * Gửi thông báo (có thể mở rộng)
     */
    sendNotification(type, data) {
        // Có thể mở rộng để gửi email, SMS, webhook, etc.
        console.log(`📢 Notification [${type}]:`, JSON.stringify(data, null, 2));
    }

    /**
     * Lấy trạng thái scheduler
     */
    getStatus() {
        return {
            isRunning: this.isRunning,
            lastRun: this.lastRun,
            nextRun: this.nextRun,
            tasks: {
                soiCau: this.soiCauTask ? 'scheduled' : 'stopped',
                resultUpdate: this.resultUpdateTask ? 'scheduled' : 'stopped',
                cleanup: this.cleanupTask ? 'scheduled' : 'stopped'
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

            // Kiểm tra xem có soi cầu hôm nay không
            let hasTodaySoiCau = false;
            try {
                await this.soiCauService.getSoiCauByDate(today);
                hasTodaySoiCau = true;
            } catch (error) {
                hasTodaySoiCau = false;
            }

            return {
                status: 'healthy',
                isRunning: status.isRunning,
                lastRun: status.lastRun,
                nextRun: status.nextRun,
                hasTodaySoiCau,
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

module.exports = new SoiCauScheduler();
