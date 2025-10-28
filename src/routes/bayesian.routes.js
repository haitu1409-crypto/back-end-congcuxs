/**
 * Bayesian Routes - API endpoints cho các thuật toán Bayesian
 */

const express = require('express');
const router = express.Router();
const BayesianCDMService = require('../services/bayesianCDM.service');
const EFDMService = require('../services/efdm.service');
const CollaborativeFilteringService = require('../services/collaborativeFiltering.service');

// Khởi tạo services
const cdmService = new BayesianCDMService();
const efdmService = new EFDMService();
const cfService = new CollaborativeFilteringService();

/**
 * CDM - Dự đoán đề (2 số cuối giải đặc biệt)
 * GET /api/bayesian/cdm/de?date=2024-10-25&days=100
 */
router.get('/cdm/de', async (req, res) => {
    try {
        const { date, days = 100 } = req.query;

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

        console.log(`🎯 CDM DE: Predicting for ${date} with ${days} days data`);

        const probabilities = await cdmService.calculateDeProbabilities(targetDate, parseInt(days));
        const topPredictions = cdmService.getTopPredictions(probabilities, 20);

        res.json({
            success: true,
            data: {
                method: 'Bayesian CDM - Đề',
                targetDate: date,
                dataDays: parseInt(days),
                predictions: topPredictions,
                metadata: probabilities._metadata,
                cacheStats: cdmService.getCacheStats()
            }
        });

    } catch (error) {
        console.error('❌ CDM DE Error:', error.message);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi tính toán CDM DE',
            error: error.message
        });
    }
});

/**
 * CDM - Dự đoán lô (2 số cuối tất cả giải)
 * GET /api/bayesian/cdm/lo?date=2024-10-25&days=100
 */
router.get('/cdm/lo', async (req, res) => {
    try {
        const { date, days = 100 } = req.query;

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

        console.log(`🎯 CDM LO: Predicting for ${date} with ${days} days data`);

        const probabilities = await cdmService.calculateLoProbabilities(targetDate, parseInt(days));
        const topPredictions = cdmService.getTopPredictions(probabilities, 20);
        const expectedAppearances = cdmService.calculateExpectedAppearances(probabilities);
        const chanceAppearance = cdmService.calculateChanceAppearance(probabilities);

        res.json({
            success: true,
            data: {
                method: 'Bayesian CDM - Lô',
                targetDate: date,
                dataDays: parseInt(days),
                predictions: topPredictions,
                expectedAppearances: cdmService.getTopPredictions(expectedAppearances, 20),
                chanceAppearance: cdmService.getTopPredictions(chanceAppearance, 20),
                metadata: probabilities._metadata,
                cacheStats: cdmService.getCacheStats()
            }
        });

    } catch (error) {
        console.error('❌ CDM LO Error:', error.message);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi tính toán CDM LO',
            error: error.message
        });
    }
});

/**
 * EFDM - Dự đoán đề (Extended Flexible Dirichlet-Multinomial)
 * GET /api/bayesian/efdm/de?date=2024-10-25&days=100
 */
router.get('/efdm/de', async (req, res) => {
    try {
        const { date, days = 100 } = req.query;

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

        console.log(`🎯 EFDM DE: Predicting for ${date} with ${days} days data`);

        const probabilities = await efdmService.calculateDeProbabilities(targetDate, parseInt(days));
        const topPredictions = efdmService.getTopPredictions(probabilities, 20);

        res.json({
            success: true,
            data: {
                method: 'EFDM - Đề',
                targetDate: date,
                dataDays: parseInt(days),
                predictions: topPredictions,
                metadata: probabilities._metadata,
                cacheStats: efdmService.getCacheStats()
            }
        });

    } catch (error) {
        console.error('❌ EFDM DE Error:', error.message);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi tính toán EFDM DE',
            error: error.message
        });
    }
});

/**
 * EFDM - Dự đoán lô (Extended Flexible Dirichlet-Multinomial)
 * GET /api/bayesian/efdm/lo?date=2024-10-25&days=100
 */
router.get('/efdm/lo', async (req, res) => {
    try {
        const { date, days = 100 } = req.query;

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

        console.log(`🎯 EFDM LO: Predicting for ${date} with ${days} days data`);

        const probabilities = await efdmService.calculateLoProbabilities(targetDate, parseInt(days));
        const topPredictions = efdmService.getTopPredictions(probabilities, 20);
        const expectedAppearances = efdmService.calculateExpectedAppearances(probabilities);
        const chanceAppearance = efdmService.calculateChanceAppearance(probabilities);

        res.json({
            success: true,
            data: {
                method: 'EFDM - Lô',
                targetDate: date,
                dataDays: parseInt(days),
                predictions: topPredictions,
                expectedAppearances: efdmService.getTopPredictions(expectedAppearances, 20),
                chanceAppearance: efdmService.getTopPredictions(chanceAppearance, 20),
                metadata: probabilities._metadata,
                cacheStats: efdmService.getCacheStats()
            }
        });

    } catch (error) {
        console.error('❌ EFDM LO Error:', error.message);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi tính toán EFDM LO',
            error: error.message
        });
    }
});

/**
 * Collaborative Filtering - Dự đoán
 * GET /api/bayesian/cf?date=2024-10-25&days=100&topK=5
 */
router.get('/cf', async (req, res) => {
    try {
        const { date, days = 100, topK = 5 } = req.query;

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

        console.log(`🎯 CF: Predicting for ${date} with ${days} days data, topK=${topK}`);

        const predictions = await cfService.predict(targetDate, parseInt(days), parseInt(topK));
        const topPredictions = cfService.getTopPredictions(predictions, 20);

        res.json({
            success: true,
            data: {
                method: 'Collaborative Filtering',
                targetDate: date,
                dataDays: parseInt(days),
                topK: parseInt(topK),
                predictions: topPredictions,
                metadata: predictions._metadata,
                cacheStats: cfService.getCacheStats()
            }
        });

    } catch (error) {
        console.error('❌ CF Error:', error.message);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi tính toán Collaborative Filtering',
            error: error.message
        });
    }
});

/**
 * So sánh CDM vs EFDM
 * GET /api/bayesian/compare?date=2024-10-25&days=100&type=de
 */
router.get('/compare', async (req, res) => {
    try {
        const { date, days = 100, type = 'de' } = req.query;

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

        if (!['de', 'lo'].includes(type)) {
            return res.status(400).json({
                success: false,
                message: 'Type phải là "de" hoặc "lo"'
            });
        }

        console.log(`🎯 Compare: CDM vs EFDM for ${type} on ${date}`);

        let cdmProbs, efdmProbs;

        if (type === 'de') {
            cdmProbs = await cdmService.calculateDeProbabilities(targetDate, parseInt(days));
            efdmProbs = await efdmService.calculateDeProbabilities(targetDate, parseInt(days));
        } else {
            cdmProbs = await cdmService.calculateLoProbabilities(targetDate, parseInt(days));
            efdmProbs = await efdmService.calculateLoProbabilities(targetDate, parseInt(days));
        }

        const comparison = efdmService.compareWithCDM(efdmProbs, cdmProbs);
        const topComparison = Object.entries(comparison)
            .filter(([key]) => !key.startsWith('_'))
            .sort((a, b) => b[1].efdm - a[1].efdm)
            .slice(0, 20);

        res.json({
            success: true,
            data: {
                method: `CDM vs EFDM - ${type.toUpperCase()}`,
                targetDate: date,
                dataDays: parseInt(days),
                comparison: topComparison,
                cdmMetadata: cdmProbs._metadata,
                efdmMetadata: efdmProbs._metadata,
                cacheStats: {
                    cdm: cdmService.getCacheStats(),
                    efdm: efdmService.getCacheStats()
                }
            }
        });

    } catch (error) {
        console.error('❌ Compare Error:', error.message);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi so sánh CDM vs EFDM',
            error: error.message
        });
    }
});

/**
 * Ensemble - Kết hợp tất cả phương pháp
 * GET /api/bayesian/ensemble?date=2024-10-25&days=100&topK=5
 */
router.get('/ensemble', async (req, res) => {
    try {
        const { date, days = 100, topK = 5 } = req.query;

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

        console.log(`🎯 Ensemble: Predicting for ${date} with all methods`);

        // Tính toán song song
        const [cdmDeProbs, efdmDeProbs, cfPredictions] = await Promise.all([
            cdmService.calculateDeProbabilities(targetDate, parseInt(days)),
            efdmService.calculateDeProbabilities(targetDate, parseInt(days)),
            cfService.predict(targetDate, parseInt(days), parseInt(topK))
        ]);

        // Kết hợp predictions với weights
        const weights = { cdm: 0.3, efdm: 0.4, cf: 0.3 };
        const ensemblePredictions = {};

        for (let i = 0; i < 100; i++) {
            const num = i.toString().padStart(2, '0');
            ensemblePredictions[num] =
                (cdmDeProbs[num] * weights.cdm) +
                (efdmDeProbs[num] * weights.efdm) +
                (cfPredictions[num] * weights.cf);
        }

        const topPredictions = Object.entries(ensemblePredictions)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 20)
            .map(([number, probability]) => ({
                number,
                probability: probability,
                percentage: (probability * 100).toFixed(2)
            }));

        res.json({
            success: true,
            data: {
                method: 'Ensemble (CDM + EFDM + CF)',
                targetDate: date,
                dataDays: parseInt(days),
                topK: parseInt(topK),
                weights: weights,
                predictions: topPredictions,
                individualResults: {
                    cdm: cdmService.getTopPredictions(cdmDeProbs, 10),
                    efdm: efdmService.getTopPredictions(efdmDeProbs, 10),
                    cf: cfService.getTopPredictions(cfPredictions, 10)
                },
                cacheStats: {
                    cdm: cdmService.getCacheStats(),
                    efdm: efdmService.getCacheStats(),
                    cf: cfService.getCacheStats()
                }
            }
        });

    } catch (error) {
        console.error('❌ Ensemble Error:', error.message);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi tính toán Ensemble',
            error: error.message
        });
    }
});

/**
 * Cache management
 * DELETE /api/bayesian/cache
 */
router.delete('/cache', (req, res) => {
    try {
        cdmService.clearCache();
        efdmService.clearCache();
        cfService.clearCache();

        res.json({
            success: true,
            message: 'Đã xóa tất cả cache Bayesian'
        });

    } catch (error) {
        console.error('❌ Cache clear Error:', error.message);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi xóa cache',
            error: error.message
        });
    }
});

/**
 * Cache stats
 * GET /api/bayesian/cache/stats
 */
router.get('/cache/stats', (req, res) => {
    try {
        res.json({
            success: true,
            data: {
                cdm: cdmService.getCacheStats(),
                efdm: efdmService.getCacheStats(),
                cf: cfService.getCacheStats()
            }
        });

    } catch (error) {
        console.error('❌ Cache stats Error:', error.message);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy cache stats',
            error: error.message
        });
    }
});

module.exports = router;
