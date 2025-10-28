// Test API để kiểm tra dữ liệu lịch sử
const express = require('express');
const router = express.Router();

router.get('/test-history', async (req, res) => {
    try {
        const { getHistoricalPredictionsSimplified } = require('../controllers/soiCau.controller');
        const targetDate = new Date('2025-10-29');
        const numDays = 14;

        console.log('🔄 Testing getHistoricalPredictionsSimplified...');
        const history = await getHistoricalPredictionsSimplified(targetDate, numDays);

        res.json({
            success: true,
            history: history,
            count: history.length,
            message: 'Test historical predictions'
        });
    } catch (error) {
        console.error('❌ Test error:', error.message);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

module.exports = router;
