const express = require('express');
const router = express.Router();
const { predictNumbers } = require('../controllers/predictionController');
const { getTodayPrediction } = require('../controllers/prediction.controller');
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

// API dự đoán kết quả
router.post('/predict', predictionLimiter, async (req, res) => {
    await predictNumbers(req, res);
});

// API lấy dự đoán hôm nay
router.get('/today', async (req, res) => {
    await getTodayPrediction(req, res);
});

module.exports = router;
