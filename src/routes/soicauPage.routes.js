/**
 * Soi Cầu Page Routes - API endpoints cho page soi cầu
 */

const express = require('express');
const router = express.Router();
const SoiCauService = require('../services/soicau.service');
const SoiCauScheduler = require('../services/soicauScheduler.service');
const DailyDataCollectionService = require('../services/dailyDataCollection.service');

// Performance optimization: Simple in-memory cache
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

const getCachedData = (key) => {
    const cached = cache.get(key);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        return cached.data;
    }
    cache.delete(key);
    return null;
};

const setCachedData = (key, data) => {
    cache.set(key, {
        data,
        timestamp: Date.now()
    });
};

// Khởi tạo services
const soiCauService = new SoiCauService();
const scheduler = SoiCauScheduler;
const dailyDataCollectionService = new DailyDataCollectionService();

/**
 * Dashboard - Trang chủ soi cầu
 * GET /api/soicau-page/dashboard
 */
router.get('/dashboard', async (req, res) => {
    try {
        console.log('🎯 Getting dashboard data...');

        const today = new Date();
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);

        // Get today's data
        let todayData = null;
        try {
            const dailyData = await dailyDataCollectionService.getDailyData(today);
            todayData = {
                predictionDate: dailyData.predictionDate,
                drawDate: dailyData.predictionDate,
                predictions: dailyData.predictions,
                probabilityStatistics: dailyData.probabilityStatistics,
                historicalData: dailyData.historicalData,
                metadata: dailyData.metadata
            };
            console.log('✅ Got today data from DailyDataCollectionService');
        } catch (todayError) {
            console.log('⚠️ No today data from DailyDataCollectionService');
            // Fallback to old service
            try {
                todayData = await soiCauService.getSoiCauByDate(today);
            } catch (fallbackError) {
                console.log('⚠️ No today data from SoiCauService either');
            }
        }

        // Get yesterday's data
        let yesterdayData = null;
        try {
            const dailyData = await dailyDataCollectionService.getDailyData(yesterday);
            yesterdayData = {
                predictionDate: dailyData.predictionDate,
                drawDate: dailyData.predictionDate,
                predictions: dailyData.predictions,
                probabilityStatistics: dailyData.probabilityStatistics,
                historicalData: dailyData.historicalData,
                metadata: dailyData.metadata
            };
            console.log('✅ Got yesterday data from DailyDataCollectionService');
        } catch (yesterdayError) {
            console.log('⚠️ No yesterday data from DailyDataCollectionService');
            // Fallback to old service
            try {
                yesterdayData = await soiCauService.getSoiCauByDate(yesterday);
            } catch (fallbackError) {
                console.log('⚠️ No yesterday data from SoiCauService either');
            }
        }

        // Get accuracy stats from old service (still useful)
        let accuracyStats = null;
        try {
            accuracyStats = await soiCauService.getAccuracyStats(30);
        } catch (error) {
            console.log('⚠️ Could not get accuracy stats');
        }

        // Get history from old service
        let history = [];
        try {
            history = await soiCauService.getSoiCauHistory(10, 10);
        } catch (error) {
            console.log('⚠️ Could not get history');
        }

        const dashboardData = {
            today: todayData,
            yesterday: yesterdayData,
            accuracyStats,
            history,
            lastUpdated: todayData?.updatedAt || yesterdayData?.updatedAt
        };

        res.json({
            success: true,
            data: dashboardData
        });

    } catch (error) {
        console.error('❌ Dashboard Error:', error.message);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy dữ liệu dashboard',
            error: error.message
        });
    }
});

/**
 * Soi cầu hôm nay
 * GET /api/soicau-page/today
 */
router.get('/today', async (req, res) => {
    try {
        const today = new Date();
        const soiCau = await soiCauService.getSoiCauByDate(today);

        res.json({
            success: true,
            data: soiCau
        });

    } catch (error) {
        console.error('❌ Today Soi Cầu Error:', error.message);
        res.status(404).json({
            success: false,
            message: 'Chưa có soi cầu hôm nay',
            error: error.message
        });
    }
});

/**
 * Soi cầu theo ngày - Kiểm tra dữ liệu đã tồn tại
 * GET /api/soicau-page/date/:date
 */
router.get('/date/:date', async (req, res) => {
    try {
        const { date } = req.params;
        const targetDate = new Date(date);

        if (isNaN(targetDate.getTime())) {
            return res.status(400).json({
                success: false,
                message: 'Định dạng ngày không hợp lệ (sử dụng YYYY-MM-DD)'
            });
        }

        // Performance optimization: Check cache first
        const cacheKey = `soicau:date:${date}`;
        const cachedData = getCachedData(cacheKey);
        if (cachedData) {
            console.log(`📦 Returning cached data for date: ${date}`);
            return res.json(cachedData);
        }

        // Thử lấy từ DailyDataCollectionService trước (dữ liệu mới)
        try {
            const dailyData = await dailyDataCollectionService.getDailyData(targetDate);
            console.log(`📋 Lấy dữ liệu từ DailyDataCollectionService cho ngày ${date}`);

            // Chuyển đổi format để tương thích với frontend
            const soiCauData = {
                predictionDate: dailyData.predictionDate,
                drawDate: dailyData.predictionDate,
                predictions: dailyData.predictions,
                probabilityStatistics: dailyData.probabilityStatistics,
                historicalData: dailyData.historicalData,
                metadata: dailyData.metadata
            };

            const response = {
                success: true,
                data: soiCauData
            };
            setCachedData(cacheKey, response);
            res.json(response);
            return;
        } catch (dbError) {
            console.log(`⚠️ Không tìm thấy dữ liệu trong DailyDataCollectionService, thử SoiCauService: ${dbError.message}`);
        }

        // Fallback sang SoiCauService (legacy)
        try {
            const soiCau = await soiCauService.getSoiCauByDate(targetDate);
            const response = {
                success: true,
                data: soiCau
            };
            setCachedData(cacheKey, response);
            res.json(response);
        } catch (soiCauError) {
            console.log(`⚠️ Không tìm thấy dữ liệu trong SoiCauService: ${soiCauError.message}`);
            // Trả về response thành công với dữ liệu rỗng thay vì 404
            const response = {
                success: true,
                data: null,
                message: `Chưa có dữ liệu soi cầu cho ngày ${date}`
            };
            setCachedData(cacheKey, response);
            res.json(response);
        }

    } catch (error) {
        console.error('❌ Date Soi Cầu Error:', error.message);
        // Trả về response thành công với dữ liệu rỗng thay vì 404
        res.json({
            success: true,
            data: null,
            message: `Chưa có dữ liệu soi cầu cho ngày ${date}`
        });
    }
});

/**
 * Generate and save soi cầu predictions
 * POST /api/soicau-page/generate-soicau
 */
router.post('/generate-soicau', async (req, res) => {
    try {
        const { date, method, type, limit = 20 } = req.body;

        if (!date) {
            return res.status(400).json({
                success: false,
                message: 'Thiếu tham số date (format: YYYY-MM-DD)'
            });
        }

        const targetDate = new Date(date);
        if (isNaN(targetDate.getTime())) {
            return res.status(400).json({
                success: false,
                message: 'Định dạng ngày không hợp lệ (sử dụng YYYY-MM-DD)'
            });
        }

        console.log(`🎯 Generating soi cầu for ${date} with method ${method} and type ${type}`);

        // Tạo predictions mới và lưu vào database
        const result = await dailyDataCollectionService.generateAndSavePredictions(
            targetDate,
            method || 'ensemble',
            type || 'de',
            parseInt(limit)
        );

        res.json({
            success: true,
            message: 'Tạo soi cầu thành công',
            data: result
        });

    } catch (error) {
        console.error('❌ Generate Soi Cầu Error:', error.message);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi tạo soi cầu',
            error: error.message
        });
    }
});

/**
 * Top predictions theo phương pháp
 * GET /api/soicau-page/predictions/:method/:type?limit=20
 */
router.get('/predictions/:method/:type?', async (req, res) => {
    try {
        const { method, type } = req.params;
        const { limit = 20, date } = req.query;

        const targetDate = date ? new Date(date) : new Date();

        if (isNaN(targetDate.getTime())) {
            return res.status(400).json({
                success: false,
                message: 'Định dạng ngày không hợp lệ (sử dụng YYYY-MM-DD)'
            });
        }

        // Thử lấy từ DailyDataCollectionService trước
        let predictions;
        try {
            predictions = await dailyDataCollectionService.getTopPredictions(
                targetDate,
                method,
                type || 'de',
                parseInt(limit)
            );
            console.log(`📋 Lấy predictions từ DailyDataCollectionService cho ${method}-${type || 'de'}`);
        } catch (dbError) {
            console.log(`⚠️ Không tìm thấy dữ liệu trong DailyDataCollectionService, fallback sang SoiCauService: ${dbError.message}`);
            predictions = await soiCauService.getTopPredictions(
                targetDate,
                method,
                type || 'de',
                parseInt(limit)
            );
        }

        res.json({
            success: true,
            data: {
                method,
                type: type || 'de',
                date: targetDate.toISOString().split('T')[0],
                limit: parseInt(limit),
                predictions
            }
        });

    } catch (error) {
        console.error('❌ Predictions Error:', error.message);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy predictions',
            error: error.message
        });
    }
});

/**
 * Lịch sử soi cầu
 * GET /api/soicau-page/history?limit=30&days=30
 */
router.get('/history', async (req, res) => {
    try {
        const { limit = 30, days = 30 } = req.query;

        const history = await soiCauService.getSoiCauHistory(
            parseInt(limit),
            parseInt(days)
        );

        res.json({
            success: true,
            data: {
                limit: parseInt(limit),
                days: parseInt(days),
                history
            }
        });

    } catch (error) {
        console.error('❌ History Error:', error.message);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy lịch sử soi cầu',
            error: error.message
        });
    }
});

/**
 * Thống kê độ chính xác
 * GET /api/soicau-page/accuracy?days=30
 */
router.get('/accuracy', async (req, res) => {
    try {
        const { days = 30 } = req.query;

        const accuracyStats = await soiCauService.getAccuracyStats(parseInt(days));

        res.json({
            success: true,
            data: {
                days: parseInt(days),
                stats: accuracyStats
            }
        });

    } catch (error) {
        console.error('❌ Accuracy Error:', error.message);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy thống kê độ chính xác',
            error: error.message
        });
    }
});

/**
 * Tạo soi cầu mới (manual) - Với logic cache
 * POST /api/soicau-page/generate
 */
router.post('/generate', async (req, res) => {
    try {
        const { date, days = 30, topK = 5 } = req.body;

        if (!date) {
            return res.status(400).json({
                success: false,
                message: 'Thiếu tham số date (format: YYYY-MM-DD)'
            });
        }

        const targetDate = new Date(date);
        if (isNaN(targetDate.getTime())) {
            return res.status(400).json({
                success: false,
                message: 'Định dạng ngày không hợp lệ (sử dụng YYYY-MM-DD)'
            });
        }

        console.log(`🎯 Manual generate soi cầu for ${date}`);

        // Kiểm tra xem đã có dữ liệu cho ngày này chưa
        try {
            const existingData = await dailyDataCollectionService.getDailyData(targetDate);
            if (existingData && existingData.metadata.status === 'completed') {
                console.log(`📋 Dữ liệu cho ngày ${date} đã tồn tại`);
                return res.json({
                    success: true,
                    message: 'Dữ liệu đã tồn tại cho ngày này',
                    data: existingData,
                    cached: true
                });
            }
        } catch (checkError) {
            console.log(`📋 Chưa có dữ liệu cho ngày ${date}, sẽ tạo mới`);
        }

        // Sử dụng DailyDataCollectionService để thu thập và lưu dữ liệu
        const result = await dailyDataCollectionService.collectAndSaveDailyData(
            targetDate,
            parseInt(days)
        );

        res.json({
            success: true,
            message: 'Tạo soi cầu thành công',
            data: result.data,
            cached: false
        });

    } catch (error) {
        console.error('❌ Generate Error:', error.message);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi tạo soi cầu',
            error: error.message
        });
    }
});

/**
 * Cập nhật kết quả thực tế (manual)
 * POST /api/soicau-page/update-results
 */
router.post('/update-results', async (req, res) => {
    try {
        const { date } = req.body;

        const targetDate = date ? new Date(date) : new Date();
        if (isNaN(targetDate.getTime())) {
            return res.status(400).json({
                success: false,
                message: 'Định dạng ngày không hợp lệ (sử dụng YYYY-MM-DD)'
            });
        }

        console.log(`🔄 Manual update results for ${targetDate.toISOString().split('T')[0]}`);

        const soiCau = await soiCauService.updateActualResults(targetDate);

        res.json({
            success: true,
            message: 'Cập nhật kết quả thành công',
            data: soiCau
        });

    } catch (error) {
        console.error('❌ Update Results Error:', error.message);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi cập nhật kết quả',
            error: error.message
        });
    }
});

/**
 * Scheduler status
 * GET /api/soicau-page/scheduler/status
 */
router.get('/scheduler/status', (req, res) => {
    try {
        const status = scheduler.getStatus();

        res.json({
            success: true,
            data: status
        });

    } catch (error) {
        console.error('❌ Scheduler Status Error:', error.message);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy trạng thái scheduler',
            error: error.message
        });
    }
});

/**
 * Scheduler health check
 * GET /api/soicau-page/scheduler/health
 */
router.get('/scheduler/health', async (req, res) => {
    try {
        const health = await scheduler.healthCheck();

        res.json({
            success: true,
            data: health
        });

    } catch (error) {
        console.error('❌ Scheduler Health Error:', error.message);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi kiểm tra health scheduler',
            error: error.message
        });
    }
});

/**
 * Chạy scheduler ngay lập tức
 * POST /api/soicau-page/scheduler/run
 */
router.post('/scheduler/run', async (req, res) => {
    try {
        const { type = 'soiCau' } = req.body;

        if (!['soiCau', 'result', 'cleanup'].includes(type)) {
            return res.status(400).json({
                success: false,
                message: 'Type phải là: soiCau, result, hoặc cleanup'
            });
        }

        console.log(`🔄 Manual run scheduler: ${type}`);

        await scheduler.runNow(type);

        res.json({
            success: true,
            message: `Chạy ${type} thành công`
        });

    } catch (error) {
        console.error('❌ Scheduler Run Error:', error.message);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi chạy scheduler',
            error: error.message
        });
    }
});

/**
 * Thống kê xác suất chi tiết
 * GET /api/soicau-page/probability-stats/:date
 */
router.get('/probability-stats/:date', async (req, res) => {
    try {
        const { date } = req.params;
        const targetDate = new Date(date);

        if (isNaN(targetDate.getTime())) {
            return res.status(400).json({
                success: false,
                message: 'Định dạng ngày không hợp lệ (sử dụng YYYY-MM-DD)'
            });
        }

        console.log(`📊 Getting probability statistics for ${date}`);

        // Lấy thống kê xác suất từ ProbabilityStatisticsService
        const ProbabilityStatisticsService = require('../services/probabilityStatistics.service');
        const probabilityStatsService = new ProbabilityStatisticsService();

        const statistics = await probabilityStatsService.calculateAndSaveProbabilityStatistics(targetDate);

        res.json({
            success: true,
            data: statistics
        });

    } catch (error) {
        console.error('❌ Probability Stats Error:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy thống kê xác suất',
            error: error.message
        });
    }
});

/**
 * Cleanup dữ liệu cũ
 * DELETE /api/soicau-page/cleanup
 */
router.delete('/cleanup', async (req, res) => {
    try {
        const { days = 90 } = req.query;

        const deletedCount = await soiCauService.cleanupOldSoiCau(parseInt(days));

        res.json({
            success: true,
            message: `Đã xóa ${deletedCount} bản ghi cũ`,
            data: { deletedCount }
        });

    } catch (error) {
        console.error('❌ Cleanup Error:', error.message);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi cleanup dữ liệu',
            error: error.message
        });
    }
});

module.exports = router;
