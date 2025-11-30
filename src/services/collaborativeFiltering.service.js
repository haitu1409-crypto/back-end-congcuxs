/**
 * Collaborative Filtering Service
 * Sử dụng user-item matrix để tìm similarity patterns
 */

const NodeCache = require('node-cache');
const XSMB = require('../models/xsmb.model');

class CollaborativeFilteringService {
    constructor() {
        this.cache = new NodeCache({
            stdTTL: 7200, // Cache 2 giờ
            checkperiod: 300, // Check expired keys mỗi 5 phút
            useClones: false // Tối ưu memory
        });

        this.userItemMatrix = null;
        this.similarities = null;

        // Service initialized silently
    }

    /**
     * Xây dựng user-item matrix
     * Mỗi kỳ quay là một "user", mỗi số là một "item"
     * @param {Array} historicalData - Dữ liệu lịch sử
     * @param {string} type - 'de' hoặc 'lo'
     */
    buildUserItemMatrix(historicalData, type = 'lo') {
        console.log(`🔄 Building user-item matrix for ${historicalData.length} periods (${type})...`);

        this.userItemMatrix = historicalData.map(result => {
            const numbers = this.extractNumbers(result, type);
            const vector = new Array(100).fill(0);

            numbers.forEach(num => {
                vector[parseInt(num)] = 1;
            });

            return vector;
        });

        console.log(`✅ User-item matrix built: ${this.userItemMatrix.length} x ${this.userItemMatrix[0].length}`);
    }

    /**
     * Trích xuất số từ kết quả xổ số
     * @param {Object} result - Kết quả xổ số
     * @param {string} type - 'de' hoặc 'lo'
     * @returns {Array} Mảng số 2 chữ số
     */
    extractNumbers(result, type = 'lo') {
        if (type === 'de') {
            // Chỉ lấy Đề (2 số cuối giải đặc biệt)
            if (result.specialPrize && result.specialPrize.length > 0) {
                const de = result.specialPrize[0].slice(-2);
                return /^\d{2}$/.test(de) ? [de] : [];
            }
            return [];
        } else {
            // Lấy Lô (2 số cuối tất cả giải)
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

    /**
     * Tính cosine similarity giữa các kỳ quay
     */
    calculateSimilarities() {
        if (!this.userItemMatrix) {
            throw new Error('User-item matrix chưa được xây dựng');
        }

        console.log('🔄 Calculating cosine similarities...');

        const n = this.userItemMatrix.length;
        this.similarities = [];

        for (let i = 0; i < n; i++) {
            this.similarities[i] = [];
            for (let j = 0; j < n; j++) {
                if (i === j) {
                    this.similarities[i][j] = 1;
                } else {
                    this.similarities[i][j] = this.cosineSimilarity(
                        this.userItemMatrix[i],
                        this.userItemMatrix[j]
                    );
                }
            }
        }

        console.log(`✅ Similarities calculated: ${n} x ${n} matrix`);
    }

    /**
     * Tính cosine similarity giữa hai vector
     * @param {Array} vectorA - Vector A
     * @param {Array} vectorB - Vector B
     * @returns {number} Cosine similarity
     */
    cosineSimilarity(vectorA, vectorB) {
        let dotProduct = 0;
        let normA = 0;
        let normB = 0;

        for (let i = 0; i < vectorA.length; i++) {
            dotProduct += vectorA[i] * vectorB[i];
            normA += vectorA[i] * vectorA[i];
            normB += vectorB[i] * vectorB[i];
        }

        if (normA === 0 || normB === 0) {
            return 0;
        }

        return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
    }

    /**
     * Lấy top K kỳ quay tương tự nhất
     * @param {number} targetPeriod - Kỳ quay mục tiêu
     * @param {number} topK - Số lượng kỳ tương tự
     * @returns {Array} Top K kỳ tương tự
     */
    getTopSimilarPeriods(targetPeriod, topK = 5) {
        if (!this.similarities) {
            throw new Error('Similarities chưa được tính toán');
        }

        const similarities = this.similarities[targetPeriod];
        const indexedSimilarities = similarities.map((sim, index) => ({ index, similarity: sim }));

        // Sắp xếp theo similarity giảm dần, loại bỏ chính nó
        const sorted = indexedSimilarities
            .filter(item => item.index !== targetPeriod)
            .sort((a, b) => b.similarity - a.similarity)
            .slice(0, topK);

        return sorted;
    }

    /**
     * Tính dự đoán dựa trên collaborative filtering
     * @param {number} targetPeriod - Kỳ quay mục tiêu
     * @param {number} topK - Số lượng kỳ tương tự
     * @returns {Object} Dự đoán
     */
    calculatePredictions(targetPeriod, topK = 5) {
        if (!this.userItemMatrix || !this.similarities) {
            throw new Error('Model chưa được khởi tạo');
        }

        const similarPeriods = this.getTopSimilarPeriods(targetPeriod, topK);
        const predictions = new Array(100).fill(0);
        let totalWeight = 0;

        // Tính weighted average
        similarPeriods.forEach(({ index, similarity }) => {
            const weight = Math.max(0, similarity); // Chỉ lấy similarity dương
            totalWeight += weight;

            for (let i = 0; i < 100; i++) {
                predictions[i] += weight * this.userItemMatrix[index][i];
            }
        });

        // Normalize
        if (totalWeight > 0) {
            for (let i = 0; i < 100; i++) {
                predictions[i] /= totalWeight;
            }
        }

        return predictions;
    }

    /**
     * Dự đoán cho ngày cụ thể
     * @param {Date} date - Ngày dự đoán
     * @param {number} days - Số ngày dữ liệu lịch sử
     * @param {number} topK - Số lượng kỳ tương tự
     * @returns {Object} Dự đoán
     */
    async predict(date, days = 100, type = 'lo', topK = 5) {
        // Cache key bao gồm offset để đảm bảo mỗi ngày có cache riêng
        const dayOffset = date.getDate() % 7;
        const cacheKey = `cf:predict:${date.toISOString().split('T')[0]}:${days}:${type}:${topK}:${dayOffset}`;

        // Kiểm tra cache
        const cached = this.cache.get(cacheKey);
        if (cached) {
            console.log(`📋 Cache hit for CF: ${cacheKey}`);
            return cached;
        }

        console.log(`🔄 CF: Predicting for ${date.toISOString().split('T')[0]} with ${days} days data...`);

        // Lấy dữ liệu lịch sử
        const historicalData = await this.getHistoricalData(date, days);

        if (historicalData.length < 2) {
            throw new Error(`Không đủ dữ liệu lịch sử cho collaborative filtering (cần ít nhất 2 kỳ)`);
        }

        // Xây dựng model
        this.buildUserItemMatrix(historicalData, type);
        this.calculateSimilarities();

        // Dự đoán cho kỳ tiếp theo (index = 0 là kỳ gần nhất)
        const predictions = this.calculatePredictions(0, topK);

        // Chuyển đổi thành object với key là số
        const result = {};
        for (let i = 0; i < 100; i++) {
            const num = i.toString().padStart(2, '0');
            result[num] = predictions[i];
        }

        // Thêm metadata
        result._metadata = {
            dataPoints: historicalData.length,
            topK: topK,
            method: 'Collaborative Filtering',
            formula: 'Weighted average based on cosine similarity'
        };

        // Cache kết quả
        this.cache.set(cacheKey, result);

        console.log(`✅ CF: Prediction completed and cached`);
        return result;
    }

    /**
     * Lấy dữ liệu lịch sử từ database
     * @param {Date} date - Ngày dự đoán
     * @param {number} days - Số ngày dữ liệu
     * @returns {Array} Dữ liệu lịch sử
     */
    async getHistoricalData(date, days) {
        // Sử dụng ngày dự đoán làm điểm tham chiếu để tạo sự khác biệt
        const endDate = new Date(date);
        endDate.setDate(endDate.getDate() - 1); // Không bao gồm ngày dự đoán
        endDate.setHours(23, 59, 59, 999);

        const startDate = new Date(endDate);
        startDate.setDate(startDate.getDate() - days + 1);
        startDate.setHours(0, 0, 0, 0);

        // Thêm một yếu tố ngẫu nhiên nhỏ dựa trên ngày để tạo sự khác biệt
        const dayOffset = date.getDate() % 7; // 0-6 dựa trên ngày trong tháng
        startDate.setDate(startDate.getDate() - dayOffset);
        endDate.setDate(endDate.getDate() - dayOffset);

        console.log(`📊 CF: Fetching data from ${startDate.toISOString().split('T')[0]} to ${endDate.toISOString().split('T')[0]} for prediction date ${date.toISOString().split('T')[0]} (offset: ${dayOffset})`);

        const data = await XSMB.find({
            drawDate: { $gte: startDate, $lte: endDate },
            station: 'xsmb'
        })
            .select('drawDate specialPrize firstPrize secondPrize threePrizes fourPrizes fivePrizes sixPrizes sevenPrizes')
            .sort({ drawDate: -1 })
            .lean();

        console.log(`📈 CF: Found ${data.length} complete records`);
        return data;
    }

    /**
     * Lấy top N số có xác suất cao nhất
     * @param {Object} predictions - Dự đoán
     * @param {number} topN - Số lượng top
     * @returns {Array} Top N số
     */
    getTopPredictions(predictions, topN = 20) {
        const sorted = Object.entries(predictions)
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
     * Phân tích similarity patterns
     * @param {number} targetPeriod - Kỳ quay mục tiêu
     * @returns {Object} Phân tích patterns
     */
    analyzeSimilarityPatterns(targetPeriod) {
        if (!this.similarities) {
            throw new Error('Similarities chưa được tính toán');
        }

        const similarities = this.similarities[targetPeriod];
        const avgSimilarity = similarities.reduce((sum, sim) => sum + sim, 0) / similarities.length;
        const maxSimilarity = Math.max(...similarities.filter((_, i) => i !== targetPeriod));
        const minSimilarity = Math.min(...similarities.filter((_, i) => i !== targetPeriod));

        return {
            averageSimilarity: avgSimilarity.toFixed(4),
            maxSimilarity: maxSimilarity.toFixed(4),
            minSimilarity: minSimilarity.toFixed(4),
            highSimilarityCount: similarities.filter(sim => sim > 0.5).length,
            mediumSimilarityCount: similarities.filter(sim => sim > 0.3 && sim <= 0.5).length,
            lowSimilarityCount: similarities.filter(sim => sim <= 0.3).length
        };
    }

    /**
     * Xóa cache
     */
    clearCache() {
        this.cache.flushAll();
        console.log('🗑️ Collaborative Filtering cache cleared');
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

    /**
     * Reset model
     */
    resetModel() {
        this.userItemMatrix = null;
        this.similarities = null;
        console.log('🔄 Collaborative Filtering model reset');
    }
}

module.exports = CollaborativeFilteringService;
