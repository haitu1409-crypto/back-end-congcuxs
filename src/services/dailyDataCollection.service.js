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

        // TỐI ƯU: Thêm cache cho service
        const NodeCache = require('node-cache');
        this.cache = new NodeCache({
            stdTTL: 300, // 5 phút cache
            checkperiod: 60, // Check expired keys mỗi 1 phút
            useClones: false // Tối ưu memory
        });

        console.log('✅ DailyDataCollectionService initialized with cache');
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

            // Lưu vào database - handle duplicate key error (race condition)
            try {
                await dailyData.save();
                console.log(`✅ Đã lưu dữ liệu soi cầu cho ngày ${targetDate.toISOString().split('T')[0]}`);
            } catch (saveError) {
                // Nếu lỗi duplicate key (code 11000 hoặc 11001), có nghĩa là record đã được tạo bởi request khác
                if (saveError.code === 11000 || saveError.code === 11001) {
                    console.log(`⚠️ Duplicate key error - record đã tồn tại, lấy lại dữ liệu...`);
                    // Lấy lại dữ liệu đã được tạo bởi request khác
                    const existingData = await DailySoiCauData.getByPredictionDate(targetDate);
                    if (existingData && existingData.metadata.status === 'completed') {
                        console.log(`✅ Dữ liệu đã được tạo bởi request khác, trả về dữ liệu hiện có`);
                        return {
                            success: true,
                            message: 'Dữ liệu đã tồn tại (được tạo bởi request khác)',
                            data: existingData
                        };
                    } else if (existingData && existingData.metadata.status === 'pending') {
                        // Nếu đang pending, đợi một chút và thử lại
                        console.log(`⏳ Dữ liệu đang được xử lý bởi request khác, đợi...`);
                        await new Promise(resolve => setTimeout(resolve, 1000));
                        const retryData = await DailySoiCauData.getByPredictionDate(targetDate);
                        if (retryData && retryData.metadata.status === 'completed') {
                            return {
                                success: true,
                                message: 'Dữ liệu đã được hoàn thành bởi request khác',
                                data: retryData
                            };
                        }
                    }
                }
                // Nếu không phải duplicate key error, throw lại
                throw saveError;
            }

            return {
                success: true,
                message: 'Thu thập và lưu dữ liệu thành công',
                data: dailyData
            };

        } catch (error) {
            console.error(`❌ Lỗi thu thập dữ liệu cho ngày ${targetDate.toISOString().split('T')[0]}:`, error.message);

            // Cập nhật trạng thái lỗi nếu có record (và không phải duplicate key)
            if (dailyData && error.code !== 11000 && error.code !== 11001) {
                try {
                    dailyData.metadata.status = 'failed';
                    dailyData.metadata.error = error.message;
                    await dailyData.save();
                } catch (updateError) {
                    // Ignore update error nếu record đã bị xóa hoặc không tồn tại
                    console.warn('⚠️ Could not update error status:', updateError.message);
                }
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
        const cacheKey = `daily:${date.toISOString().split('T')[0]}`;

        // TỐI ƯU: Kiểm tra cache trước
        const cached = this.cache.get(cacheKey);
        if (cached) {
            console.log(`📦 Cache hit for daily data: ${cacheKey}`);
            return cached;
        }

        const dailyData = await DailySoiCauData.getByPredictionDate(date);

        if (!dailyData) {
            throw new Error(`Không tìm thấy dữ liệu soi cầu cho ngày ${date.toISOString().split('T')[0]}`);
        }

        if (dailyData.metadata.status !== 'completed') {
            throw new Error(`Dữ liệu soi cầu cho ngày ${date.toISOString().split('T')[0]} chưa hoàn thành`);
        }

        // TỐI ƯU: Cache kết quả
        this.cache.set(cacheKey, dailyData);
        console.log(`📦 Cached daily data: ${cacheKey}`);

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
                        predictions = this.convertProbabilitiesToPredictions(deProbs, limit, type);
                    } else {
                        const loProbs = await this.bayesianService.calculateLoProbabilities(targetDate, 30);
                        predictions = this.convertProbabilitiesToPredictions(loProbs, limit, type);
                    }
                    break;
                case 'efdm':
                    if (type === 'de') {
                        const deProbs = await this.efdmService.calculateDeProbabilities(targetDate, 30);
                        predictions = this.convertProbabilitiesToPredictions(deProbs, limit, type);
                    } else {
                        const loProbs = await this.efdmService.calculateLoProbabilities(targetDate, 30);
                        predictions = this.convertProbabilitiesToPredictions(loProbs, limit, type);
                    }
                    break;
                case 'cf':
                    // Sử dụng Collaborative Filtering thực sự
                    const cfProbs = await this.collaborativeFilteringService.predict(targetDate, 30, type, 5);
                    predictions = this.convertProbabilitiesToPredictions(cfProbs, limit, type);
                    break;
                case 'ensemble':
                default:
                    // Sử dụng Ultra Advanced Soi Cầu cho ensemble
                    console.log('🧠 Using Ultra Advanced AI Soi Cầu for ensemble predictions');
                    // Tăng limit input cho Ultra Advanced service (lo cần nhiều hơn)
                    const ultraLimit = type === 'lo' ? 500 : 200;
                    const ultraResult = await this.ultraAdvancedSoiCauService.predict(targetDate, type, ultraLimit);
                    // Chuyển đổi format để phù hợp với SoiCau model
                    // Slice về limit cuối cùng (đã được tăng cho lo)
                    predictions = ultraResult.predictions.slice(0, limit).map(pred => ({
                        number: pred.number,
                        probability: pred.calibratedScore || pred.finalScore || pred.score, // Sử dụng score cao nhất
                        percentage: pred.percentage
                    }));
                    console.log(`✅ Generated ${predictions.length} ${type} predictions (from ${ultraResult.predictions.length} candidates)`);
                    break;
            }

            // Tạo predictions object theo cấu trúc SoiCau model
            const predictionsObj = {};

            // Luôn tạo ensemble predictions - phải là object với de và lo để khớp với frontend
            let ensembleObj = {};
            if (type === 'de') {
                ensembleObj = {
                    de: predictions.map(pred => ({
                        number: pred.number,
                        probability: pred.probability,
                        percentage: pred.percentage
                    })),
                    lo: []
                };
            } else {
                ensembleObj = {
                    de: [],
                    lo: predictions.map(pred => ({
                        number: pred.number,
                        probability: pred.probability,
                        percentage: pred.percentage
                    }))
                };
            }
            predictionsObj.ensemble = ensembleObj;

            // Cập nhật predictions trong DailySoiCauData
            // Quan trọng: Cập nhật cả method riêng lẻ VÀ ensemble để đảm bảo đồng bộ
            await DailySoiCauData.updatePredictions(targetDate, method, type, predictions);
            
            // Cập nhật ensemble trong DailySoiCauData (merge để không ghi đè lo khi update de và ngược lại)
            const existingDailyData = await DailySoiCauData.getByPredictionDate(targetDate);
            if (existingDailyData) {
                const existingEnsemble = existingDailyData.predictions?.ensemble || { de: [], lo: [] };
                const mergedEnsemble = {
                    de: type === 'de' ? ensembleObj.de : (existingEnsemble.de || []),
                    lo: type === 'lo' ? ensembleObj.lo : (existingEnsemble.lo || [])
                };
                existingDailyData.predictions.ensemble = mergedEnsemble;
                existingDailyData.metadata.lastUpdated = new Date();
                await existingDailyData.save();
                console.log(`✅ Updated ensemble predictions in DailySoiCauData for ${targetDate.toISOString().split('T')[0]}`);
            }

            // Tạo record mới trong SoiCau model
            const SoiCau = require('../models/soicau.model');

            // Tạo predictions cho method riêng lẻ nếu không phải ensemble
            if (method === 'cdm') {
                predictionsObj.cdm = { [type]: predictions };
            } else if (method === 'efdm') {
                predictionsObj.efdm = { [type]: predictions };
            } else if (method === 'cf') {
                predictionsObj.collaborativeFiltering = predictions;
            } else if (method === 'ensemble') {
                // Khi dùng ensemble, cũng tạo predictions cho các method riêng lẻ
                try {
                    // Tạo CDM predictions
                    if (type === 'de') {
                        const cdmDeProbs = await this.bayesianService.calculateDeProbabilities(targetDate, 30);
                        predictionsObj.cdm = {
                            de: this.convertProbabilitiesToPredictions(cdmDeProbs, limit, 'de'),
                            lo: []
                        };
                    } else {
                        const cdmLoProbs = await this.bayesianService.calculateLoProbabilities(targetDate, 30);
                        predictionsObj.cdm = {
                            de: [],
                            lo: this.convertProbabilitiesToPredictions(cdmLoProbs, limit, 'lo')
                        };
                    }

                    // Tạo EFDM predictions
                    if (type === 'de') {
                        const efdmDeProbs = await this.efdmService.calculateDeProbabilities(targetDate, 30);
                        predictionsObj.efdm = {
                            de: this.convertProbabilitiesToPredictions(efdmDeProbs, limit, 'de'),
                            lo: []
                        };
                    } else {
                        const efdmLoProbs = await this.efdmService.calculateLoProbabilities(targetDate, 30);
                        predictionsObj.efdm = {
                            de: [],
                            lo: this.convertProbabilitiesToPredictions(efdmLoProbs, limit, 'lo')
                        };
                    }

                    // Tạo Collaborative Filtering predictions
                    const cfProbs = await this.collaborativeFilteringService.predict(targetDate, 30, type, 5);
                    predictionsObj.collaborativeFiltering = this.convertProbabilitiesToPredictions(cfProbs, limit, type);

                } catch (error) {
                    console.warn('⚠️ Could not generate individual method predictions:', error.message);
                    // Nếu không tạo được, để trống
                    if (!predictionsObj.cdm) predictionsObj.cdm = { de: [], lo: [] };
                    if (!predictionsObj.efdm) predictionsObj.efdm = { de: [], lo: [] };
                    if (!predictionsObj.collaborativeFiltering) predictionsObj.collaborativeFiltering = [];
                }
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

            // Sử dụng findOneAndUpdate với upsert để đảm bảo atomic và tránh race condition
            // Upsert sẽ tạo mới nếu không có, cập nhật nếu đã có (tránh duplicate)
            try {
                // Lấy dữ liệu hiện có để merge ensemble (nếu đang update)
                const existingSoiCau = await SoiCau.findOne({ predictionDate: targetDate }).lean();
                
                // Merge ensemble predictions: không ghi đè lo khi update de và ngược lại
                let mergedEnsemble = predictionsObj.ensemble;
                if (existingSoiCau && existingSoiCau.predictions && existingSoiCau.predictions.ensemble) {
                    const existingEnsemble = existingSoiCau.predictions.ensemble;
                    if (Array.isArray(existingEnsemble)) {
                        // Cấu trúc cũ: array -> convert sang object
                        mergedEnsemble = {
                            de: type === 'de' ? predictionsObj.ensemble.de : [],
                            lo: type === 'lo' ? predictionsObj.ensemble.lo : []
                        };
                    } else if (typeof existingEnsemble === 'object') {
                        // Cấu trúc mới: object -> merge
                        mergedEnsemble = {
                            de: type === 'de' ? predictionsObj.ensemble.de : (existingEnsemble.de || []),
                            lo: type === 'lo' ? predictionsObj.ensemble.lo : (existingEnsemble.lo || [])
                        };
                    }
                }

                // Tạo update object - tránh conflict giữa $setOnInsert và $set
                const updateObj = {
                    $setOnInsert: { // Chỉ set khi insert (tạo mới)
                        predictionDate: targetDate,
                        drawDate: targetDate,
                        metadata: {
                            dataDays: 30,
                            topK: limit,
                            algorithm: method,
                            processingTime: Date.now(),
                            cacheHit: false
                        },
                        createdAt: new Date()
                    },
                    $set: { // Luôn update những field này
                        updatedAt: new Date()
                    }
                };

                // Nếu là insert mới, set toàn bộ predictions
                if (!existingSoiCau) {
                    updateObj.$setOnInsert.predictions = {
                        ...predictionsObj,
                        ensemble: mergedEnsemble
                    };
                } else {
                    // Nếu đã tồn tại, chỉ update các sub-path (tránh conflict)
                    updateObj.$set['predictions.ensemble'] = mergedEnsemble;
                    // Update method riêng lẻ nếu cần
                    if (predictionsObj.cdm) {
                        updateObj.$set['predictions.cdm'] = predictionsObj.cdm;
                    }
                    if (predictionsObj.efdm) {
                        updateObj.$set['predictions.efdm'] = predictionsObj.efdm;
                    }
                    if (predictionsObj.collaborativeFiltering) {
                        updateObj.$set['predictions.collaborativeFiltering'] = predictionsObj.collaborativeFiltering;
                    }
                }

                const result = await SoiCau.findOneAndUpdate(
                    { predictionDate: targetDate }, // Tìm theo predictionDate (unique)
                    updateObj,
                    {
                        upsert: true, // Tạo mới nếu không tìm thấy
                        new: true, // Trả về document sau khi update
                        runValidators: true // Chạy validation
                    }
                );

                // Lấy predictions theo type
                const ensemble = result.predictions.ensemble || { de: [], lo: [] };
                const resultPredictions = Array.isArray(ensemble) ? ensemble : (ensemble[type] || []);

                if (result.wasNew) {
                    console.log(`✅ Created new SoiCau record for ${targetDate.toISOString().split('T')[0]} with ID: ${result._id}`);
                } else {
                    console.log(`✅ Updated existing SoiCau record for ${targetDate.toISOString().split('T')[0]} with ID: ${result._id}`);
                }

                return {
                    method,
                    type,
                    date: targetDate.toISOString().split('T')[0],
                    limit,
                    predictions: resultPredictions,
                    soiCauId: result._id,
                    cached: !result.wasNew,
                    message: result.wasNew 
                        ? `Tạo mới dữ liệu soi cầu cho ngày ${targetDate.toISOString().split('T')[0]}`
                        : `Cập nhật dữ liệu soi cầu cho ngày ${targetDate.toISOString().split('T')[0]}`
                };
            } catch (saveError) {
                // Nếu lỗi duplicate key (race condition), thử lấy lại record đã tồn tại
                if (saveError.code === 11000 || saveError.code === 11001) {
                    console.log(`⚠️ Duplicate key error (race condition), fetching existing record...`);
                    const existingSoiCau = await SoiCau.findOne({ predictionDate: targetDate });
                    if (existingSoiCau) {
                        const ensemble = existingSoiCau.predictions.ensemble || { de: [], lo: [] };
                        const existingPredictions = Array.isArray(ensemble) ? ensemble : (ensemble[type] || []);
                        return {
                            method,
                            type,
                            date: targetDate.toISOString().split('T')[0],
                            limit,
                            predictions: existingPredictions,
                            soiCauId: existingSoiCau._id,
                            cached: true,
                            message: `Dữ liệu đã tồn tại cho ngày ${targetDate.toISOString().split('T')[0]} (resolved race condition)`
                        };
                    }
                }
                throw saveError;
            }

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
    convertProbabilitiesToPredictions(probabilities, limit, type = 'de') {
        // Lo thường có nhiều số có xác suất tương đương, nên lấy nhiều hơn
        const effectiveLimit = type === 'lo' ? Math.max(limit, 30) : limit;
        
        const predictions = Object.entries(probabilities)
            .map(([number, probability]) => ({
                number,
                probability,
                percentage: (probability * 100).toFixed(2) + '%'
            }))
            .sort((a, b) => b.probability - a.probability)
            .slice(0, effectiveLimit);
            
        console.log(`📊 Converted ${Object.keys(probabilities).length} probabilities to ${predictions.length} predictions (type: ${type})`);
        return predictions;
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
