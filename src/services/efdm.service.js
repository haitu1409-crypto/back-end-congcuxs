/**
 * EFDM Service - Extended Flexible Dirichlet-Multinomial
 * Phiên bản nâng cấp của CDM với xử lý over-dispersion
 */

const NodeCache = require('node-cache');
const XSMB = require('../models/xsmb.model');

class EFDMService {
    constructor() {
        this.alpha = 1; // Laplace smoothing parameter
        this.beta = null; // Flexibility parameter
        this.cache = new NodeCache({
            stdTTL: 3600, // Cache 1 giờ
            checkperiod: 300, // Check expired keys mỗi 5 phút
            useClones: false // Tối ưu memory
        });

        console.log('✅ EFDMService initialized');
    }

    /**
     * Tính toán xác suất EFDM cho đề (2 số cuối giải đặc biệt)
     * @param {Date} date - Ngày dự đoán
     * @param {number} days - Số ngày dữ liệu lịch sử
     * @returns {Object} Xác suất cho từng số
     */
    async calculateDeProbabilities(date, days = 100) {
        // Cache key bao gồm offset để đảm bảo mỗi ngày có cache riêng
        const dayOffset = date.getDate() % 7;
        const cacheKey = `efdm:de:${date.toISOString().split('T')[0]}:${days}:${dayOffset}`;

        // Kiểm tra cache
        const cached = this.cache.get(cacheKey);
        if (cached) {
            console.log(`📋 Cache hit for EFDM DE: ${cacheKey}`);
            return cached;
        }

        console.log(`🔄 Calculating EFDM DE probabilities for ${days} days...`);

        // Lấy dữ liệu lịch sử
        const historicalData = await this.getHistoricalData(date, days);

        if (historicalData.length === 0) {
            throw new Error(`Không tìm thấy dữ liệu lịch sử cho ${days} ngày`);
        }

        // Tính toán xác suất
        const probabilities = this.computeDeProbabilities(historicalData);

        // Cache kết quả
        this.cache.set(cacheKey, probabilities);

        console.log(`✅ EFDM DE probabilities calculated and cached`);
        return probabilities;
    }

    /**
     * Tính toán xác suất EFDM cho lô (2 số cuối tất cả giải)
     * @param {Date} date - Ngày dự đoán
     * @param {number} days - Số ngày dữ liệu lịch sử
     * @returns {Object} Xác suất cho từng số
     */
    async calculateLoProbabilities(date, days = 100) {
        // Cache key bao gồm offset để đảm bảo mỗi ngày có cache riêng
        const dayOffset = date.getDate() % 7;
        const cacheKey = `efdm:lo:${date.toISOString().split('T')[0]}:${days}:${dayOffset}`;

        // Kiểm tra cache
        const cached = this.cache.get(cacheKey);
        if (cached) {
            console.log(`📋 Cache hit for EFDM LO: ${cacheKey}`);
            return cached;
        }

        console.log(`🔄 Calculating EFDM LO probabilities for ${days} days...`);

        // Lấy dữ liệu lịch sử
        const historicalData = await this.getHistoricalData(date, days);

        if (historicalData.length === 0) {
            throw new Error(`Không tìm thấy dữ liệu lịch sử cho ${days} ngày`);
        }

        // Tính toán xác suất
        const probabilities = this.computeLoProbabilities(historicalData);

        // Cache kết quả
        this.cache.set(cacheKey, probabilities);

        console.log(`✅ EFDM LO probabilities calculated and cached`);
        return probabilities;
    }

    /**
     * Lấy dữ liệu lịch sử từ database
     * @param {Date} date - Ngày dự đoán
     * @param {number} days - Số ngày dữ liệu
     * @returns {Array} Dữ liệu lịch sử
     */
    async getHistoricalData(date, days) {
        const dayOfMonth = date.getDate(); // Tạo variation như Bayesian CDM
        const dayOffset = dayOfMonth % 7; // 0-6 days offset
        const adjustedDays = days - dayOffset;

        const endDate = new Date(date);
        endDate.setDate(endDate.getDate() - 1 - dayOffset); // Offset endDate
        endDate.setHours(23, 59, 59, 999);

        const startDate = new Date(endDate);
        startDate.setDate(startDate.getDate() - adjustedDays + 1);
        startDate.setHours(0, 0, 0, 0);

        console.log(`📊 EFDM: [VARIATION ${dayOfMonth}] Using ${adjustedDays} days for date ${date.toISOString().split('T')[0]}, offset: ${dayOffset}, range: ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]}`);

        const data = await XSMB.find({
            drawDate: { $gte: startDate, $lte: endDate },
            station: 'xsmb'
        })
            .select('drawDate specialPrize firstPrize secondPrize threePrizes fourPrizes fivePrizes sixPrizes sevenPrizes')
            .sort({ drawDate: -1 })
            .lean();

        console.log(`📈 EFDM: Found ${data.length} complete records`);
        return data;
    }

    /**
     * Tính xác suất EFDM cho đề (2 số cuối giải đặc biệt)
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

        // Tính beta từ variance
        this.beta = this.calculateBeta(counts);

        const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
        const K = 100; // Số lượng số từ 00-99
        const probabilities = {};

        // Tính xác suất EFDM với beta
        for (let i = 0; i < 100; i++) {
            const num = i.toString().padStart(2, '0');
            const count = counts[num] || 0;
            // EFDM formula: p_j = (count_j + alpha + beta) / (total + K*alpha + beta*K)
            probabilities[num] = (count + this.alpha + this.beta) / (total + K * this.alpha + this.beta * K);
        }

        // Thêm metadata
        probabilities._metadata = {
            totalCount: total,
            alpha: this.alpha,
            beta: this.beta,
            dataPoints: historicalData.length,
            formula: 'p_j = (count_j + alpha + beta) / (total + K*alpha + beta*K)',
            improvement: 'EFDM handles over-dispersion and burstiness'
        };

        // Penalty
        const recent = this.getRecentNumbers(historicalData);
        for (let num in probabilities) {
            if (recent.has(num)) probabilities[num] *= 0.8;
        }

        return probabilities;
    }

    /**
     * Tính xác suất EFDM cho lô (2 số cuối tất cả giải)
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

        // Tính beta từ variance
        this.beta = this.calculateBeta(counts);

        const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
        const K = 100; // Số lượng số từ 00-99
        const probabilities = {};

        // Tính xác suất EFDM với beta
        for (let i = 0; i < 100; i++) {
            const num = i.toString().padStart(2, '0');
            const count = counts[num] || 0;
            // EFDM formula: p_j = (count_j + alpha + beta) / (total + K*alpha + beta*K)
            probabilities[num] = (count + this.alpha + this.beta) / (total + K * this.alpha + this.beta * K);
        }

        // Thêm metadata
        probabilities._metadata = {
            totalCount: total,
            alpha: this.alpha,
            beta: this.beta,
            dataPoints: historicalData.length,
            formula: 'p_j = (count_j + alpha + beta) / (total + K*alpha + beta*K)',
            improvement: 'EFDM handles over-dispersion and burstiness'
        };

        // Penalty
        const recent = this.getRecentNumbers(historicalData);
        for (let num in probabilities) {
            if (recent.has(num)) probabilities[num] *= 0.8;
        }

        return probabilities;
    }

    /**
     * Tính beta parameter từ variance của dữ liệu
     * @param {Object} counts - Tần suất xuất hiện
     * @returns {number} Beta parameter
     */
    calculateBeta(counts) {
        const values = Object.values(counts);

        if (values.length === 0) {
            return 1; // Default value
        }

        const mean = values.reduce((sum, count) => sum + count, 0) / values.length;
        const variance = values.reduce((sum, count) => sum + Math.pow(count - mean, 2), 0) / values.length;

        // Beta = mean^2 / variance (để xử lý over-dispersion)
        const beta = variance > 0 ? (mean * mean) / variance : 1;

        console.log(`📊 EFDM Beta calculation: mean=${mean.toFixed(2)}, variance=${variance.toFixed(2)}, beta=${beta.toFixed(2)}`);

        return Math.max(0.1, Math.min(10, beta)); // Clamp beta between 0.1 and 10
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
     * So sánh với CDM cơ bản
     * @param {Object} efdmProbs - Xác suất EFDM
     * @param {Object} cdmProbs - Xác suất CDM
     * @returns {Object} So sánh
     */
    compareWithCDM(efdmProbs, cdmProbs) {
        const comparison = {};

        for (let i = 0; i < 100; i++) {
            const num = i.toString().padStart(2, '0');
            const efdmProb = efdmProbs[num];
            const cdmProb = cdmProbs[num];

            comparison[num] = {
                efdm: efdmProb,
                cdm: cdmProb,
                difference: efdmProb - cdmProb,
                improvement: efdmProb > cdmProb ? ((efdmProb - cdmProb) / cdmProb * 100).toFixed(2) + '%' : '0%'
            };
        }

        return comparison;
    }

    /**
     * Xóa cache
     */
    clearCache() {
        this.cache.flushAll();
        console.log('🗑️ EFDM cache cleared');
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

    // Thêm helpers tương tự CDM trước computeDeProbabilities
    getRecentNumbers(historicalData, days = 3) {
        const recent = new Set();
        historicalData.slice(0, days).forEach(result => {
            if (result.specialPrize && result.specialPrize.length > 0) {
                recent.add(result.specialPrize[0].slice(-2));
            }
            // Adjust cho lo nếu cần
        });
        return recent;
    }

    adjustCountsWithDecay(counts, historicalData, targetDate, decay = 0.95) {
        const adjusted = { ...counts };
        historicalData.forEach((result, index) => {
            const daysAgo = Math.floor((targetDate - result.drawDate) / (1000 * 60 * 60 * 24));
            const weight = Math.pow(decay, daysAgo);
            // Adjust counts với weight
        });
        return adjusted;
    }
}

module.exports = EFDMService;
