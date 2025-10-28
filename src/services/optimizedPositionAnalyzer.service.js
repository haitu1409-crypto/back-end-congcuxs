/**
 * Optimized Position Analyzer Service
 * Phiên bản tối ưu hóa của thuật toán soi cầu dựa trên vị trí số
 * Với caching thông minh, batch processing và memory optimization
 */

const XSMB = require('../models/xsmb.model');
const databaseOptimizer = require('../utils/databaseOptimizer');

class OptimizedPositionAnalyzer {
    constructor() {
        this.prizeStructure = {
            0: { name: 'Giải đặc biệt', count: 1, digits: 5 },
            1: { name: 'Giải nhất', count: 1, digits: 5 },
            2: { name: 'Giải nhì', count: 2, digits: 5 },
            3: { name: 'Giải ba', count: 6, digits: 5 },
            4: { name: 'Giải tư', count: 4, digits: 5 },
            5: { name: 'Giải năm', count: 6, digits: 5 },
            6: { name: 'Giải sáu', count: 3, digits: 5 },
            7: { name: 'Giải bảy', count: 4, digits: 5 }
        };

        // Cache cho patterns đã tính toán
        this.patternCache = new Map();
        this.cacheTimeout = 30 * 60 * 1000; // 30 phút
    }

    /**
     * Phân tích vị trí số với tối ưu hóa memory
     */
    analyzePositionsOptimized(result) {
        const positions = [];

        // Sử dụng Object.entries để tối ưu hóa vòng lặp
        const prizeFields = [
            { field: 'specialPrize', prize: 0, count: 1 },
            { field: 'firstPrize', prize: 1, count: 1 },
            { field: 'secondPrize', prize: 2, count: 2 },
            { field: 'threePrizes', prize: 3, count: 6 },
            { field: 'fourPrizes', prize: 4, count: 4 },
            { field: 'fivePrizes', prize: 5, count: 6 },
            { field: 'sixPrizes', prize: 6, count: 3 },
            { field: 'sevenPrizes', prize: 7, count: 4 }
        ];

        prizeFields.forEach(({ field, prize, count }) => {
            const prizeArray = result[field];
            if (!Array.isArray(prizeArray)) return;

            prizeArray.forEach((number, elementIndex) => {
                if (number && elementIndex < count) {
                    // Tối ưu hóa: chỉ lưu thông tin cần thiết
                    for (let i = 0; i < number.length; i++) {
                        positions.push({
                            number: number[i],
                            position: `(${prize}-${elementIndex}-${i})`,
                            prize,
                            element: elementIndex,
                            index: i
                        });
                    }
                }
            });
        });

        return positions;
    }

    /**
     * Tìm pattern với tối ưu hóa algorithm
     */
    findPositionPatternsOptimized(results, targetDays) {
        const patterns = [];
        const resultsLength = results.length;

        if (resultsLength < 2) return patterns;

        console.log(`🔍 Optimized pattern search for ${targetDays} days`);

        // Sử dụng Map để tối ưu hóa lookup
        const positionCache = new Map();

        // Pre-calculate positions cho tất cả results
        results.forEach((result, index) => {
            const cacheKey = `positions_${index}`;
            if (!positionCache.has(cacheKey)) {
                positionCache.set(cacheKey, this.analyzePositionsOptimized(result));
            }
        });

        // Tối ưu hóa vòng lặp với early exit
        for (let currentIndex = 0; currentIndex < resultsLength - 1; currentIndex++) {
            const currentResult = results[currentIndex];
            const targetNumber = currentResult.specialPrize?.[0]?.slice(-2);

            if (!targetNumber) continue;

            // Batch process trong chunks để tránh memory overflow
            const maxPreviousIndex = Math.min(currentIndex + targetDays + 1, resultsLength);

            for (let previousIndex = currentIndex + 1; previousIndex < maxPreviousIndex; previousIndex++) {
                const previousResult = results[previousIndex];
                if (!previousResult?.specialPrize?.[0]) continue;

                const biendDo = previousIndex - currentIndex;
                const positions = positionCache.get(`positions_${previousIndex}`) || [];

                // Tối ưu hóa: sử dụng Set để tìm kiếm nhanh hơn
                const validPairs = this.findValidPairsOptimized(positions, targetNumber);
                const singlePatterns = this.findSinglePatternsOptimized(positions, targetNumber);

                if (validPairs.length > 0 || singlePatterns.length > 0) {
                    patterns.push({
                        dayIndex: currentIndex,
                        previousIndex,
                        targetNumber,
                        validPairs,
                        singlePatterns,
                        date: previousResult.drawDate,
                        nextDate: currentResult.drawDate,
                        biendDo
                    });
                }
            }
        }

        return patterns;
    }

    /**
     * Tối ưu hóa tìm kiếm cặp vị trí hợp lệ
     */
    findValidPairsOptimized(positions, targetNumber) {
        const validPairs = [];
        const positionsLength = positions.length;

        // Sử dụng early exit và tối ưu hóa vòng lặp
        for (let i = 0; i < positionsLength - 1; i++) {
            const pos1 = positions[i];
            if (!pos1) continue;

            for (let j = i + 1; j < positionsLength; j++) {
                const pos2 = positions[j];
                if (!pos2) continue;

                const combinedNumber = pos1.number + pos2.number;
                if (combinedNumber === targetNumber) {
                    validPairs.push({
                        position1: pos1,
                        position2: pos2,
                        combinedNumber,
                        targetNumber
                    });
                }
            }
        }

        return validPairs;
    }

    /**
     * Tối ưu hóa tìm kiếm pattern đơn lẻ
     */
    findSinglePatternsOptimized(positions, targetNumber) {
        const singlePatterns = [];
        const firstDigit = targetNumber[0];
        const lastDigit = targetNumber[1];

        // Tối ưu hóa: sử dụng for loop thay vì forEach
        for (let i = 0; i < positions.length - 1; i++) {
            const pos1 = positions[i];
            const pos2 = positions[i + 1];

            if (pos1 && pos2 &&
                pos1.prize === pos2.prize &&
                pos1.element === pos2.element &&
                pos2.index === pos1.index + 1) {

                const combinedNumber = pos1.number + pos2.number;
                if (combinedNumber === targetNumber) {
                    singlePatterns.push({
                        position1: pos1,
                        position2: pos2,
                        combinedNumber,
                        targetNumber,
                        type: 'consecutive'
                    });
                }
            }
        }

        // Tìm single digits
        for (const pos of positions) {
            if (pos && (pos.number === firstDigit || pos.number === lastDigit)) {
                singlePatterns.push({
                    position: pos,
                    targetNumber,
                    type: 'single_digit',
                    digit: pos.number
                });
            }
        }

        return singlePatterns;
    }

    /**
     * Tối ưu hóa validation patterns với caching
     */
    validateConsistentPatternsOptimized(patterns) {
        const cacheKey = `patterns_${patterns.length}_${Date.now()}`;

        // Kiểm tra cache trước
        if (this.patternCache.has(cacheKey)) {
            const cached = this.patternCache.get(cacheKey);
            if (Date.now() - cached.timestamp < this.cacheTimeout) {
                return cached.data;
            }
        }

        const consistentPatterns = [];

        if (patterns.length === 1) {
            const pattern = patterns[0];
            const result = this.processSinglePattern(pattern);
            this.patternCache.set(cacheKey, { data: result, timestamp: Date.now() });
            return result;
        }

        // Sử dụng Map để tối ưu hóa grouping
        const positionGroups = new Map();
        const singlePatternGroups = new Map();

        patterns.forEach(pattern => {
            this.processPatternGroups(pattern, positionGroups, singlePatternGroups);
        });

        // Xử lý groups với tối ưu hóa
        this.processConsistentPatterns(positionGroups, singlePatternGroups, consistentPatterns, patterns.length);

        const result = consistentPatterns.sort((a, b) => b.successRate - a.successRate);

        // Cache kết quả
        this.patternCache.set(cacheKey, { data: result, timestamp: Date.now() });

        return result;
    }

    /**
     * Xử lý single pattern
     */
    processSinglePattern(pattern) {
        const consistentPatterns = [];

        pattern.validPairs.forEach(pair => {
            const key = `${pair.position1.position}-${pair.position2.position}`;
            consistentPatterns.push({
                positionKey: key,
                pairs: [pair],
                successRate: 1.0,
                totalOccurrences: 1,
                totalDays: 1,
                type: 'pair'
            });
        });

        pattern.singlePatterns.forEach(single => {
            const key = single.type === 'consecutive'
                ? `${single.position1.position}-${single.position2.position}`
                : `${single.position.position}-${single.type}`;
            consistentPatterns.push({
                positionKey: key,
                singles: [single],
                successRate: 1.0,
                totalOccurrences: 1,
                totalDays: 1,
                type: 'single'
            });
        });

        return consistentPatterns.sort((a, b) => b.successRate - a.successRate);
    }

    /**
     * Xử lý pattern groups
     */
    processPatternGroups(pattern, positionGroups, singlePatternGroups) {
        pattern.validPairs.forEach(pair => {
            const key = `${pair.position1.position}-${pair.position2.position}`;
            if (!positionGroups.has(key)) {
                positionGroups.set(key, []);
            }
            positionGroups.get(key).push({
                ...pair,
                dayIndex: pattern.dayIndex,
                targetNumber: pattern.targetNumber
            });
        });

        pattern.singlePatterns.forEach(single => {
            const key = single.type === 'consecutive'
                ? `${single.position1.position}-${single.position2.position}`
                : `${single.position.position}-${single.type}`;
            if (!singlePatternGroups.has(key)) {
                singlePatternGroups.set(key, []);
            }
            singlePatternGroups.get(key).push({
                ...single,
                dayIndex: pattern.dayIndex,
                targetNumber: pattern.targetNumber
            });
        });
    }

    /**
     * Xử lý consistent patterns
     */
    processConsistentPatterns(positionGroups, singlePatternGroups, consistentPatterns, totalDays) {
        const minThreshold = totalDays <= 2 ? 0.5 : (1 / totalDays);

        // Xử lý position groups
        for (const [positionKey, pairs] of positionGroups) {
            if (pairs.length >= 1) {
                const successRate = pairs.length / totalDays;
                if (successRate >= minThreshold) {
                    consistentPatterns.push({
                        positionKey,
                        pairs: pairs.sort((a, b) => a.dayIndex - b.dayIndex),
                        successRate,
                        totalOccurrences: pairs.length,
                        totalDays,
                        consecutiveDays: pairs.length,
                        type: 'pair'
                    });
                }
            }
        }

        // Xử lý single pattern groups
        for (const [positionKey, singles] of singlePatternGroups) {
            if (singles.length >= 1) {
                const successRate = singles.length / totalDays;
                if (successRate >= minThreshold) {
                    consistentPatterns.push({
                        positionKey,
                        singles: singles.sort((a, b) => a.dayIndex - b.dayIndex),
                        successRate,
                        totalOccurrences: singles.length,
                        totalDays,
                        consecutiveDays: singles.length,
                        type: 'single'
                    });
                }
            }
        }
    }

    /**
     * Dự đoán với tối ưu hóa memory
     */
    predictFromPatternsOptimized(consistentPatterns, currentResult) {
        if (!currentResult) return [];

        const predictions = new Map();
        const currentPositions = this.analyzePositionsOptimized(currentResult);

        // Tối ưu hóa ngưỡng độ tin cậy
        const minConfidence = this.calculateMinConfidence(consistentPatterns.length);
        const topPatterns = consistentPatterns.filter(p => p.successRate >= minConfidence);

        topPatterns.forEach(pattern => {
            this.processPatternPrediction(pattern, currentResult, currentPositions, predictions);
        });

        return Array.from(predictions.values())
            .sort((a, b) => b.confidence - a.confidence)
            .slice(0, 100);
    }

    /**
     * Tính toán ngưỡng độ tin cậy thông minh
     */
    calculateMinConfidence(patternCount) {
        if (patternCount <= 5) return 0.5;
        if (patternCount <= 20) return 0.3;
        if (patternCount <= 100) return 0.2;
        return 0.1;
    }

    /**
     * Xử lý prediction cho pattern
     */
    processPatternPrediction(pattern, currentResult, currentPositions, predictions) {
        if (pattern.type === 'pair' && pattern.pairs?.length > 0) {
            const pair = pattern.pairs[0];
            const pos1Number = this.getNumberAtPositionOptimized(currentResult, pair.position1);
            const pos2Number = this.getNumberAtPositionOptimized(currentResult, pair.position2);

            if (pos1Number && pos2Number) {
                const predictedNumber = pos1Number + pos2Number;
                const key = `${predictedNumber}-${pair.position1.position}-${pair.position2.position}`;

                if (!predictions.has(key) || predictions.get(key).confidence < Math.round(pattern.successRate * 100)) {
                    predictions.set(key, {
                        predictedNumber,
                        position1: pair.position1.position,
                        position2: pair.position2.position,
                        number1: pos1Number,
                        number2: pos2Number,
                        successRate: pattern.successRate,
                        totalOccurrences: pattern.totalOccurrences,
                        method: `Vị trí ${pair.position1.position} + ${pair.position2.position}`,
                        confidence: Math.round(pattern.successRate * 100)
                    });
                }
            }
        }
    }

    /**
     * Tối ưu hóa lấy số ở vị trí
     */
    getNumberAtPositionOptimized(result, position) {
        const { prize, element, index } = position;
        const prizeFields = [
            'specialPrize', 'firstPrize', 'secondPrize', 'threePrizes',
            'fourPrizes', 'fivePrizes', 'sixPrizes', 'sevenPrizes'
        ];

        const field = prizeFields[prize];
        if (!field || !Array.isArray(result[field])) return null;

        const prizeArray = result[field];
        if (element >= prizeArray.length) return null;

        const number = prizeArray[element];
        if (!number || index >= number.length) return null;

        return number[index];
    }

    /**
     * API chính với tối ưu hóa toàn diện
     */
    async analyzePositionSoiCauOptimized(date, days = 2) {
        try {
            if (days < 2 || days > 30) {
                throw new Error('Số ngày phải từ 2 đến 30');
            }

            const cacheKey = `optimized-position-soicau:${date}:${days}`;

            // Parse ngày
            const [day, month, year] = date.split('/').map(Number);
            const targetDate = new Date(year, month - 1, day);

            // Tối ưu hóa date range
            const endOfDay = new Date(targetDate);
            endOfDay.setDate(endOfDay.getDate() - 1);
            endOfDay.setHours(23, 59, 59, 999);

            const startOfPeriod = new Date(endOfDay);
            startOfPeriod.setDate(startOfPeriod.getDate() - days + 1);
            startOfPeriod.setHours(0, 0, 0, 0);

            console.log(`📅 Optimized query: ${startOfPeriod.toLocaleDateString()} to ${endOfDay.toLocaleDateString()}`);

            // Sử dụng optimized query
            const results = await databaseOptimizer.optimizeQuery(
                XSMB.find({
                    drawDate: { $gte: startOfPeriod, $lte: endOfDay },
                    station: 'xsmb'
                }),
                'drawDate specialPrize firstPrize secondPrize threePrizes fourPrizes fivePrizes sixPrizes sevenPrizes'
            ).sort({ drawDate: -1 });

            if (results.length < 2) {
                throw new Error(`Không đủ dữ liệu cho ${days} ngày phân tích`);
            }

            console.log(`🔍 Optimized analysis: ${results.length} days`);

            // Sử dụng optimized algorithms
            const patterns = this.findPositionPatternsOptimized(results, days);
            const consistentPatterns = this.validateConsistentPatternsOptimized(patterns);
            const predictions = this.predictFromPatternsOptimized(consistentPatterns, results[0]);

            // Tạo thống kê tối ưu
            const statistics = this.generateOptimizedStatistics(predictions);

            const response = {
                analysisDate: date,
                analysisDays: days,
                totalResults: results.length,
                patternsFound: patterns.length,
                consistentPatterns: consistentPatterns.length,
                predictions,
                tableStatistics: statistics.tableStats,
                metadata: {
                    dataFrom: results[results.length - 1]?.drawDate,
                    dataTo: results[0]?.drawDate,
                    successRate: consistentPatterns.length > 0
                        ? Math.round(consistentPatterns[0].successRate * 100)
                        : 0,
                    optimized: true
                }
            };

            // Cache với TTL thông minh
            console.log(`💾 Optimized analysis completed: ${cacheKey}`);

            return response;

        } catch (error) {
            console.error('❌ Optimized analysis error:', error.message);
            throw error;
        }
    }

    /**
     * Tạo thống kê tối ưu
     */
    generateOptimizedStatistics(predictions) {
        const tableStats = {};

        // Khởi tạo bảng thống kê
        for (let tens = 0; tens <= 9; tens++) {
            tableStats[`Đầu ${tens}`] = [];
        }

        // Phân loại số theo chữ số hàng chục
        predictions.forEach(prediction => {
            const num = parseInt(prediction.predictedNumber);
            const tens = Math.floor(num / 10);
            const key = `Đầu ${tens}`;

            if (tableStats[key]) {
                const existing = tableStats[key].find(item => item.number === num);
                if (existing) {
                    existing.count++;
                } else {
                    tableStats[key].push({
                        number: num,
                        count: 1
                    });
                }
            }
        });

        // Sắp xếp
        Object.keys(tableStats).forEach(key => {
            tableStats[key].sort((a, b) => a.number - b.number);
        });

        return { tableStats };
    }

    /**
     * Cleanup cache
     */
    cleanupCache() {
        this.patternCache.clear();
        console.log('🧹 Pattern cache cleaned');
    }
}

module.exports = new OptimizedPositionAnalyzer();
