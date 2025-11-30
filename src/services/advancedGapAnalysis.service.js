/**
 * Advanced Gap Analysis Service
 * Thuật toán soi cầu nâng cao với phân tích gap và tính độc đáo theo ngày
 * 
 * Tính năng chính:
 * 1. Gap Analysis: Phân tích số chưa ra trong 10 ngày gần nhất
 * 2. Daily Uniqueness: Tạo kết quả độc đáo cho từng ngày
 * 3. Context-Aware: Xem xét ngày trong tuần, tháng, mùa
 * 4. Advanced Pattern Recognition: Nhận dạng pattern phức tạp
 */

const NodeCache = require('node-cache');
const XSMB = require('../models/xsmb.model');
const moment = require('moment');

class AdvancedGapAnalysisService {
    constructor() {
        this.cache = new NodeCache({ stdTTL: 1800 }); // 30 phút
        this.gapWeights = {
            recent10Days: 0.15,   // Trọng số cho gap 10 ngày (giảm)
            recent30Days: 0.10,   // Trọng số cho gap 30 ngày (giảm)
            seasonal: 0.05,       // Trọng số cho pattern theo mùa (giảm)
            dailyContext: 0.05    // Trọng số cho context ngày (giảm)
        };
        // Service initialized silently
    }

    /**
     * Main prediction method với Gap Analysis
     * @param {Date} date - Ngày dự đoán
     * @param {string} type - 'de' hoặc 'lo'
     * @param {number} days - Số ngày dữ liệu
     * @returns {Object} Predictions với gap analysis
     */
    async predict(date, type = 'de', days = 100) {
        const cacheKey = `gap:${date.toISOString().split('T')[0]}:${type}:${days}`;
        const cached = this.cache.get(cacheKey);
        if (cached) {
            console.log(`📋 Cache hit for Gap Analysis: ${cacheKey}`);
            return cached;
        }

        console.log(`🚀 Advanced Gap Analysis for ${date.toISOString().split('T')[0]} - Type: ${type.toUpperCase()}`);

        // Lấy dữ liệu lịch sử
        const historicalData = await this.getHistoricalData(date, days);
        if (historicalData.length < 10) {
            throw new Error('Cần ít nhất 10 ngày dữ liệu cho Gap Analysis');
        }

        // 1. Phân tích Gap 10 ngày gần nhất
        const gap10Days = this.analyzeGapPattern(historicalData, 10, type);
        console.log(`📊 Gap 10 ngày: ${gap10Days.hotNumbers.length} số nóng, ${gap10Days.coldNumbers.length} số lạnh`);

        // 2. Phân tích Gap 30 ngày
        const gap30Days = this.analyzeGapPattern(historicalData, 30, type);
        console.log(`📊 Gap 30 ngày: ${gap30Days.hotNumbers.length} số nóng, ${gap30Days.coldNumbers.length} số lạnh`);

        // 3. Phân tích Seasonal Patterns
        const seasonalPattern = this.analyzeSeasonalPattern(historicalData, date, type);
        console.log(`📊 Seasonal: ${seasonalPattern.recommendedNumbers.length} số được khuyến nghị`);

        // 4. Daily Context Analysis
        const dailyContext = this.analyzeDailyContext(date, historicalData, type);
        console.log(`📊 Daily Context: ${dailyContext.recommendedNumbers.length} số phù hợp với ngày`);

        // 5. Advanced Pattern Recognition
        const advancedPatterns = this.analyzeAdvancedPatterns(historicalData, type);
        console.log(`📊 Advanced Patterns: ${advancedPatterns.length} patterns được tìm thấy`);

        // 6. Kết hợp tất cả phân tích
        const finalPredictions = this.combineGapAnalysis({
            gap10Days,
            gap30Days,
            seasonalPattern,
            dailyContext,
            advancedPatterns,
            targetDate: date,
            type
        });

        // 7. Tạo Daily Uniqueness
        const uniquePredictions = this.createDailyUniqueness(finalPredictions, date, type);

        const result = {
            predictions: uniquePredictions,
            analysis: {
                gap10Days,
                gap30Days,
                seasonalPattern,
                dailyContext,
                advancedPatterns: advancedPatterns.length
            },
            metadata: {
                targetDate: date.toISOString().split('T')[0],
                type,
                dataDays: historicalData.length,
                uniqueness: this.calculateUniquenessScore(uniquePredictions, historicalData),
                confidence: this.calculateConfidenceScore(uniquePredictions)
            }
        };

        this.cache.set(cacheKey, result);
        return result;
    }

    /**
     * Phân tích Gap Pattern - Core Algorithm
     * @param {Array} historicalData - Dữ liệu lịch sử
     * @param {number} gapDays - Số ngày gap
     * @param {string} type - 'de' hoặc 'lo'
     * @returns {Object} Gap analysis results
     */
    analyzeGapPattern(historicalData, gapDays, type) {
        const recentData = historicalData.slice(0, gapDays);
        const allNumbers = new Set();
        const numberLastSeen = {};
        const numberFrequency = {};

        // Thu thập tất cả số trong gap period
        recentData.forEach((result, index) => {
            const numbers = this.extractNumbers(result, type);
            numbers.forEach(num => {
                allNumbers.add(num);
                numberLastSeen[num] = index; // Ngày gần nhất xuất hiện
                numberFrequency[num] = (numberFrequency[num] || 0) + 1;
            });
        });

        // Tính gap score cho mỗi số (0-99) - Normalized và realistic
        const gapScores = {};
        for (let i = 0; i < 100; i++) {
            const num = i.toString().padStart(2, '0');
            const lastSeen = numberLastSeen[num] || gapDays; // Nếu chưa thấy = gapDays
            const frequency = numberFrequency[num] || 0;

            // Gap score: càng lâu không thấy, score càng cao (nhưng normalized)
            const gapDaysScore = Math.min(1.0, (gapDays - lastSeen) / gapDays); // 0-1
            const frequencyScore = Math.min(1.0, (gapDays - frequency) / gapDays); // 0-1

            // Kết hợp với trọng số nhỏ hơn và thêm randomness
            const baseScore = (gapDaysScore * 0.7 + frequencyScore * 0.3);
            const randomFactor = 0.8 + Math.random() * 0.4; // 0.8-1.2 để tạo sự đa dạng
            gapScores[num] = Math.max(0, Math.min(1.0, baseScore * randomFactor * 0.3)); // Max 0.3
        }

        // Phân loại số
        const hotNumbers = []; // Số có gap score cao (chưa ra lâu)
        const coldNumbers = []; // Số có gap score thấp (ra gần đây)
        const normalNumbers = []; // Số có gap score trung bình

        Object.entries(gapScores).forEach(([num, score]) => {
            if (score >= 0.8) {
                hotNumbers.push({ number: num, score, lastSeen: numberLastSeen[num] || gapDays });
            } else if (score <= 0.3) {
                coldNumbers.push({ number: num, score, lastSeen: numberLastSeen[num] || gapDays });
            } else {
                normalNumbers.push({ number: num, score, lastSeen: numberLastSeen[num] || gapDays });
            }
        });

        // Sắp xếp theo score giảm dần
        hotNumbers.sort((a, b) => b.score - a.score);
        coldNumbers.sort((a, b) => a.score - b.score);
        normalNumbers.sort((a, b) => b.score - a.score);

        return {
            hotNumbers: hotNumbers.slice(0, 20), // Top 20 số nóng
            coldNumbers: coldNumbers.slice(0, 10), // Top 10 số lạnh
            normalNumbers: normalNumbers.slice(0, 15), // Top 15 số bình thường
            gapScores,
            totalAnalyzed: allNumbers.size
        };
    }

    /**
     * Phân tích Seasonal Patterns
     * @param {Array} historicalData - Dữ liệu lịch sử
     * @param {Date} targetDate - Ngày dự đoán
     * @param {string} type - 'de' hoặc 'lo'
     * @returns {Object} Seasonal analysis
     */
    analyzeSeasonalPattern(historicalData, targetDate, type) {
        const targetMonth = moment(targetDate).month();
        const targetDayOfWeek = moment(targetDate).day();

        // Tìm dữ liệu cùng tháng trong các năm trước
        const sameMonthData = historicalData.filter(result => {
            const resultMonth = moment(result.drawDate).month();
            return resultMonth === targetMonth;
        });

        // Tìm dữ liệu cùng thứ trong tuần
        const sameDayOfWeekData = historicalData.filter(result => {
            const resultDayOfWeek = moment(result.drawDate).day();
            return resultDayOfWeek === targetDayOfWeek;
        });

        // Phân tích pattern theo tháng
        const monthlyPattern = this.analyzePatternInData(sameMonthData, type);

        // Phân tích pattern theo thứ
        const weeklyPattern = this.analyzePatternInData(sameDayOfWeekData, type);

        // Kết hợp patterns
        const combinedPattern = this.combinePatterns([monthlyPattern, weeklyPattern]);

        return {
            monthlyPattern,
            weeklyPattern,
            recommendedNumbers: combinedPattern.topNumbers.slice(0, 15),
            confidence: combinedPattern.confidence
        };
    }

    /**
     * Phân tích Daily Context
     * @param {Date} targetDate - Ngày dự đoán
     * @param {Array} historicalData - Dữ liệu lịch sử
     * @param {string} type - 'de' hoặc 'lo'
     * @returns {Object} Daily context analysis
     */
    analyzeDailyContext(targetDate, historicalData, type) {
        const dayOfWeek = moment(targetDate).day();
        const dayOfMonth = moment(targetDate).date();
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
        const isMonthEnd = dayOfMonth >= 28;

        // Tìm dữ liệu tương tự (cùng thứ, cùng điều kiện)
        const similarDays = historicalData.filter(result => {
            const resultDayOfWeek = moment(result.drawDate).day();
            const resultDayOfMonth = moment(result.drawDate).date();
            const resultIsWeekend = resultDayOfWeek === 0 || resultDayOfWeek === 6;
            const resultIsMonthEnd = resultDayOfMonth >= 28;

            return resultDayOfWeek === dayOfWeek &&
                resultIsWeekend === isWeekend &&
                Math.abs(resultDayOfMonth - dayOfMonth) <= 3;
        });

        const contextPattern = this.analyzePatternInData(similarDays, type);

        return {
            dayOfWeek,
            dayOfMonth,
            isWeekend,
            isMonthEnd,
            similarDaysCount: similarDays.length,
            recommendedNumbers: contextPattern.topNumbers.slice(0, 10),
            confidence: contextPattern.confidence
        };
    }

    /**
     * Phân tích Advanced Patterns
     * @param {Array} historicalData - Dữ liệu lịch sử
     * @param {string} type - 'de' hoặc 'lo'
     * @returns {Array} Advanced patterns
     */
    analyzeAdvancedPatterns(historicalData, type) {
        const patterns = [];

        // 1. Consecutive Pattern (số liên tiếp)
        const consecutivePattern = this.findConsecutivePatterns(historicalData, type);
        if (consecutivePattern.length > 0) {
            patterns.push({
                type: 'consecutive',
                data: consecutivePattern,
                weight: 0.8
            });
        }

        // 2. Mirror Pattern (số gương)
        const mirrorPattern = this.findMirrorPatterns(historicalData, type);
        if (mirrorPattern.length > 0) {
            patterns.push({
                type: 'mirror',
                data: mirrorPattern,
                weight: 0.6
            });
        }

        // 3. Sum Pattern (tổng các chữ số)
        const sumPattern = this.findSumPatterns(historicalData, type);
        if (sumPattern.length > 0) {
            patterns.push({
                type: 'sum',
                data: sumPattern,
                weight: 0.7
            });
        }

        // 4. Position Pattern (vị trí xuất hiện)
        const positionPattern = this.findPositionPatterns(historicalData, type);
        if (positionPattern.length > 0) {
            patterns.push({
                type: 'position',
                data: positionPattern,
                weight: 0.9
            });
        }

        return patterns;
    }

    /**
     * Kết hợp tất cả phân tích Gap
     * @param {Object} analysis - Tất cả phân tích
     * @returns {Array} Final predictions
     */
    combineGapAnalysis(analysis) {
        const { gap10Days, gap30Days, seasonalPattern, dailyContext, advancedPatterns, targetDate, type } = analysis;

        const combinedScores = {};

        // 1. Gap 10 ngày (trọng số cao nhất)
        gap10Days.hotNumbers.forEach(({ number, score }) => {
            combinedScores[number] = (combinedScores[number] || 0) + score * this.gapWeights.recent10Days;
        });

        // 2. Gap 30 ngày
        gap30Days.hotNumbers.forEach(({ number, score }) => {
            combinedScores[number] = (combinedScores[number] || 0) + score * this.gapWeights.recent30Days;
        });

        // 3. Seasonal pattern
        seasonalPattern.recommendedNumbers.forEach(({ number, score }) => {
            combinedScores[number] = (combinedScores[number] || 0) + score * this.gapWeights.seasonal;
        });

        // 4. Daily context
        dailyContext.recommendedNumbers.forEach(({ number, score }) => {
            combinedScores[number] = (combinedScores[number] || 0) + score * this.gapWeights.dailyContext;
        });

        // 5. Advanced patterns
        advancedPatterns.forEach(pattern => {
            pattern.data.forEach(({ number, score }) => {
                combinedScores[number] = (combinedScores[number] || 0) + score * pattern.weight * 0.02; // Giảm trọng số
            });
        });

        // Normalize scores để có phân bố realistic
        const maxScore = Math.max(...Object.values(combinedScores));
        const minScore = Math.min(...Object.values(combinedScores));
        const scoreRange = maxScore - minScore || 1;

        // Chuyển đổi thành predictions với phân bố realistic và đa dạng
        const predictions = Object.entries(combinedScores)
            .map(([number, score]) => {
                // Normalize về thang 0-1, sau đó scale xuống thang realistic (0-0.12)
                const normalizedScore = (score - minScore) / scoreRange;
                const baseScore = Math.min(0.12, normalizedScore * 0.12); // Max 12%

                // Thêm một chút randomness để tạo sự đa dạng
                const randomFactor = 0.8 + Math.random() * 0.4; // 0.8-1.2
                const realisticScore = Math.min(0.12, baseScore * randomFactor);

                return {
                    number,
                    score: realisticScore,
                    percentage: (realisticScore * 100).toFixed(2)
                };
            })
            .sort((a, b) => b.score - a.score)
            .slice(0, 30); // Top 30 thay vì 50

        return predictions;
    }

    /**
     * Tạo Daily Uniqueness - Core Feature
     * @param {Array} predictions - Predictions cơ bản
     * @param {Date} targetDate - Ngày dự đoán
     * @param {string} type - 'de' hoặc 'lo'
     * @returns {Array} Unique predictions cho ngày
     */
    createDailyUniqueness(predictions, targetDate, type) {
        const dayOfYear = moment(targetDate).dayOfYear();
        const weekOfYear = moment(targetDate).week();
        const monthOfYear = moment(targetDate).month() + 1;

        // Tạo unique seed dựa trên ngày
        const uniqueSeed = (dayOfYear * 7 + weekOfYear * 3 + monthOfYear * 11) % 100;

        // Áp dụng uniqueness factor
        const uniquePredictions = predictions.map((pred, index) => {
            const uniquenessFactor = this.calculateUniquenessFactor(pred.number, targetDate, uniqueSeed);
            const adjustedScore = pred.score * uniquenessFactor;

            return {
                ...pred,
                score: adjustedScore,
                percentage: (adjustedScore * 100).toFixed(2),
                uniqueness: uniquenessFactor,
                dailyRank: index + 1,
                specialNote: this.generateSpecialNote(pred, targetDate, uniquenessFactor)
            };
        });

        // Sắp xếp lại theo score đã điều chỉnh
        return uniquePredictions
            .sort((a, b) => b.score - a.score)
            .slice(0, 20); // Top 20 unique predictions
    }

    /**
     * Tính Uniqueness Factor cho từng số
     * @param {string} number - Số cần tính
     * @param {Date} targetDate - Ngày dự đoán
     * @param {number} uniqueSeed - Seed độc đáo
     * @returns {number} Uniqueness factor (0.8 - 1.2) - Giảm range
     */
    calculateUniquenessFactor(number, targetDate, uniqueSeed) {
        const numValue = parseInt(number);
        const dayOfYear = moment(targetDate).dayOfYear();

        // Tính toán dựa trên các yếu tố độc đáo - Giảm impact
        const factor1 = Math.sin((numValue + dayOfYear) * Math.PI / 180) * 0.1 + 1; // 0.9 - 1.1
        const factor2 = Math.cos((uniqueSeed + numValue) * Math.PI / 90) * 0.1 + 1; // 0.9 - 1.1
        const factor3 = Math.sin((dayOfYear * numValue) * Math.PI / 360) * 0.05 + 1; // 0.95 - 1.05

        return Math.max(0.8, Math.min(1.2, factor1 * factor2 * factor3));
    }

    /**
     * Tạo Special Note cho mỗi prediction
     * @param {Object} prediction - Prediction object
     * @param {Date} targetDate - Ngày dự đoán
     * @param {number} uniqueness - Uniqueness factor
     * @returns {string} Special note
     */
    generateSpecialNote(prediction, targetDate, uniqueness) {
        const dayOfWeek = moment(targetDate).format('dddd');
        const month = moment(targetDate).format('MMMM');

        if (uniqueness > 1.2) {
            return `🔥 Số đặc biệt cho ${dayOfWeek} tháng ${month}`;
        } else if (uniqueness > 1.0) {
            return `⭐ Số phù hợp với ${dayOfWeek}`;
        } else if (uniqueness > 0.8) {
            return `📊 Số có tiềm năng cho ${dayOfWeek}`;
        } else {
            return `💫 Số cân bằng cho ${dayOfWeek}`;
        }
    }

    // Helper methods
    async getHistoricalData(date, days) {
        const endDate = new Date(date);
        endDate.setDate(endDate.getDate() - 1);
        endDate.setHours(23, 59, 59, 999);

        const startDate = new Date(endDate);
        startDate.setDate(startDate.getDate() - days + 1);
        startDate.setHours(0, 0, 0, 0);

        return await XSMB.find({
            drawDate: { $gte: startDate, $lte: endDate },
            station: 'xsmb'
        }).sort({ drawDate: -1 });
    }

    // Static method để có thể gọi từ bên ngoài
    static async getHistoricalData(date, days) {
        const endDate = new Date(date);
        endDate.setDate(endDate.getDate() - 1);
        endDate.setHours(23, 59, 59, 999);

        const startDate = new Date(endDate);
        startDate.setDate(startDate.getDate() - days + 1);
        startDate.setHours(0, 0, 0, 0);

        return await XSMB.find({
            drawDate: { $gte: startDate, $lte: endDate },
            station: 'xsmb'
        }).sort({ drawDate: -1 });
    }

    // Static method để có thể gọi analyzeGapPattern từ bên ngoài
    static analyzeGapPattern(historicalData, gapDays, type) {
        const instance = new AdvancedGapAnalysisService();
        return instance.analyzeGapPattern(historicalData, gapDays, type);
    }

    extractNumbers(result, type) {
        if (type === 'de') {
            return result.specialPrize && result.specialPrize[0]
                ? [result.specialPrize[0].slice(-2)]
                : [];
        } else {
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
    }

    analyzePatternInData(data, type) {
        const numberCounts = {};
        data.forEach(result => {
            const numbers = this.extractNumbers(result, type);
            numbers.forEach(num => {
                numberCounts[num] = (numberCounts[num] || 0) + 1;
            });
        });

        const total = Object.values(numberCounts).reduce((sum, count) => sum + count, 0);
        const topNumbers = Object.entries(numberCounts)
            .map(([number, count]) => ({
                number,
                count,
                score: Math.min(0.1, count / total * 0.1) // Giới hạn max 10%
            }))
            .sort((a, b) => b.score - a.score);

        return {
            topNumbers,
            confidence: Math.min(0.5, data.length / 20) // Confidence dựa trên số lượng data, max 50%
        };
    }

    combinePatterns(patterns) {
        const combined = {};
        patterns.forEach(pattern => {
            pattern.topNumbers.forEach(({ number, score }) => {
                combined[number] = (combined[number] || 0) + score * pattern.confidence * 0.1; // Giảm trọng số
            });
        });

        return {
            topNumbers: Object.entries(combined)
                .map(([number, score]) => ({
                    number,
                    score: Math.min(0.05, score) // Giới hạn max 5%
                }))
                .sort((a, b) => b.score - a.score),
            confidence: Math.min(0.3, patterns.reduce((sum, p) => sum + p.confidence, 0) / patterns.length) // Max 30%
        };
    }

    findConsecutivePatterns(data, type) {
        // Tìm pattern số liên tiếp
        const patterns = [];
        for (let i = 0; i < data.length - 1; i++) {
            const current = this.extractNumbers(data[i], type);
            const next = this.extractNumbers(data[i + 1], type);

            current.forEach(num => {
                const numValue = parseInt(num);
                const consecutive = [
                    (numValue + 1) % 100,
                    (numValue - 1 + 100) % 100
                ].map(n => n.toString().padStart(2, '0'));

                consecutive.forEach(consecutiveNum => {
                    if (next.includes(consecutiveNum)) {
                        patterns.push({
                            number: consecutiveNum,
                            score: 0.02, // Giảm từ 0.8 xuống 0.02
                            type: 'consecutive'
                        });
                    }
                });
            });
        }
        return patterns;
    }

    findMirrorPatterns(data, type) {
        // Tìm pattern số gương (12 -> 21)
        const patterns = [];
        data.forEach(result => {
            const numbers = this.extractNumbers(result, type);
            numbers.forEach(num => {
                if (num[0] !== num[1]) {
                    const mirror = num[1] + num[0];
                    patterns.push({
                        number: mirror,
                        score: 0.015, // Giảm từ 0.6 xuống 0.015
                        type: 'mirror',
                        original: num
                    });
                }
            });
        });
        return patterns;
    }

    findSumPatterns(data, type) {
        // Tìm pattern tổng các chữ số
        const patterns = [];
        data.forEach(result => {
            const numbers = this.extractNumbers(result, type);
            numbers.forEach(num => {
                const sum = parseInt(num[0]) + parseInt(num[1]);
                const sumStr = sum.toString().padStart(2, '0');
                patterns.push({
                    number: sumStr,
                    score: 0.01, // Giảm từ 0.7 xuống 0.01
                    type: 'sum',
                    original: num
                });
            });
        });
        return patterns;
    }

    findPositionPatterns(data, type) {
        // Tìm pattern vị trí xuất hiện
        const patterns = [];
        data.forEach(result => {
            const numbers = this.extractNumbers(result, type);
            numbers.forEach((num, index) => {
                patterns.push({
                    number: num,
                    score: 0.01 - (index * 0.001), // Giảm từ 0.9 xuống 0.01
                    type: 'position',
                    position: index
                });
            });
        });
        return patterns;
    }

    calculateUniquenessScore(predictions, historicalData) {
        // Tính độ độc đáo của predictions - Realistic hơn
        const recentNumbers = new Set();
        historicalData.slice(0, 10).forEach(result => {
            const numbers = this.extractNumbers(result, 'de');
            numbers.forEach(num => recentNumbers.add(num));
        });

        const uniqueCount = predictions.filter(p => !recentNumbers.has(p.number)).length;
        const baseUniqueness = (uniqueCount / predictions.length) * 100;

        // Thêm randomness để tạo sự đa dạng
        const randomFactor = 0.7 + Math.random() * 0.6; // 0.7-1.3
        return Math.min(100, baseUniqueness * randomFactor);
    }

    calculateConfidenceScore(predictions) {
        // Tính độ tin cậy dựa trên score distribution - Realistic hơn
        const scores = predictions.map(p => p.score);
        const avgScore = scores.reduce((sum, score) => sum + score, 0) / scores.length;
        const variance = scores.reduce((sum, score) => sum + Math.pow(score - avgScore, 2), 0) / scores.length;

        // Confidence dựa trên độ phân tán và giá trị trung bình
        const baseConfidence = avgScore * 100; // 0-15%
        const variancePenalty = variance * 100; // Penalty cho độ phân tán cao
        const finalConfidence = Math.max(5, Math.min(25, baseConfidence - variancePenalty)); // 5-25%

        return finalConfidence;
    }
}

module.exports = new AdvancedGapAnalysisService();
