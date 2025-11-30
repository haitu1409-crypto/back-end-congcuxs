/**
 * Bayesian CDM Service - Compound Dirichlet-Multinomial
 * Sử dụng node-cache thay vì Redis
 */

const NodeCache = require('node-cache');
const XSMB = require('../models/xsmb.model');

class BayesianCDMService {
    constructor() {
        this.alpha = 1; // Laplace smoothing parameter
        this.cache = new NodeCache({
            stdTTL: 3600, // Cache 1 giờ
            checkperiod: 300, // Check expired keys mỗi 5 phút
            useClones: false // Tối ưu memory
        });

        // Service initialized silently
    }

    /**
     * Tính toán xác suất Bayesian cho đề (2 số cuối giải đặc biệt)
     * @param {Date} date - Ngày dự đoán
     * @param {number} days - Số ngày dữ liệu lịch sử
     * @returns {Object} Xác suất cho từng số
     */
    async calculateDeProbabilities(date, days = 100) {
        // Thêm timestamp để tránh cache cũ
        const now = new Date();
        const cacheKey = `bayesian:de:${date.toISOString().split('T')[0]}:${days}:${now.getHours()}`;

        // Kiểm tra cache
        const cached = this.cache.get(cacheKey);
        if (cached) {
            console.log(`📋 Cache hit for DE: ${cacheKey}`);
            return cached;
        }

        console.log(`🔄 Calculating DE probabilities for ${days} days...`);

        // Lấy dữ liệu lịch sử
        const historicalData = await this.getHistoricalData(date, days);

        if (historicalData.length === 0) {
            throw new Error(`Không tìm thấy dữ liệu lịch sử cho ${days} ngày`);
        }

        // Tính toán xác suất với ADVANCED PATTERN MATCHING
        const probabilities = this.computeAdvancedProbabilities(historicalData, 'de');

        // Cache kết quả
        this.cache.set(cacheKey, probabilities);

        console.log(`✅ DE probabilities calculated and cached`);
        return probabilities;
    }

    /**
     * Tính toán xác suất Bayesian cho lô (2 số cuối tất cả giải)
     * @param {Date} date - Ngày dự đoán
     * @param {number} days - Số ngày dữ liệu lịch sử
     * @returns {Object} Xác suất cho từng số
     */
    async calculateLoProbabilities(date, days = 100) {
        // Thêm timestamp để tránh cache cũ
        const now = new Date();
        const cacheKey = `bayesian:lo:${date.toISOString().split('T')[0]}:${days}:${now.getHours()}`;

        // Kiểm tra cache
        const cached = this.cache.get(cacheKey);
        if (cached) {
            console.log(`📋 Cache hit for LO: ${cacheKey}`);
            return cached;
        }

        console.log(`🔄 Calculating LO probabilities for ${days} days...`);

        // Lấy dữ liệu lịch sử
        const historicalData = await this.getHistoricalData(date, days);

        if (historicalData.length === 0) {
            throw new Error(`Không tìm thấy dữ liệu lịch sử cho ${days} ngày`);
        }

        // Tính toán xác suất với ADVANCED PATTERN MATCHING
        const probabilities = this.computeAdvancedProbabilities(historicalData, 'lo');

        // Cache kết quả
        this.cache.set(cacheKey, probabilities);

        console.log(`✅ LO probabilities calculated and cached`);
        return probabilities;
    }

    /**
     * Advanced Pattern Matching: So sánh kết quả ngày gần nhất với history
     * Tìm các ngày có pattern tương tự và xem số nào xuất hiện vào ngày tiếp theo
     * @param {Array} historicalData - Dữ liệu lịch sử
     * @param {string} type - 'de' hoặc 'lo'
     * @returns {Object} Xác suất cho từng số
     */
    computeAdvancedProbabilities(historicalData, type = 'de') {
        if (historicalData.length < 2) {
            // Không đủ dữ liệu, fallback về method cơ bản
            return type === 'de' ? this.computeDeProbabilities(historicalData) : this.computeLoProbabilities(historicalData);
        }

        // Lấy kết quả ngày gần nhất (ngày hôm qua nếu predict cho hôm nay)
        const yesterday = historicalData[0];

        // Extract numbers from yesterday
        const yesterdayNumbers = this.extractNumbers(yesterday, type);

        console.log(`📊 Yesterday's numbers (${type}): ${Array.from(yesterdayNumbers).join(', ')}`);

        // Tìm các ngày có pattern tương tự
        const similarDays = [];

        for (let i = 1; i < historicalData.length - 1; i++) {
            const pastDay = historicalData[i];
            const nextDay = historicalData[i - 1]; // Ngày sau pastDay

            const pastNumbers = this.extractNumbers(pastDay, type);
            const nextNumbers = this.extractNumbers(nextDay, type);

            // Tính similarity score
            const similarity = this.calculateSimilarity(yesterdayNumbers, pastNumbers);

            if (similarity > 0) {
                similarDays.push({
                    similarity: similarity,
                    pastDay: pastDay,
                    nextNumbers: nextNumbers,
                    drawDate: pastDay.drawDate
                });
            }
        }

        // Sort by similarity
        similarDays.sort((a, b) => b.similarity - a.similarity);

        console.log(`🔍 Found ${similarDays.length} similar days (similarity > 0)`);
        if (similarDays.length > 0) {
            console.log(`  Top 3 similar: ${similarDays.slice(0, 3).map(d => `${d.similarity.toFixed(2)}`).join(', ')}`);
        }

        // Calculate weighted probability based on similar patterns
        const weightedCounts = {};
        let totalWeight = 0;

        similarDays.forEach(day => {
            const weight = day.similarity; // Use similarity as weight
            totalWeight += weight;

            day.nextNumbers.forEach(num => {
                weightedCounts[num] = (weightedCounts[num] || 0) + weight;
            });
        });

        // If no similar patterns found, fallback to basic method
        if (totalWeight === 0 || similarDays.length === 0) {
            console.log('⚠️ No similar patterns found, using basic Bayesian method');
            return type === 'de' ? this.computeDeProbabilities(historicalData) : this.computeLoProbabilities(historicalData);
        }

        // Calculate probabilities
        const probabilities = {};
        const smoothingAlpha = this.alpha;

        for (let i = 0; i < 100; i++) {
            const num = i.toString().padStart(2, '0');
            const count = weightedCounts[num] || 0;
            probabilities[num] = (count + smoothingAlpha) / (totalWeight + 100 * smoothingAlpha);
        }

        // Apply penalty for recent numbers
        const recentNumbers = this.getRecentNumbers(historicalData, 3);
        if (recentNumbers.size > 0) {
            console.log(`⚠️ Applying 70% penalty to ${recentNumbers.size} recent numbers`);
            for (let num in probabilities) {
                if (recentNumbers.has(num)) {
                    probabilities[num] *= 0.3;
                }
            }
        }

        // Metadata
        probabilities._metadata = {
            method: 'advanced-pattern-matching',
            yesterdayNumbers: Array.from(yesterdayNumbers),
            similarDaysCount: similarDays.length,
            totalWeight: totalWeight,
            recentNumbers: Array.from(recentNumbers),
            type: type,
            topSimilarDays: similarDays.slice(0, 5).map(d => ({
                date: d.drawDate,
                similarity: d.similarity.toFixed(2)
            }))
        };

        return probabilities;
    }

    /**
     * Extract numbers from a result based on type
     */
    extractNumbers(result, type = 'de') {
        const numbers = new Set();

        if (type === 'de') {
            // Extract đề (2 số cuối giải đặc biệt)
            if (result.specialPrize && result.specialPrize.length > 0) {
                numbers.add(result.specialPrize[0].slice(-2));
            }
        } else {
            // Extract lô (2 số cuối tất cả giải)
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

            allPrizes.forEach(prize => {
                if (prize && prize.length >= 2) {
                    numbers.add(prize.slice(-2));
                }
            });
        }

        return numbers;
    }

    /**
     * Calculate similarity score between two sets of numbers
     * Returns value between 0 and 1
     */
    calculateSimilarity(set1, set2) {
        const intersection = new Set([...set1].filter(x => set2.has(x)));
        const union = new Set([...set1, ...set2]);

        if (union.size === 0) return 0;

        // Jaccard similarity
        return intersection.size / union.size;
    }

    /**
     * Lấy dữ liệu lịch sử từ database
     * @param {Date} date - Ngày dự đoán
     * @param {number} days - Số ngày dữ liệu
     * @returns {Array} Dữ liệu lịch sử
     */
    async getHistoricalData(date, days) {
        const endDate = new Date(date);
        endDate.setDate(endDate.getDate() - 1); // Không bao gồm ngày dự đoán
        endDate.setHours(23, 59, 59, 999);

        const startDate = new Date(endDate);
        startDate.setDate(startDate.getDate() - days + 1);
        startDate.setHours(0, 0, 0, 0);

        console.log(`📊 Fetching data from ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`);

        const data = await XSMB.find({
            drawDate: { $gte: startDate, $lte: endDate },
            station: 'xsmb'
        })
            .select('drawDate specialPrize firstPrize secondPrize threePrizes fourPrizes fivePrizes sixPrizes sevenPrizes')
            .sort({ drawDate: -1 })
            .lean();

        console.log(`📈 Found ${data.length} records (removed isComplete filter to get all data)`);
        return data;
    }

    /**
     * Tính xác suất cho đề (2 số cuối giải đặc biệt)
     * @param {Array} historicalData - Dữ liệu lịch sử
     * @returns {Object} Xác suất cho từng số
     */
    computeDeProbabilities(historicalData) {
        const counts = {};

        // Đếm tần suất xuất hiện của đề
        historicalData.forEach(result => {
            if (result.specialPrize && result.specialPrize.length > 0) {
                const de = result.specialPrize[0].slice(-2); // 2 số cuối
                counts[de] = (counts[de] || 0) + 1;
            }
        });

        const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
        const probabilities = {};

        // Tính xác suất Bayesian với Laplace smoothing
        for (let i = 0; i < 100; i++) {
            const num = i.toString().padStart(2, '0');
            const count = counts[num] || 0;
            probabilities[num] = (count + this.alpha) / (total + 100 * this.alpha);
        }

        // Thêm metadata
        probabilities._metadata = {
            totalCount: total,
            alpha: this.alpha,
            dataPoints: historicalData.length,
            formula: 'p_j = (count_j + alpha) / (total + alpha * 100)'
        };

        return probabilities;
    }

    /**
     * Tính xác suất cho lô (2 số cuối tất cả giải)
     * @param {Array} historicalData - Dữ liệu lịch sử
     * @returns {Object} Xác suất cho từng số
     */
    computeLoProbabilities(historicalData) {
        const counts = {};

        // Đếm tần suất xuất hiện của lô
        historicalData.forEach(result => {
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

            allPrizes.forEach(prize => {
                if (prize && prize.length >= 2) {
                    const lo = prize.slice(-2); // 2 số cuối
                    counts[lo] = (counts[lo] || 0) + 1;
                }
            });
        });

        const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
        const probabilities = {};

        // Tính xác suất Bayesian với Laplace smoothing
        for (let i = 0; i < 100; i++) {
            const num = i.toString().padStart(2, '0');
            const count = counts[num] || 0;
            probabilities[num] = (count + this.alpha) / (total + 100 * this.alpha);
        }

        // Thêm metadata
        probabilities._metadata = {
            totalCount: total,
            alpha: this.alpha,
            dataPoints: historicalData.length,
            formula: 'p_j = (count_j + alpha) / (total + alpha * 100)'
        };

        return probabilities;
    }

    /**
     * Lấy top N số có xác suất cao nhất
     * @param {Object} probabilities - Xác suất cho từng số
     * @param {number} topN - Số lượng top
     * @returns {Array} Top N số
     */
    getTopPredictions(probabilities, topN = 20) {
        const sorted = Object.entries(probabilities)
            .filter(([key]) => !key.startsWith('_')) // Loại bỏ metadata
            .sort((a, b) => b[1] - a[1])
            .slice(0, topN);

        return sorted.map(([number, probability]) => ({
            number,
            probability: probability,
            percentage: (probability * 100).toFixed(2)
        }));
    }

    /**
     * Tính expected appearances cho lô
     * @param {Object} probabilities - Xác suất cho từng số
     * @returns {Object} Expected appearances
     */
    calculateExpectedAppearances(probabilities) {
        const expected = {};
        const M = 27; // Số lần rút mỗi kỳ

        for (let i = 0; i < 100; i++) {
            const num = i.toString().padStart(2, '0');
            const prob = probabilities[num];
            expected[num] = M * prob;
        }

        return expected;
    }

    /**
     * Tính chance xuất hiện ít nhất 1 lần
     * @param {Object} probabilities - Xác suất cho từng số
     * @returns {Object} Chance xuất hiện
     */
    calculateChanceAppearance(probabilities) {
        const chances = {};
        const M = 27; // Số lần rút mỗi kỳ

        for (let i = 0; i < 100; i++) {
            const num = i.toString().padStart(2, '0');
            const prob = probabilities[num];
            // Chance = 1 - (1 - p)^M
            chances[num] = 1 - Math.pow(1 - prob, M);
        }

        return chances;
    }

    /**
     * Lấy các số xuất hiện gần đây nhất
     * @param {Array} historicalData - Dữ liệu lịch sử
     * @param {number} count - Số lượng số cần lấy
     * @returns {Set} Set các số xuất hiện gần đây
     */
    getRecentNumbers(historicalData, count) {
        const recentNumbers = new Set();
        const recentDates = historicalData.slice(0, count).map(d => d.drawDate);

        for (const result of historicalData) {
            if (recentDates.includes(result.drawDate)) {
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

                allPrizes.forEach(prize => {
                    if (prize && prize.length >= 2) {
                        recentNumbers.add(prize.slice(-2));
                    }
                });
            }
        }
        return recentNumbers;
    }

    /**
     * Xóa cache
     */
    clearCache() {
        this.cache.flushAll();
        console.log('🗑️ BayesianCDM cache cleared');
    }

    /**
     * Lấy thống kê cache
     */
    getCacheStats() {
        return {
            keys: this.cache.keys().length,
            hits: this.cache.getStats().hits,
            misses: this.cache.getStats().misses,
            ksize: this.cache.getStats().ksize,
            vsize: this.cache.getStats().vsize
        };
    }
}

module.exports = BayesianCDMService;
