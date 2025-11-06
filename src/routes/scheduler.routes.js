/**
 * Optimized Soi Cầu Scheduler Routes
 * Quản lý scheduler tự động tính toán soi cầu
 */

const express = require('express');
const router = express.Router();
const optimizedSoiCauScheduler = require('../services/optimizedSoiCauScheduler.service');

/**
 * GET /api/scheduler/status
 * Lấy trạng thái scheduler
 */
router.get('/status', async (req, res) => {
    try {
        const status = optimizedSoiCauScheduler.getStatus();
        res.json({
            success: true,
            data: status,
            message: 'Scheduler status retrieved successfully'
        });
    } catch (error) {
        console.error('Error getting scheduler status:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get scheduler status',
            error: error.message
        });
    }
});

/**
 * GET /api/scheduler/health
 * Health check cho scheduler
 */
router.get('/health', async (req, res) => {
    try {
        const health = await optimizedSoiCauScheduler.healthCheck();
        res.json({
            success: true,
            data: health,
            message: 'Scheduler health check completed'
        });
    } catch (error) {
        console.error('Error in scheduler health check:', error);
        res.status(500).json({
            success: false,
            message: 'Scheduler health check failed',
            error: error.message
        });
    }
});

/**
 * POST /api/scheduler/run-now
 * Chạy scheduler ngay lập tức
 */
router.post('/run-now', async (req, res) => {
    try {
        const { type = 'soiCau' } = req.body;

        if (!['soiCau', 'result', 'cleanup'].includes(type)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid type. Must be: soiCau, result, or cleanup'
            });
        }

        console.log(`🔄 Manual scheduler run requested: ${type}`);
        await optimizedSoiCauScheduler.runNow(type);

        res.json({
            success: true,
            message: `${type} update completed successfully`,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error('Error running scheduler manually:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to run scheduler manually',
            error: error.message
        });
    }
});

/**
 * POST /api/scheduler/stop
 * Dừng scheduler
 */
router.post('/stop', async (req, res) => {
    try {
        optimizedSoiCauScheduler.stop();
        res.json({
            success: true,
            message: 'Scheduler stopped successfully'
        });
    } catch (error) {
        console.error('Error stopping scheduler:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to stop scheduler',
            error: error.message
        });
    }
});

/**
 * POST /api/scheduler/start
 * Khởi động scheduler
 */
router.post('/start', async (req, res) => {
    try {
        optimizedSoiCauScheduler.init();
        res.json({
            success: true,
            message: 'Scheduler started successfully'
        });
    } catch (error) {
        console.error('Error starting scheduler:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to start scheduler',
            error: error.message
        });
    }
});

/**
 * GET /api/scheduler/next-run
 * Lấy thời gian chạy tiếp theo
 */
router.get('/next-run', async (req, res) => {
    try {
        const nextRun = optimizedSoiCauScheduler.getNextRunTime();
        res.json({
            success: true,
            data: {
                nextRun: nextRun,
                nextRunFormatted: nextRun.toLocaleString('vi-VN'),
                timeUntilNextRun: Math.max(0, nextRun.getTime() - Date.now())
            },
            message: 'Next run time retrieved successfully'
        });
    } catch (error) {
        console.error('Error getting next run time:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get next run time',
            error: error.message
        });
    }
});

module.exports = router;






















