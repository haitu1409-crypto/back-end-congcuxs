/**
 * Prediction Routes - API endpoints cho dự đoán xổ số
 * Tối ưu hiệu suất với caching và rate limiting
 */

const express = require('express');
const rateLimit = require('express-rate-limit');
const {
    getPredictions,
    getPredictionById,
    getPredictionByDate,
    getTodayPrediction,
    getLatestPredictions,
    createPrediction,
    updatePrediction,
    deletePrediction,
    likePrediction,
    sharePrediction
} = require('../controllers/prediction.controller');

const router = express.Router();

// Rate limiting - Very relaxed for development
const generalLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 100, // limit each IP to 100 requests per minute
    skip: (req) => {
        // Skip rate limiting for localhost in development
        return process.env.NODE_ENV === 'development' || req.ip === '127.0.0.1' || req.ip === '::1';
    },
    message: {
        success: false,
        message: 'Quá nhiều yêu cầu, vui lòng thử lại sau'
    }
});

const createLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 50, // limit each IP to 50 create requests per hour
    message: {
        success: false,
        message: 'Quá nhiều yêu cầu tạo dự đoán, vui lòng thử lại sau'
    }
});

// Apply general rate limiting to all routes
router.use(generalLimiter);

// Public routes
router.get('/', getPredictions);
router.get('/today', getTodayPrediction);
router.get('/latest', getLatestPredictions);
router.get('/date/:date', getPredictionByDate); // Format: YYYY-MM-DD
router.get('/:id', getPredictionById); // Get by MongoDB ID

// Interaction routes
router.post('/:id/like', likePrediction);
router.post('/:id/share', sharePrediction);
router.post('/:id/view', (req, res) => {
    // Simple view tracking endpoint
    res.json({ success: true, message: 'View tracked' });
});

// Admin routes
router.post('/create', createLimiter, createPrediction);
router.put('/:id', createLimiter, updatePrediction);
router.delete('/:id', deletePrediction);

module.exports = router;

