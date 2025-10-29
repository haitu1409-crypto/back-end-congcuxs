/**
 * Soi Cầu Service - Quản lý soi cầu và tracking độ chính xác
 */

const SoiCau = require('../models/soicau.model');
const XSMB = require('../models/xsmb.model');
const BayesianCDMService = require('./bayesianCDM.service');
const EFDMService = require('./efdm.service');
const CollaborativeFilteringService = require('./collaborativeFiltering.service');
const ProbabilityStatisticsService = require('./probabilityStatistics.service');
const AdvancedSoiCauService = require('./advancedSoiCau.service');

class SoiCauService {
    constructor() {
        this.cdmService = new BayesianCDMService();
        this.efdmService = new EFDMService();
        this.cfService = new CollaborativeFilteringService();
        this.probabilityStatsService = new ProbabilityStatisticsService();
        this.advancedSoiCauService = new AdvancedSoiCauService();

        console.log('✅ SoiCauService initialized with Advanced Soi Cầu');
    }

    /**
     * Tạo soi cầu cho ngày hôm sau
     * @param {Date} targetDate - Ngày dự đoán (hôm sau)
     * @param {number} days - Số ngày dữ liệu lịch sử
     * @param {number} topK - Số lượng kỳ tương tự cho CF
     * @returns {Object} Kết quả soi cầu
     */
    async generateSoiCau(targetDate, days = 14, topK = 5) {
        try {
            console.log(`🎯 Generating soi cầu for ${targetDate.toISOString().split('T')[0]}`);

            // FORCE: Delete existing soi cầu để tính lại với logic mới
            const existingSoiCau = await SoiCau.findByPredictionDate(targetDate);
            if (existingSoiCau) {
                console.log('🔄 Deleting old soi cầu to force regenerate with NEW logic...');
                await SoiCau.deleteOne({ _id: existingSoiCau._id });
            }

            const startTime = Date.now();

            // Kiểm tra xem đã có soi cầu cho ngày này chưa
            // const existingSoiCau = await SoiCau.findByPredictionDate(targetDate);
            // if (existingSoiCau) {
            //     console.log('📋 Soi cầu đã tồn tại, trả về kết quả cached');
            //     return existingSoiCau;
            // }

            // Tính toán song song tất cả các phương pháp, BÃO HÒA có Advanced Soi Cầu
            const [cdmDeProbs, cdmLoProbs, efdmDeProbs, efdmLoProbs, cfPredictions, advancedProbs] = await Promise.all([
                this.cdmService.calculateDeProbabilities(targetDate, days),
                this.cdmService.calculateLoProbabilities(targetDate, days),
                this.efdmService.calculateDeProbabilities(targetDate, days),
                this.efdmService.calculateLoProbabilities(targetDate, days),
                this.cfService.predict(targetDate, days, topK),
                this.advancedSoiCauService.predict(targetDate, days).catch(err => {
                    console.warn('⚠️ Advanced Soi Cầu failed:', err.message);
                    return null; // Return null if fails
                })
            ]);

            // Lấy top predictions
            const cdmDeTop = this.cdmService.getTopPredictions(cdmDeProbs, 20);
            const cdmLoTop = this.cdmService.getTopPredictions(cdmLoProbs, 20);
            const efdmDeTop = this.efdmService.getTopPredictions(efdmDeProbs, 20);
            const efdmLoTop = this.efdmService.getTopPredictions(efdmLoProbs, 20);
            const cfTop = this.cfService.getTopPredictions(cfPredictions, 20);

            // Tính expected appearances và chance appearance cho lô
            const cdmLoExpected = this.cdmService.calculateExpectedAppearances(cdmLoProbs);
            const cdmLoChance = this.cdmService.calculateChanceAppearance(cdmLoProbs);
            const efdmLoExpected = this.efdmService.calculateExpectedAppearances(efdmLoProbs);
            const efdmLoChance = this.efdmService.calculateChanceAppearance(efdmLoProbs);

            // Kết hợp predictions với expected appearances và chance
            const cdmLoWithStats = cdmLoTop.map(item => ({
                ...item,
                expectedAppearances: cdmLoExpected[item.number] || 0,
                chanceAppearance: cdmLoChance[item.number] || 0
            }));

            const efdmLoWithStats = efdmLoTop.map(item => ({
                ...item,
                expectedAppearances: efdmLoExpected[item.number] || 0,
                chanceAppearance: efdmLoChance[item.number] || 0
            }));

            // Tạo ensemble prediction với Advanced Soi Cầu
            const ensemblePredictions = advancedProbs
                ? this.createAdvancedEnsemblePredictions(cdmDeProbs, efdmDeProbs, cfPredictions, advancedProbs)
                : this.createEnsemblePredictions(cdmDeProbs, efdmDeProbs, cfPredictions);

            const ensembleTop = Object.entries(ensemblePredictions)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 20)
                .map(([number, probability]) => ({
                    number,
                    probability,
                    percentage: (probability * 100).toFixed(2)
                }));

            // Tạo document soi cầu
            const soiCauData = {
                predictionDate: targetDate,
                drawDate: targetDate, // Ngày quay số
                predictions: {
                    cdm: {
                        de: cdmDeTop,
                        lo: cdmLoWithStats
                    },
                    efdm: {
                        de: efdmDeTop,
                        lo: efdmLoWithStats
                    },
                    collaborativeFiltering: cfTop,
                    ensemble: ensembleTop
                },
                metadata: {
                    dataDays: days,
                    topK: topK,
                    algorithm: 'all',
                    processingTime: Date.now() - startTime,
                    cacheHit: false
                }
            };

            // Lưu vào database
            const soiCau = new SoiCau(soiCauData);
            await soiCau.save();

            // Tính toán và lưu thống kê xác suất chi tiết
            try {
                console.log(`🔄 Calculating probability statistics for ${targetDate.toISOString().split('T')[0]}`);
                await this.probabilityStatsService.calculateAndSaveProbabilityStatistics(targetDate);
                console.log(`✅ Probability statistics calculated and saved`);
            } catch (error) {
                console.error('⚠️ Error calculating probability statistics:', error);
                // Không throw error để không ảnh hưởng đến việc tạo soi cầu
            }

            console.log(`✅ Soi cầu generated with NEW logic for ${targetDate.toISOString().split('T')[0]}`);
            return soiCau;

        } catch (error) {
            console.error('❌ Error generating soi cầu:', error);
            throw error;
        }
    }

    /**
     * Tạo ensemble predictions
     * @param {Object} cdmProbs - CDM probabilities
     * @param {Object} efdmProbs - EFDM probabilities  
     * @param {Object} cfProbs - CF probabilities
     * @returns {Object} Ensemble predictions
     */
    createEnsemblePredictions(cdmProbs, efdmProbs, cfProbs) {
        const weights = { cdm: 0.3, efdm: 0.4, cf: 0.3 };
        const ensemblePredictions = {};

        for (let i = 0; i < 100; i++) {
            const num = i.toString().padStart(2, '0');
            ensemblePredictions[num] =
                (cdmProbs[num] * weights.cdm) +
                (efdmProbs[num] * weights.efdm) +
                (cfProbs[num] * weights.cf);
        }

        return ensemblePredictions;
    }

    /**
     * Tạo ensemble predictions với Advanced Soi Cầu (7 methods)
     * @param {Object} cdmProbs - CDM probabilities
     * @param {Object} efdmProbs - EFDM probabilities
     * @param {Object} cfProbs - CF probabilities
     * @param {Object} advancedProbs - Advanced Soi Cầu probabilities (7 methods combined)
     * @returns {Object} Ensemble predictions
     */
    createAdvancedEnsemblePredictions(cdmProbs, efdmProbs, cfProbs, advancedProbs) {
        // NEW STRATEGY: Tăng weight cho Advanced để tránh số đã ra
        const weights = {
            cdm: 0.1,       // Giảm weight để tránh bias old numbers
            efdm: 0.1,      // Giảm weight để tránh bias old numbers
            cf: 0.1,        // Giảm weight
            advanced: 0.7   // 70% cho Advanced (7 methods áp dụng penalty đúng)
        };
        const ensemblePredictions = {};

        for (let i = 0; i < 100; i++) {
            const num = i.toString().padStart(2, '0');
            ensemblePredictions[num] =
                (cdmProbs[num] * weights.cdm) +
                (efdmProbs[num] * weights.efdm) +
                (cfProbs[num] * weights.cf) +
                (advancedProbs[num] * weights.advanced || 0);
        }

        // NORMALIZE để tổng prob = 1
        const total = Object.values(ensemblePredictions).reduce((sum, prob) => sum + prob, 0);
        for (let i = 0; i < 100; i++) {
            const num = i.toString().padStart(2, '0');
            ensemblePredictions[num] = ensemblePredictions[num] / total;
        }

        console.log('🔧 Applied NEW ensemble weights:', weights);
        return ensemblePredictions;
    }

    /**
     * Cập nhật kết quả thực tế và tính độ chính xác
     * @param {Date} drawDate - Ngày quay số
     * @returns {Object} Kết quả cập nhật
     */
    async updateActualResults(drawDate) {
        try {
            console.log(`🔄 Updating actual results for ${drawDate.toISOString().split('T')[0]}`);

            // Lấy kết quả xổ số thực tế
            const actualResult = await XSMB.findByDate(drawDate);
            if (!actualResult) {
                throw new Error(`Không tìm thấy kết quả xổ số cho ngày ${drawDate.toISOString().split('T')[0]}`);
            }

            // Lấy soi cầu đã dự đoán
            const soiCau = await SoiCau.findByDrawDate(drawDate);
            if (!soiCau) {
                throw new Error(`Không tìm thấy soi cầu cho ngày ${drawDate.toISOString().split('T')[0]}`);
            }

            // Trích xuất số thực tế
            const actualDe = actualResult.specialPrize?.[0]?.slice(-2) || '';
            const actualLo = this.extractActualLo(actualResult);

            // Cập nhật kết quả thực tế
            soiCau.actualResults.de = actualDe;
            soiCau.actualResults.lo = actualLo;

            // Tính độ chính xác
            soiCau.calculateAccuracy(actualDe, actualLo);

            // Lưu vào database
            await soiCau.save();

            console.log(`✅ Actual results updated for ${drawDate.toISOString().split('T')[0]}`);
            return soiCau;

        } catch (error) {
            console.error('❌ Error updating actual results:', error);
            throw error;
        }
    }

    /**
     * Trích xuất lô thực tế từ kết quả xổ số
     * @param {Object} result - Kết quả xổ số
     * @returns {Array} Danh sách lô thực tế
     */
    extractActualLo(result) {
        const allPrizes = [
            ...(result.specialPrize || []),
            ...(result.firstPrize || []),
            ...(result.secondPrize || []),
            ...(result.threePrizes || []),
            ...(result.fourPrizes || []),
            ...(result.fivePrizes || []),
            ...(result.sixPrizes || []),
            ...(result.sevenPrizes || [])
        ];

        return allPrizes
            .filter(prize => prize && prize.length >= 2)
            .map(prize => prize.slice(-2))
            .filter(num => /^\d{2}$/.test(num));
    }

    /**
     * Lấy soi cầu theo ngày
     * @param {Date} date - Ngày dự đoán
     * @returns {Object} Soi cầu
     */
    async getSoiCauByDate(date) {
        try {
            const soiCau = await SoiCau.findByPredictionDate(date);
            if (!soiCau) {
                throw new Error(`Không tìm thấy soi cầu cho ngày ${date.toISOString().split('T')[0]}`);
            }
            return soiCau;
        } catch (error) {
            console.error('❌ Error getting soi cầu by date:', error);
            throw error;
        }
    }

    /**
     * Lấy lịch sử soi cầu
     * @param {number} limit - Số lượng bản ghi
     * @param {number} days - Số ngày gần nhất
     * @returns {Array} Lịch sử soi cầu
     */
    async getSoiCauHistory(limit = 30, days = 30) {
        try {
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - days);

            const history = await SoiCau.find({
                predictionDate: { $gte: startDate },
                'actualResults.isProcessed': true
            })
                .sort({ predictionDate: -1 })
                .limit(limit)
                .lean();

            return history;
        } catch (error) {
            console.error('❌ Error getting soi cầu history:', error);
            throw error;
        }
    }

    /**
     * Lấy lịch sử soi cầu chi tiết với trạng thái và kết quả
     * @param {number} limit - Số bản ghi tối đa
     * @param {number} days - Số ngày gần nhất
     * @param {string} type - Loại dự đoán (de/lo)
     * @returns {Array} Lịch sử soi cầu chi tiết
     */
    async getDetailedSoiCauHistory(limit = 14, days = 14, type = 'de') {
        try {
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - days);

            // Lấy tất cả dữ liệu soi cầu trong khoảng thời gian
            const history = await SoiCau.find({
                predictionDate: { $gte: startDate }
            })
                .sort({ predictionDate: -1 })
                .limit(limit)
                .lean();

            // Xử lý từng bản ghi để tạo dữ liệu chi tiết
            const detailedHistory = await Promise.all(history.map(async (record) => {
                const predictionDate = new Date(record.predictionDate);
                const today = new Date();
                const isWaiting = predictionDate > today;

                // Lấy predictions theo type
                let predictions = [];
                if (type === 'de') {
                    // Đề: lấy từ ensemble (tổng hợp tất cả methods)
                    predictions = record.predictions?.ensemble || [];
                } else {
                    // Lô: lấy từ cdm.lo, fallback sang efdm.lo, cuối cùng mới ensemble
                    // (bỏ qua collaborativeFiltering vì thường có probability = 0)
                    predictions = record.predictions?.cdm?.lo ||
                        record.predictions?.efdm?.lo ||
                        record.predictions?.ensemble || [];
                }

                // Tạo nuôi khung (framing strategy) - cố định 3 ngày
                const framingStrategy = this.generateFramingStrategy(predictions, type);

                // Xác định kết quả thực tế theo khung 3 ngày
                let actualResult = 'Đang chờ...';
                let resultClass = 'waiting';

                if (type === 'de') {
                    // Đề: kiểm tra khung 3 ngày (ngày dự đoán + 2 ngày sau)
                    const frameResult = await this.checkDeFrameResult(predictionDate, predictions);
                    actualResult = frameResult.result;
                    resultClass = frameResult.class;
                } else {
                    // Lô: kiểm tra khung 3 ngày
                    const frameResult = await this.checkLoFrameResult(predictionDate, predictions);
                    actualResult = frameResult.result;
                    resultClass = frameResult.class;
                }

                return {
                    date: predictionDate.toLocaleDateString('vi-VN'),
                    predictions: predictions.map(p => p.number).join(', '),
                    framingStrategy: framingStrategy,
                    actualResult: actualResult,
                    resultClass: resultClass,
                    predictionDate: predictionDate,
                    isWaiting: isWaiting
                };
            }));

            return detailedHistory;
        } catch (error) {
            console.error('❌ Error getting detailed soi cầu history:', error);
            throw error;
        }
    }

    /**
     * Kiểm tra kết quả đề theo khung 3 ngày
     * @param {Date} predictionDate - Ngày dự đoán
     * @param {Array} predictions - Danh sách dự đoán
     * @returns {Object} Kết quả kiểm tra
     */
    async checkDeFrameResult(predictionDate, predictions) {
        try {
            const today = new Date();
            const predictedNumbers = predictions.map(p => p.number);

            // Tính ngày kết thúc khung (ngày dự đoán + 2 ngày)
            const frameEndDate = new Date(predictionDate);
            frameEndDate.setDate(frameEndDate.getDate() + 2);

            // Nếu chưa đến ngày dự đoán
            if (predictionDate > today) {
                return {
                    result: 'Đang chờ...',
                    class: 'waiting'
                };
            }

            // Nếu chưa hết khung 3 ngày
            if (frameEndDate > today) {
                return {
                    result: 'Đang chờ...',
                    class: 'waiting'
                };
            }

            // Kiểm tra kết quả trong khung 3 ngày
            const XSMB = require('../models/xsmb.model');
            let hitDay = null;
            let hitNumber = null;

            for (let i = 0; i < 3; i++) {
                const checkDate = new Date(predictionDate);
                checkDate.setDate(checkDate.getDate() + i);

                try {
                    const xsmbData = await XSMB.findByDate(checkDate);
                    if (xsmbData && xsmbData.specialPrize) {
                        const specialPrize = xsmbData.specialPrize.toString();
                        const lastTwoDigits = specialPrize.slice(-2);

                        if (predictedNumbers.includes(lastTwoDigits)) {
                            hitDay = checkDate.toLocaleDateString('vi-VN');
                            hitNumber = lastTwoDigits;
                            break;
                        }
                    }
                } catch (err) {
                    // Không có dữ liệu cho ngày này, tiếp tục
                    continue;
                }
            }

            if (hitDay && hitNumber) {
                return {
                    result: `${hitNumber} (ngày ${hitDay})`,
                    class: 'hit'
                };
            } else {
                return {
                    result: 'Trượt',
                    class: 'miss'
                };
            }
        } catch (error) {
            console.error('❌ Error checking DE frame result:', error);
            return {
                result: 'Lỗi kiểm tra',
                class: 'waiting'
            };
        }
    }

    /**
     * Kiểm tra kết quả lô theo khung 3 ngày
     * @param {Date} predictionDate - Ngày dự đoán
     * @param {Array} predictions - Danh sách dự đoán
     * @returns {Object} Kết quả kiểm tra
     */
    async checkLoFrameResult(predictionDate, predictions) {
        try {
            const today = new Date();
            const predictedNumbers = predictions.map(p => p.number);

            // Tính ngày kết thúc khung (ngày dự đoán + 2 ngày)
            const frameEndDate = new Date(predictionDate);
            frameEndDate.setDate(frameEndDate.getDate() + 2);

            // Nếu chưa đến ngày dự đoán
            if (predictionDate > today) {
                return {
                    result: 'Đang chờ...',
                    class: 'waiting'
                };
            }

            // Nếu chưa hết khung 3 ngày
            if (frameEndDate > today) {
                return {
                    result: 'Đang chờ...',
                    class: 'waiting'
                };
            }

            // Kiểm tra kết quả trong khung 3 ngày
            const XSMB = require('../models/xsmb.model');
            let hitNumbers = [];
            let hitDays = [];

            for (let i = 0; i < 3; i++) {
                const checkDate = new Date(predictionDate);
                checkDate.setDate(checkDate.getDate() + i);

                try {
                    const xsmbData = await XSMB.findByDate(checkDate);
                    if (xsmbData) {
                        // Lấy tất cả 2 số cuối từ các giải
                        const allNumbers = [];
                        if (xsmbData.specialPrize) allNumbers.push(xsmbData.specialPrize.toString().slice(-2));
                        if (xsmbData.firstPrize) allNumbers.push(xsmbData.firstPrize.toString().slice(-2));
                        if (xsmbData.secondPrize) {
                            xsmbData.secondPrize.forEach(prize => {
                                allNumbers.push(prize.toString().slice(-2));
                            });
                        }
                        if (xsmbData.threePrizes) {
                            xsmbData.threePrizes.forEach(prize => {
                                allNumbers.push(prize.toString().slice(-2));
                            });
                        }
                        if (xsmbData.fourPrizes) {
                            xsmbData.fourPrizes.forEach(prize => {
                                allNumbers.push(prize.toString().slice(-2));
                            });
                        }
                        if (xsmbData.fivePrizes) {
                            xsmbData.fivePrizes.forEach(prize => {
                                allNumbers.push(prize.toString().slice(-2));
                            });
                        }
                        if (xsmbData.sixPrizes) {
                            xsmbData.sixPrizes.forEach(prize => {
                                allNumbers.push(prize.toString().slice(-2));
                            });
                        }
                        if (xsmbData.sevenPrizes) {
                            xsmbData.sevenPrizes.forEach(prize => {
                                allNumbers.push(prize.toString().slice(-2));
                            });
                        }

                        // Kiểm tra số trúng
                        const dayHitNumbers = predictedNumbers.filter(num => allNumbers.includes(num));
                        if (dayHitNumbers.length > 0) {
                            hitNumbers.push(...dayHitNumbers);
                            hitDays.push(checkDate.toLocaleDateString('vi-VN'));
                        }
                    }
                } catch (err) {
                    // Không có dữ liệu cho ngày này, tiếp tục
                    continue;
                }
            }

            if (hitNumbers.length > 0) {
                const uniqueHitNumbers = [...new Set(hitNumbers)];
                const uniqueHitDays = [...new Set(hitDays)];
                return {
                    result: `${uniqueHitNumbers.join(', ')} (ngày ${uniqueHitDays.join(', ')})`,
                    class: 'hit'
                };
            } else {
                return {
                    result: 'Trượt',
                    class: 'miss'
                };
            }
        } catch (error) {
            console.error('❌ Error checking LO frame result:', error);
            return {
                result: 'Lỗi kiểm tra',
                class: 'waiting'
            };
        }
    }

    /**
     * Tạo chiến lược nuôi khung (cố định 3 ngày)
     * @param {Array} predictions - Danh sách dự đoán
     * @param {string} type - Loại dự đoán
     * @returns {Array} Chiến lược nuôi khung
     */
    generateFramingStrategy(predictions, type) {
        const strategies = [];

        // Chia predictions thành các nhóm 3 ngày
        const groupSize = 3;
        for (let i = 0; i < predictions.length; i += groupSize) {
            const group = predictions.slice(i, i + groupSize);
            if (group.length > 0) {
                strategies.push({
                    numbers: group.map(p => p.number),
                    days: 3 // Cố định 3 ngày
                });
            }
        }

        return strategies;
    }


    /**
     * Tính số ngày trúng
     * @param {Date} predictionDate - Ngày dự đoán
     * @param {Date} drawDate - Ngày xổ
     * @param {number} hitCount - Số lần trúng
     * @returns {string} Mô tả ngày trúng
     */
    calculateHitDays(predictionDate, drawDate, hitCount) {
        const daysDiff = Math.ceil((drawDate - predictionDate) / (1000 * 60 * 60 * 24));
        return `${hitCount}/${daysDiff}`;
    }

    /**
     * Lấy thống kê độ chính xác
     * @param {number} days - Số ngày gần nhất
     * @returns {Object} Thống kê độ chính xác
     */
    async getAccuracyStats(days = 30) {
        try {
            const stats = await SoiCau.getAccuracyStats(days);

            if (stats.length === 0) {
                return {
                    totalPredictions: 0,
                    cdmDeAccuracy: 0,
                    efdmDeAccuracy: 0,
                    avgCdmLoHitRate: 0,
                    avgEfdmLoHitRate: 0,
                    avgCfHitRate: 0,
                    avgEnsembleHitRate: 0
                };
            }

            return stats[0];
        } catch (error) {
            console.error('❌ Error getting accuracy stats:', error);
            throw error;
        }
    }

    /**
     * Lấy top predictions theo phương pháp
     * @param {Date} date - Ngày dự đoán
     * @param {string} method - Phương pháp (cdm, efdm, cf, ensemble)
     * @param {string} type - Loại (de, lo)
     * @param {number} limit - Số lượng top
     * @returns {Array} Top predictions
     */
    async getTopPredictions(date, method, type = 'de', limit = 20) {
        try {
            const soiCau = await this.getSoiCauByDate(date);

            // Advanced Soi Cầu - return ensemble (vì nó tích hợp 7 methods rồi)
            if (method === 'advanced') {
                // Convert ensemble predictions to advanced format
                const advancedPredictions = soiCau.predictions.ensemble.slice(0, limit).map(p => ({
                    number: p.number,
                    probability: p.probability,
                    percentage: p.percentage || (p.probability * 100).toFixed(2)
                }));
                return advancedPredictions;
            }

            if (method === 'ensemble') {
                return soiCau.predictions.ensemble.slice(0, limit);
            }

            if (method === 'cf') {
                return soiCau.predictions.collaborativeFiltering.slice(0, limit);
            }

            if (soiCau.predictions[method] && soiCau.predictions[method][type]) {
                return soiCau.predictions[method][type].slice(0, limit);
            }

            throw new Error(`Không tìm thấy predictions cho method: ${method}, type: ${type}`);
        } catch (error) {
            console.error('❌ Error getting top predictions:', error);
            throw error;
        }
    }

    /**
     * Lấy dashboard data
     * @returns {Object} Dashboard data
     */
    async getDashboardData() {
        try {
            const today = new Date();
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);

            // Lấy soi cầu hôm nay
            let todaySoiCau = null;
            try {
                todaySoiCau = await this.getSoiCauByDate(today);
            } catch (error) {
                console.log('Chưa có soi cầu hôm nay');
            }

            // Lấy soi cầu hôm qua
            let yesterdaySoiCau = null;
            try {
                yesterdaySoiCau = await this.getSoiCauByDate(yesterday);
            } catch (error) {
                console.log('Chưa có soi cầu hôm qua');
            }

            // Lấy thống kê độ chính xác
            const accuracyStats = await this.getAccuracyStats(30);

            // Lấy lịch sử gần nhất
            const history = await this.getSoiCauHistory(10, 10);

            return {
                today: todaySoiCau,
                yesterday: yesterdaySoiCau,
                accuracyStats,
                history,
                lastUpdated: todaySoiCau?.updatedAt || yesterdaySoiCau?.updatedAt
            };
        } catch (error) {
            console.error('❌ Error getting dashboard data:', error);
            throw error;
        }
    }

    /**
     * Xóa soi cầu cũ (cleanup)
     * @param {number} days - Số ngày giữ lại
     * @returns {number} Số bản ghi đã xóa
     */
    async cleanupOldSoiCau(days = 90) {
        try {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - days);

            const result = await SoiCau.deleteMany({
                predictionDate: { $lt: cutoffDate }
            });

            console.log(`🗑️ Cleaned up ${result.deletedCount} old soi cầu records`);
            return result.deletedCount;
        } catch (error) {
            console.error('❌ Error cleaning up old soi cầu:', error);
            throw error;
        }
    }
}

module.exports = SoiCauService;
