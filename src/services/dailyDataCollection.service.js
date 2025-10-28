const XSMB = require('../models/xsmb.model');
const DailySoiCauData = require('../models/dailySoiCauData.model');
const BayesianCDMService = require('./bayesianCDM.service');
const EFDMService = require('./efdm.service');
const CollaborativeFilteringService = require('./collaborativeFiltering.service');
const ProbabilityStatisticsService = require('./probabilityStatistics.service');
const AdvancedGapAnalysisService = require('./advancedGapAnalysis.service');
const UltraAdvancedSoiCauService = require('./ultraAdvancedSoiCau.service');

class DailyDataCollectionService {
    constructor() {
        this.bayesianService = new BayesianCDMService();
        this.efdmService = new EFDMService();
        this.collaborativeFilteringService = new CollaborativeFilteringService();
        this.probabilityStatsService = new ProbabilityStatisticsService();
        this.advancedGapAnalysisService = AdvancedGapAnalysisService;
        this.ultraAdvancedSoiCauService = UltraAdvancedSoiCauService;
        console.log('✅ DailyDataCollectionService initialized');
    }

    /**
     * Thu thập và lưu dữ liệu soi cầu cho ngày tiếp theo
     * @param {Date} targetDate - Ngày cần tạo dữ liệu soi cầu
     * @param {number} historicalDays - Số ngày dữ liệu lịch sử
     * @returns {Object} Kết quả thu thập dữ liệu
     */
    async collectAndSaveDailyData(targetDate, historicalDays = 30) {
        try {
            console.log(`🔄 Bắt đầu thu thập dữ liệu cho ngày ${targetDate.toISOString().split('T')[0]}`);

            // Kiểm tra xem đã có dữ liệu cho ngày này chưa
            const existingData = await DailySoiCauData.getByPredictionDate(targetDate);
            if (existingData && existingData.metadata.status === 'completed') {
                console.log(`📋 Dữ liệu cho ngày ${targetDate.toISOString().split('T')[0]} đã tồn tại`);
                return {
                    success: true,
                    message: 'Dữ liệu đã tồn tại',
                    data: existingData
                };
            }

            // Tạo hoặc cập nhật record
            let dailyData = existingData || new DailySoiCauData({
                predictionDate: targetDate,
                metadata: {
                    status: 'pending',
                    createdAt: new Date()
                }
            });

            // Thu thập dữ liệu lịch sử
            const historicalData = await this.collectHistoricalData(targetDate, historicalDays);
            dailyData.historicalData = historicalData;
            dailyData.historicalData.extendedFeatures = historicalData.extendedFeatures;

            // Tính toán predictions
            const predictions = await this.calculatePredictions(targetDate, historicalData.rawData);
            dailyData.predictions = predictions;

            // Tính toán thống kê xác suất
            const probabilityStats = await this.calculateProbabilityStatistics(targetDate, historicalData.rawData);
            dailyData.probabilityStatistics = probabilityStats;

            // Cập nhật trạng thái
            dailyData.metadata.status = 'completed';
            dailyData.metadata.updatedAt = new Date();

            // Lưu vào database
            await dailyData.save();

            console.log(`✅ Đã lưu dữ liệu soi cầu cho ngày ${targetDate.toISOString().split('T')[0]}`);

            return {
                success: true,
                message: 'Thu thập và lưu dữ liệu thành công',
                data: dailyData
            };

        } catch (error) {
            console.error(`❌ Lỗi thu thập dữ liệu cho ngày ${targetDate.toISOString().split('T')[0]}:`, error.message);

            // Cập nhật trạng thái lỗi nếu có record
            if (dailyData) {
                dailyData.metadata.status = 'failed';
                dailyData.metadata.error = error.message;
                await dailyData.save();
            }

            throw error;
        }
    }

    /**
     * Thu thập dữ liệu lịch sử cho ngày dự đoán
     * @param {Date} targetDate - Ngày dự đoán
     * @param {number} days - Số ngày dữ liệu lịch sử
     * @returns {Object} Dữ liệu lịch sử
     */
    async collectHistoricalData(targetDate, days) {
        console.log(`📊 Thu thập dữ liệu lịch sử ${days} ngày cho ngày ${targetDate.toISOString().split('T')[0]}`);

        // Tính toán ngày bắt đầu và kết thúc
        const endDate = new Date(targetDate);
        endDate.setDate(endDate.getDate() - 1); // Loại trừ ngày dự đoán
        endDate.setHours(23, 59, 59, 999);

        const startDate = new Date(endDate);
        startDate.setDate(startDate.getDate() - days + 1);
        startDate.setHours(0, 0, 0, 0);

        console.log(`📅 Khoảng thời gian: ${startDate.toISOString().split('T')[0]} đến ${endDate.toISOString().split('T')[0]}`);

        // Lấy dữ liệu từ database
        const rawData = await XSMB.find({
            drawDate: { $gte: startDate, $lte: endDate },
            station: 'xsmb'
        })
            .select('drawDate specialPrize firstPrize secondPrize threePrizes fourPrizes fivePrizes sixPrizes sevenPrizes')
            .sort({ drawDate: -1 })
            .lean();

        console.log(`📈 Tìm thấy ${rawData.length} bản ghi dữ liệu lịch sử`);

        // Kiểm tra xem có đủ dữ liệu không
        if (rawData.length === 0) {
            throw new Error(`Không tìm thấy dữ liệu lịch sử cho khoảng thời gian từ ${startDate.toISOString().split('T')[0]} đến ${endDate.toISOString().split('T')[0]}`);
        }

        if (rawData.length < 10) {
            console.log(`⚠️ Cảnh báo: Chỉ có ${rawData.length} bản ghi dữ liệu lịch sử, có thể ảnh hưởng đến độ chính xác dự đoán`);
        }

        const extendedFeatures = this.computeExtendedFeatures(rawData);

        return {
            days: days,
            startDate: startDate,
            endDate: endDate,
            recordCount: rawData.length,
            rawData: rawData,
            extendedFeatures: extendedFeatures
        };
    }

    /**
     * Tính toán predictions cho tất cả các phương pháp
     * @param {Date} targetDate - Ngày dự đoán
     * @param {Array} historicalData - Dữ liệu lịch sử
     * @returns {Object} Predictions từ tất cả các phương pháp
     */
    async calculatePredictions(targetDate, historicalData) {
        console.log(`🔄 Tính toán predictions cho ngày ${targetDate.toISOString().split('T')[0]}`);

        const days = historicalData.length;

        // Tính toán CDM predictions
        const cdmDe = await this.bayesianService.calculateDeProbabilities(targetDate, days);
        const cdmLo = await this.bayesianService.calculateLoProbabilities(targetDate, days);

        // Tính toán EFDM predictions
        const efdmDe = await this.efdmService.calculateDeProbabilities(targetDate, days);
        const efdmLo = await this.efdmService.calculateLoProbabilities(targetDate, days);

        // Tính toán Collaborative Filtering predictions
        const cfDe = await this.collaborativeFilteringService.predict(targetDate, days, 'de', 5);
        const cfLo = await this.collaborativeFilteringService.predict(targetDate, days, 'lo', 5);

        // Tính toán Ensemble predictions
        const ensembleDe = this.calculateEnsemblePredictions([cdmDe, efdmDe, cfDe]);
        const ensembleLo = this.calculateEnsemblePredictions([cdmLo, efdmLo, cfLo]);

        return {
            cdm: {
                de: this.formatPredictions(cdmDe),
                lo: this.formatPredictions(cdmLo)
            },
            efdm: {
                de: this.formatPredictions(efdmDe),
                lo: this.formatPredictions(efdmLo)
            },
            collaborativeFiltering: {
                de: this.formatPredictions(cfDe),
                lo: this.formatPredictions(cfLo)
            },
            ensemble: {
                de: this.formatPredictions(ensembleDe),
                lo: this.formatPredictions(ensembleLo)
            }
        };
    }

    /**
     * Tính toán thống kê xác suất
     * @param {Date} targetDate - Ngày dự đoán
     * @param {Array} historicalData - Dữ liệu lịch sử
     * @returns {Object} Thống kê xác suất
     */
    async calculateProbabilityStatistics(targetDate, historicalData) {
        console.log(`📊 Tính toán thống kê xác suất cho ngày ${targetDate.toISOString().split('T')[0]}`);

        // Tạm thời trả về object rỗng vì ProbabilityStatisticsService chưa được implement đầy đủ
        return {
            numberStatistics: {},
            positionStatistics: {},
            dailyStatistics: {},
            monthlyStatistics: {}
        };
    }

    /**
     * Tính toán Ensemble predictions
     * @param {Array} predictions - Mảng các predictions từ các phương pháp khác nhau
     * @returns {Object} Ensemble predictions
     */
    calculateEnsemblePredictions(predictions) {
        const ensemble = {};

        // Lấy tất cả các số từ tất cả predictions
        const allNumbers = new Set();
        predictions.forEach(pred => {
            Object.keys(pred).forEach(num => allNumbers.add(num));
        });

        // Tính trung bình weighted cho mỗi số
        allNumbers.forEach(num => {
            let totalWeight = 0;
            let totalProbability = 0;

            predictions.forEach((pred, index) => {
                if (pred[num]) {
                    const weight = 1 / (index + 1); // Weight giảm dần
                    totalWeight += weight;
                    totalProbability += pred[num] * weight;
                }
            });

            if (totalWeight > 0) {
                ensemble[num] = totalProbability / totalWeight;
            }
        });

        return ensemble;
    }

    /**
     * Format predictions thành array
     * @param {Object} predictions - Predictions object
     * @returns {Array} Formatted predictions
     */
    formatPredictions(predictions) {
        return Object.entries(predictions)
            .map(([number, probability]) => {
                // Đảm bảo probability là số
                const probValue = typeof probability === 'number' ? probability : 0;
                return {
                    number: number,
                    probability: probValue,
                    percentage: (probValue * 100).toFixed(2)
                };
            })
            .sort((a, b) => b.probability - a.probability);
    }

    /**
     * Lấy dữ liệu soi cầu cho ngày cụ thể
     * @param {Date} date - Ngày cần lấy dữ liệu
     * @returns {Object} Dữ liệu soi cầu
     */
    async getDailyData(date) {
        const dailyData = await DailySoiCauData.getByPredictionDate(date);

        if (!dailyData) {
            throw new Error(`Không tìm thấy dữ liệu soi cầu cho ngày ${date.toISOString().split('T')[0]}`);
        }

        if (dailyData.metadata.status !== 'completed') {
            throw new Error(`Dữ liệu soi cầu cho ngày ${date.toISOString().split('T')[0]} chưa hoàn thành`);
        }

        return dailyData;
    }

    /**
     * Lấy top predictions cho ngày cụ thể
     * @param {Date} date - Ngày cần lấy predictions
     * @param {string} method - Phương pháp (cdm, efdm, collaborativeFiltering, ensemble)
     * @param {string} type - Loại (de, lo)
     * @param {number} limit - Số lượng kết quả
     * @returns {Array} Top predictions
     */
    async getTopPredictions(date, method = 'ensemble', type = 'de', limit = 5) {
        const dailyData = await this.getDailyData(date);

        if (!dailyData.predictions[method] || !dailyData.predictions[method][type]) {
            throw new Error(`Không tìm thấy predictions cho method ${method} và type ${type}`);
        }

        return dailyData.predictions[method][type].slice(0, limit);
    }

    /**
     * Tạo và lưu predictions mới cho ngày cụ thể
     * @param {Date} targetDate - Ngày cần tạo predictions
     * @param {string} method - Phương pháp dự đoán
     * @param {string} type - Loại dự đoán (de/lo)
     * @param {number} limit - Số lượng predictions
     * @returns {Object} Kết quả predictions
     */
    async generateAndSavePredictions(targetDate, method, type, limit) {
        try {
            console.log(`🎯 Generating predictions for ${targetDate.toISOString().split('T')[0]} with ${method}-${type}`);

            // Lấy dữ liệu hiện có
            const existingData = await DailySoiCauData.getByPredictionDate(targetDate);
            if (!existingData) {
                throw new Error(`Không tìm thấy dữ liệu cho ngày ${targetDate.toISOString().split('T')[0]}. Vui lòng tạo bộ dữ liệu trước.`);
            }

            // Tạo predictions mới
            let predictions;
            switch (method) {
                case 'cdm':
                    if (type === 'de') {
                        const deProbs = await this.bayesianService.calculateDeProbabilities(targetDate, 30);
                        predictions = this.convertProbabilitiesToPredictions(deProbs, limit);
                    } else {
                        const loProbs = await this.bayesianService.calculateLoProbabilities(targetDate, 30);
                        predictions = this.convertProbabilitiesToPredictions(loProbs, limit);
                    }
                    break;
                case 'efdm':
                    if (type === 'de') {
                        const deProbs = await this.efdmService.calculateDeProbabilities(targetDate, 30);
                        predictions = this.convertProbabilitiesToPredictions(deProbs, limit);
                    } else {
                        const loProbs = await this.efdmService.calculateLoProbabilities(targetDate, 30);
                        predictions = this.convertProbabilitiesToPredictions(loProbs, limit);
                    }
                    break;
                case 'cf':
                    // Sử dụng Collaborative Filtering thực sự
                    const cfProbs = await this.collaborativeFilteringService.predict(targetDate, 30, type, 5);
                    predictions = this.convertProbabilitiesToPredictions(cfProbs, limit);
                    break;
                case 'ensemble':
                default:
                    // Sử dụng Ultra Advanced Soi Cầu cho ensemble
                    console.log('🧠 Using Ultra Advanced AI Soi Cầu for ensemble predictions');
                    const ultraResult = await this.ultraAdvancedSoiCauService.predict(targetDate, type, 200);
                    // Chuyển đổi format để phù hợp với SoiCau model
                    predictions = ultraResult.predictions.slice(0, limit).map(pred => ({
                        number: pred.number,
                        probability: pred.calibratedScore || pred.finalScore || pred.score, // Sử dụng score cao nhất
                        percentage: pred.percentage
                    }));
                    break;
            }

            // Cập nhật predictions trong DailySoiCauData
            await DailySoiCauData.updatePredictions(targetDate, method, type, predictions);

            // Tạo record mới trong SoiCau model
            const SoiCau = require('../models/soicau.model');

            // Tạo predictions object theo cấu trúc SoiCau model
            const predictionsObj = {};
            if (method === 'ensemble') {
                // Đảm bảo predictions có đúng format cho SoiCau model
                predictionsObj.ensemble = predictions.map(pred => ({
                    number: pred.number,
                    probability: pred.probability,
                    percentage: pred.percentage
                }));
            } else if (method === 'cdm') {
                predictionsObj.cdm = { [type]: predictions };
            } else if (method === 'efdm') {
                predictionsObj.efdm = { [type]: predictions };
            } else if (method === 'cf') {
                predictionsObj.collaborativeFiltering = predictions;
            }

            const soiCauData = {
                predictionDate: targetDate,
                drawDate: targetDate,
                predictions: predictionsObj,
                metadata: {
                    dataDays: 30,
                    topK: limit,
                    algorithm: method,
                    processingTime: Date.now(),
                    cacheHit: false
                }
            };

            // Kiểm tra xem đã có dữ liệu cho ngày này chưa
            const existingSoiCau = await SoiCau.findOne({
                predictionDate: targetDate,
                'predictions.ensemble': { $exists: true }
            });

            if (existingSoiCau) {
                console.log(`⚠️ Đã có dữ liệu soi cầu cho ngày ${targetDate.toISOString().split('T')[0]}`);
                console.log(`📋 Sử dụng dữ liệu hiện có với ID: ${existingSoiCau._id}`);
                console.log(`🔄 Method: ${method}, Type: ${type}`);

                // Trả về dữ liệu hiện có thay vì tạo mới
                const existingPredictions = existingSoiCau.predictions.ensemble || [];
                return {
                    method,
                    type,
                    date: targetDate.toISOString().split('T')[0],
                    limit,
                    predictions: existingPredictions,
                    soiCauId: existingSoiCau._id,
                    cached: true,
                    message: `Dữ liệu đã tồn tại cho ngày ${targetDate.toISOString().split('T')[0]}`
                };
            }

            // Lưu vào SoiCau model (chỉ khi chưa có)
            const newSoiCau = new SoiCau(soiCauData);
            await newSoiCau.save();

            console.log(`✅ Generated ${predictions.length} predictions for ${method}-${type}`);
            console.log(`✅ Saved to SoiCau model with ID: ${newSoiCau._id}`);

            return {
                method,
                type,
                date: targetDate.toISOString().split('T')[0],
                limit,
                predictions,
                soiCauId: newSoiCau._id,
                cached: false
            };

        } catch (error) {
            console.error('❌ Error generating predictions:', error.message);
            throw error;
        }
    }

    /**
     * Kết hợp predictions từ nhiều phương pháp
     * @param {Array} predictionArrays - Mảng các predictions
     * @param {number} limit - Số lượng tối đa
     * @returns {Array} Predictions đã kết hợp
     */
    combinePredictions(predictionArrays, limit) {
        const combined = {};

        // Tính điểm trung bình cho mỗi số
        predictionArrays.forEach(predictions => {
            predictions.forEach(pred => {
                const number = pred.number;
                if (!combined[number]) {
                    combined[number] = { number, probability: 0, count: 0 };
                }
                combined[number].probability += pred.probability;
                combined[number].count += 1;
            });
        });

        // Tính điểm trung bình và sắp xếp
        const result = Object.values(combined)
            .map(pred => ({
                number: pred.number,
                probability: pred.probability / pred.count,
                percentage: ((pred.probability / pred.count) * 100).toFixed(2) + '%'
            }))
            .sort((a, b) => b.probability - a.probability)
            .slice(0, limit);

        return result;
    }

    /**
     * Chuyển đổi probabilities thành predictions format
     * @param {Object} probabilities - Xác suất cho từng số
     * @param {number} limit - Số lượng tối đa
     * @returns {Array} Predictions array
     */
    convertProbabilitiesToPredictions(probabilities, limit) {
        return Object.entries(probabilities)
            .map(([number, probability]) => ({
                number,
                probability,
                percentage: (probability * 100).toFixed(2) + '%'
            }))
            .sort((a, b) => b.probability - a.probability)
            .slice(0, limit);
    }

    /**
     * Kết hợp probabilities từ nhiều phương pháp
     * @param {Array} probabilityArrays - Mảng các probabilities
     * @returns {Object} Probabilities đã kết hợp
     */
    combineProbabilities(probabilityArrays) {
        const combined = {};

        // Tính điểm trung bình cho mỗi số
        probabilityArrays.forEach(probs => {
            Object.entries(probs).forEach(([number, probability]) => {
                if (!combined[number]) {
                    combined[number] = { probability: 0, count: 0 };
                }
                combined[number].probability += probability;
                combined[number].count += 1;
            });
        });

        // Tính điểm trung bình
        const result = {};
        Object.entries(combined).forEach(([number, data]) => {
            result[number] = data.probability / data.count;
        });

        return result;
    }

    computeExtendedFeatures(data) {
        const positionStats = {}; // {num: {ten: count, unit: count}}
        const frequencies = {}; // {num: count in last 7 days}
        const avgFreq = data.length > 0 ? (data.reduce((sum, d) => sum + d.allPrizes?.length || 0, 0) / data.length) / 100 : 0;

        data.forEach((result, index) => {
            const allNums = this.extractAllNumbers(result); // Helper để lấy all 2-digit nums
            allNums.forEach(num => {
                frequencies[num] = (frequencies[num] || 0) + (index < 7 ? 1 : 0); // Chỉ last 7
                positionStats[num] = {
                    ten: (positionStats[num]?.ten || 0) + (num[0] === 'specific' ? 1 : 0), // Logic vị trí
                    unit: (positionStats[num]?.unit || 0) + 1
                };
            });
        });

        const hotCold = {};
        Object.keys(frequencies).forEach(num => {
            hotCold[num] = frequencies[num] > avgFreq ? 'hot' : (frequencies[num] < avgFreq - 1 ? 'cold' : 'normal');
        });

        return { positionStats, hotCold };
    }

    extractAllNumbers(result) {
        const allNumbers = new Set();
        if (result.specialPrize) allNumbers.add(result.specialPrize);
        if (result.firstPrize) allNumbers.add(result.firstPrize);
        if (result.secondPrize) allNumbers.add(result.secondPrize);
        if (result.threePrizes) allNumbers.add(result.threePrizes);
        if (result.fourPrizes) allNumbers.add(result.fourPrizes);
        if (result.fivePrizes) allNumbers.add(result.fivePrizes);
        if (result.sixPrizes) allNumbers.add(result.sixPrizes);
        if (result.sevenPrizes) allNumbers.add(result.sevenPrizes);
        return Array.from(allNumbers);
    }
}

module.exports = DailyDataCollectionService;
