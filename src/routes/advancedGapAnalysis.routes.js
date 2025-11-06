/**
 * Advanced Gap Analysis Routes
 * API endpoints cho thuật toán soi cầu nâng cao với Gap Analysis
 */

const express = require('express');
const router = express.Router();
const AdvancedGapAnalysisService = require('../services/advancedGapAnalysis.service');

/**
 * GET /api/advanced-gap-analysis/predict/:date/:type
 * Dự đoán với Advanced Gap Analysis
 */
router.get('/predict/:date/:type', async (req, res) => {
    try {
        const { date, type } = req.params;
        const { days = 100 } = req.query;

        // Validate parameters
        if (!date || !type) {
            return res.status(400).json({
                success: false,
                message: 'Thiếu tham số date hoặc type'
            });
        }

        if (!['de', 'lo'].includes(type)) {
            return res.status(400).json({
                success: false,
                message: 'Type phải là "de" hoặc "lo"'
            });
        }

        // Parse date
        const targetDate = new Date(date);
        if (isNaN(targetDate.getTime())) {
            return res.status(400).json({
                success: false,
                message: 'Định dạng ngày không hợp lệ (sử dụng YYYY-MM-DD)'
            });
        }

        console.log(`🎯 Advanced Gap Analysis for ${date} - Type: ${type.toUpperCase()}`);

        // Get predictions
        const result = await AdvancedGapAnalysisService.predict(targetDate, type, parseInt(days));

        res.json({
            success: true,
            data: result,
            message: `Advanced Gap Analysis completed for ${date}`
        });

    } catch (error) {
        console.error('❌ Advanced Gap Analysis error:', error.message);
        res.status(500).json({
            success: false,
            message: error.message || 'Lỗi khi thực hiện Advanced Gap Analysis'
        });
    }
});

/**
 * GET /api/advanced-gap-analysis/gap-analysis/:date/:type
 * Phân tích Gap Pattern chi tiết
 */
router.get('/gap-analysis/:date/:type', async (req, res) => {
    try {
        const { date, type } = req.params;
        const { gapDays = 10 } = req.query;

        const targetDate = new Date(date);
        if (isNaN(targetDate.getTime())) {
            return res.status(400).json({
                success: false,
                message: 'Định dạng ngày không hợp lệ'
            });
        }

        // Get historical data
        const historicalData = await AdvancedGapAnalysisService.getHistoricalData(targetDate, 100);

        // Analyze gap patterns
        const gap10Days = AdvancedGapAnalysisService.analyzeGapPattern(historicalData, 10, type);
        const gap30Days = AdvancedGapAnalysisService.analyzeGapPattern(historicalData, 30, type);

        res.json({
            success: true,
            data: {
                gap10Days,
                gap30Days,
                analysis: {
                    totalAnalyzed: historicalData.length,
                    hotNumbers10: gap10Days.hotNumbers.length,
                    coldNumbers10: gap10Days.coldNumbers.length,
                    hotNumbers30: gap30Days.hotNumbers.length,
                    coldNumbers30: gap30Days.coldNumbers.length
                }
            },
            message: `Gap analysis completed for ${date}`
        });

    } catch (error) {
        console.error('❌ Gap analysis error:', error.message);
        res.status(500).json({
            success: false,
            message: error.message || 'Lỗi khi phân tích Gap Pattern'
        });
    }
});

/**
 * GET /api/advanced-gap-analysis/daily-uniqueness/:date/:type
 * Phân tích Daily Uniqueness
 */
router.get('/daily-uniqueness/:date/:type', async (req, res) => {
    try {
        const { date, type } = req.params;
        const targetDate = new Date(date);

        if (isNaN(targetDate.getTime())) {
            return res.status(400).json({
                success: false,
                message: 'Định dạng ngày không hợp lệ'
            });
        }

        // Get basic predictions first
        const result = await AdvancedGapAnalysisService.predict(targetDate, type, 100);

        // Extract uniqueness analysis
        const uniquenessAnalysis = {
            targetDate: date,
            type,
            uniquenessScore: result.metadata.uniqueness,
            confidence: result.metadata.confidence,
            uniquePredictions: result.predictions.filter(p => p.uniqueness > 1.0),
            specialNotes: result.predictions.map(p => ({
                number: p.number,
                note: p.specialNote,
                uniqueness: p.uniqueness
            }))
        };

        res.json({
            success: true,
            data: uniquenessAnalysis,
            message: `Daily uniqueness analysis completed for ${date}`
        });

    } catch (error) {
        console.error('❌ Daily uniqueness error:', error.message);
        res.status(500).json({
            success: false,
            message: error.message || 'Lỗi khi phân tích Daily Uniqueness'
        });
    }
});

/**
 * GET /api/advanced-gap-analysis/compare/:date/:type
 * So sánh với các phương pháp khác
 */
router.get('/compare/:date/:type', async (req, res) => {
    try {
        const { date, type } = req.params;
        const targetDate = new Date(date);

        if (isNaN(targetDate.getTime())) {
            return res.status(400).json({
                success: false,
                message: 'Định dạng ngày không hợp lệ'
            });
        }

        // Get Advanced Gap Analysis results
        const gapAnalysisResult = await AdvancedGapAnalysisService.predict(targetDate, type, 100);

        // Get traditional methods for comparison
        const bayesianService = require('../services/bayesianCDM.service');
        const efdmService = require('../services/efdm.service');

        const cdmResult = type === 'de'
            ? await bayesianService.calculateDeProbabilities(targetDate, 30)
            : await bayesianService.calculateLoProbabilities(targetDate, 30);

        const efdmResult = type === 'de'
            ? await efdmService.calculateDeProbabilities(targetDate, 30)
            : await efdmService.calculateLoProbabilities(targetDate, 30);

        // Convert to comparable format
        const convertToComparable = (probs) => {
            return Object.entries(probs)
                .filter(([key]) => !key.startsWith('_'))
                .map(([number, probability]) => ({
                    number,
                    score: probability,
                    percentage: (probability * 100).toFixed(2)
                }))
                .sort((a, b) => b.score - a.score)
                .slice(0, 20);
        };

        const comparison = {
            advancedGapAnalysis: gapAnalysisResult.predictions.slice(0, 20),
            cdm: convertToComparable(cdmResult),
            efdm: convertToComparable(efdmResult),
            analysis: {
                gapAnalysisUniqueness: gapAnalysisResult.metadata.uniqueness,
                gapAnalysisConfidence: gapAnalysisResult.metadata.confidence,
                totalMethods: 3
            }
        };

        res.json({
            success: true,
            data: comparison,
            message: `Comparison completed for ${date}`
        });

    } catch (error) {
        console.error('❌ Comparison error:', error.message);
        res.status(500).json({
            success: false,
            message: error.message || 'Lỗi khi so sánh các phương pháp'
        });
    }
});

module.exports = router;





















