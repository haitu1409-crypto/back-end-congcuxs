const express = require('express');
const router = express.Router();
const { predictNumbers } = require('../controllers/predictionController');
const { 
    getTodayPrediction,
    createPrediction,
    updatePrediction,
    deletePrediction,
    getLatestPredictions,
    getPredictionByDate
} = require('../controllers/prediction.controller');
const rateLimit = require('express-rate-limit');

// Rate limiter cho prediction
const predictionLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 50,
    message: 'Quá nhiều yêu cầu dự đoán, vui lòng thử lại sau',
    keyGenerator: (req) => {
        return req.headers['x-user-id'] || req.ip;
    },
    skip: (req) => {
        return process.env.NODE_ENV === 'development' || req.ip === '127.0.0.1' || req.ip === '::1';
    },
});

// Rate limiter cho admin operations (nghiêm ngặt hơn)
const adminLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    message: 'Quá nhiều yêu cầu, vui lòng thử lại sau',
    keyGenerator: (req) => {
        return req.headers['x-user-id'] || req.ip;
    },
    skip: (req) => {
        return process.env.NODE_ENV === 'development' || req.ip === '127.0.0.1' || req.ip === '::1';
    },
});

// API dự đoán kết quả
router.post('/predict', predictionLimiter, async (req, res) => {
    await predictNumbers(req, res);
});

// API lấy dự đoán hôm nay
router.get('/today', async (req, res) => {
    await getTodayPrediction(req, res);
});

// API tạo dự đoán mới (Admin only)
router.post('/create', adminLimiter, async (req, res) => {
    await createPrediction(req, res);
});

// API cập nhật dự đoán (Admin only)
router.put('/:id', adminLimiter, async (req, res) => {
    await updatePrediction(req, res);
});

// API xóa dự đoán (Admin only)
router.delete('/:id', adminLimiter, async (req, res) => {
    await deletePrediction(req, res);
});

// API lấy danh sách dự đoán mới nhất
router.get('/', async (req, res) => {
    await getLatestPredictions(req, res);
});

// API lấy dự đoán theo ngày
router.get('/date/:date', async (req, res) => {
    await getPredictionByDate(req, res);
});

module.exports = router;
