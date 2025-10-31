/**
 * Soi Cầu Sync Service - Đồng bộ và tránh trùng lặp giữa 3 loại soi cầu
 * - Soi cầu lô (SoiCau model)
 * - Bạch thủ đề (BachThuDeResult)
 * - Soi cầu truyền thống (SoiCauResult)
 */

const SoiCauResult = require('../models/soiCauResult.model');
const BachThuDeResult = require('../models/bachThuDeResult.model');
const SoiCau = require('../models/soicau.model');
const memoryCache = require('../utils/memoryCache');

class SoiCauSyncService {
    constructor() {
        console.log('✅ SoiCauSyncService initialized');
    }

    /**
     * Lấy tất cả số đã được dự đoán từ 3 loại soi cầu trong khoảng thời gian
     * @param {Date} targetDate - Ngày mục tiêu
     * @param {number} days - Số ngày lùi về trước để kiểm tra
     * @returns {Promise<Array<string>>} Mảng các số đã được dự đoán
     */
    async getAllHistoricalPredictions(targetDate, days = 14) {
        try {
            // QUAN TRỌNG: Normalize targetDate về 00:00:00 để đảm bảo deterministic
            const normalizedTargetDate = new Date(targetDate);
            normalizedTargetDate.setHours(0, 0, 0, 0);
            
            // PERFORMANCE: Cache historical predictions để tránh query lặp lại
            const historicalCacheKey = `historical:predictions:${normalizedTargetDate.toISOString()}:${days}`;
            const cachedHistorical = memoryCache.get(historicalCacheKey);
            
            if (cachedHistorical) {
                console.log(`✅ Historical predictions cache HIT for ${historicalCacheKey}`);
                return cachedHistorical;
            }
            
            console.log(`⚠️ Historical predictions cache MISS for ${historicalCacheKey}, querying database...`);
            
            // QUAN TRỌNG: Chỉ lấy predictions TRƯỚC targetDate (không bao gồm chính targetDate)
            // Điều này tránh việc include chính record đang được tạo/update
            const startDate = new Date(normalizedTargetDate);
            startDate.setDate(startDate.getDate() - days);
            startDate.setHours(0, 0, 0, 0);

            const endDate = new Date(normalizedTargetDate);
            endDate.setDate(endDate.getDate() - 1); // Trừ đi 1 ngày để không bao gồm targetDate
            endDate.setHours(23, 59, 59, 999);

            // Lấy tất cả predictions từ 3 loại soi cầu song song
            // QUAN TRỌNG: Thêm _id vào sort để đảm bảo thứ tự deterministic khi có nhiều records cùng predictionDate
            const [soiCauTradResults, bachThuDeResults, soiCauLoResults] = await Promise.all([
                // Soi cầu truyền thống (SoiCauResult)
                SoiCauResult.find({
                    predictionDate: { $gte: startDate, $lt: endDate }
                })
                    .select('predictionDate predictions combinedPrediction additionalSuggestions')
                    .sort({ predictionDate: -1, _id: -1 }) // Thêm _id để deterministic
                    .limit(14)
                    .lean(),

                // Bạch thủ đề (BachThuDeResult)
                BachThuDeResult.find({
                    predictionDate: { $gte: startDate, $lt: endDate }
                })
                    .select('predictionDate predictions combinedPrediction')
                    .sort({ predictionDate: -1, _id: -1 }) // Thêm _id để deterministic
                    .limit(14)
                    .lean(),

                // Soi cầu lô (SoiCau)
                SoiCau.find({
                    predictionDate: { $gte: startDate, $lt: endDate }
                })
                    .select('predictionDate predictions.ensemble predictions.cdm.de predictions.efdm.de predictions.collaborativeFiltering')
                    .sort({ predictionDate: -1, _id: -1 }) // Thêm _id để deterministic
                    .limit(14)
                    .lean()
            ]);

            console.log(`📊 Found historical predictions:`);
            console.log(`  - Soi cầu truyền thống: ${soiCauTradResults.length} records`);
            console.log(`  - Bạch thủ đề: ${bachThuDeResults.length} records`);
            console.log(`  - Soi cầu lô: ${soiCauLoResults.length} records`);

            // Kết hợp tất cả số đã được dự đoán
            const allPredictedNumbers = new Set();

            // 1. Từ SoiCauResult (soi cầu truyền thống)
            soiCauTradResults.forEach(result => {
                if (result.predictions && Array.isArray(result.predictions)) {
                    result.predictions.forEach(p => {
                        if (p.number && p.number !== 'N/A' && p.number !== '') {
                            allPredictedNumbers.add(p.number.toString().padStart(2, '0'));
                        }
                    });
                }
                if (result.combinedPrediction && result.combinedPrediction !== 'N/A' && result.combinedPrediction !== '') {
                    allPredictedNumbers.add(result.combinedPrediction.toString().padStart(2, '0'));
                }
                if (result.additionalSuggestions && Array.isArray(result.additionalSuggestions)) {
                    result.additionalSuggestions.forEach(s => {
                        if (s && s !== 'N/A' && s !== '') {
                            allPredictedNumbers.add(s.toString().padStart(2, '0'));
                        }
                    });
                }
            });

            // 2. Từ BachThuDeResult (bạch thủ đề)
            bachThuDeResults.forEach(result => {
                if (result.predictions && Array.isArray(result.predictions)) {
                    result.predictions.forEach(p => {
                        // Bạch thủ đề có thể có numbers (array) hoặc number (string)
                        if (p.numbers && Array.isArray(p.numbers)) {
                            p.numbers.forEach(n => {
                                if (n && n !== 'N/A' && n !== '') {
                                    allPredictedNumbers.add(n.toString().padStart(2, '0'));
                                }
                            });
                        }
                        if (p.number && p.number !== 'N/A' && p.number !== '') {
                            allPredictedNumbers.add(p.number.toString().padStart(2, '0'));
                        }
                    });
                }
                if (result.combinedPrediction && result.combinedPrediction !== 'N/A' && result.combinedPrediction !== '') {
                    allPredictedNumbers.add(result.combinedPrediction.toString().padStart(2, '0'));
                }
            });

            // 3. Từ SoiCau (soi cầu lô)
            soiCauLoResults.forEach(result => {
                // Ensemble predictions (top predictions)
                if (result.predictions?.ensemble && Array.isArray(result.predictions.ensemble)) {
                    result.predictions.ensemble.slice(0, 10).forEach(p => {
                        if (p.number && p.number !== 'N/A' && p.number !== '') {
                            allPredictedNumbers.add(p.number.toString().padStart(2, '0'));
                        }
                    });
                }
                // CDM De predictions
                if (result.predictions?.cdm?.de && Array.isArray(result.predictions.cdm.de)) {
                    result.predictions.cdm.de.slice(0, 5).forEach(p => {
                        if (p.number && p.number !== 'N/A' && p.number !== '') {
                            allPredictedNumbers.add(p.number.toString().padStart(2, '0'));
                        }
                    });
                }
                // EFDM De predictions
                if (result.predictions?.efdm?.de && Array.isArray(result.predictions.efdm.de)) {
                    result.predictions.efdm.de.slice(0, 5).forEach(p => {
                        if (p.number && p.number !== 'N/A' && p.number !== '') {
                            allPredictedNumbers.add(p.number.toString().padStart(2, '0'));
                        }
                    });
                }
                // Collaborative Filtering
                if (result.predictions?.collaborativeFiltering && Array.isArray(result.predictions.collaborativeFiltering)) {
                    result.predictions.collaborativeFiltering.slice(0, 5).forEach(p => {
                        if (p.number && p.number !== 'N/A' && p.number !== '') {
                            allPredictedNumbers.add(p.number.toString().padStart(2, '0'));
                        }
                    });
                }
            });

            // QUAN TRỌNG: Convert Set sang Array và sort để đảm bảo thứ tự deterministic
            // Set iteration order không đảm bảo deterministic trong một số trường hợp
            const historicalNumbers = Array.from(allPredictedNumbers).sort();
            console.log(`✅ Collected ${historicalNumbers.length} unique historical predictions from ${days} days`);

            // PERFORMANCE: Cache kết quả (30 phút - historical data không thay đổi thường xuyên)
            memoryCache.set(historicalCacheKey, historicalNumbers, 1800);
            console.log(`✅ Cached historical predictions for ${historicalCacheKey} (TTL: 1800s)`);

            return historicalNumbers;
        } catch (error) {
            console.error('❌ Error getting all historical predictions:', error);
            return [];
        }
    }

    /**
     * Lọc bỏ các số đã được dự đoán trong khoảng thời gian gần đây
     * @param {Array<string>} candidateNumbers - Danh sách số ứng viên
     * @param {Date} targetDate - Ngày mục tiêu
     * @param {number} avoidDays - Số ngày lùi về trước để tránh trùng lặp (mặc định 7 ngày)
     * @param {number} strictMode - Chế độ strict: true = loại bỏ hoàn toàn, false = ưu tiên nhưng không loại bỏ hoàn toàn
     * @returns {Promise<Array<string>>} Danh sách số đã được lọc
     */
    async avoidDuplicates(candidateNumbers, targetDate, avoidDays = 7, strictMode = true) {
        try {
            if (!candidateNumbers || candidateNumbers.length === 0) {
                return candidateNumbers;
            }

            // Lấy historical predictions
            const historicalNumbers = await this.getAllHistoricalPredictions(targetDate, avoidDays);

            if (historicalNumbers.length === 0) {
                console.log('⚠️ No historical predictions found, returning original candidates');
                return candidateNumbers;
            }

            // Lọc bỏ các số đã được dự đoán
            const filtered = candidateNumbers.filter(num => {
                const normalizedNum = num.toString().padStart(2, '0');
                return !historicalNumbers.includes(normalizedNum);
            });

            console.log(`🔍 Filtered ${candidateNumbers.length} candidates, removed ${candidateNumbers.length - filtered.length} duplicates`);

            // Nếu strict mode và sau khi lọc còn quá ít, cảnh báo
            if (strictMode && filtered.length < candidateNumbers.length * 0.3) {
                console.warn(`⚠️ After filtering, only ${filtered.length}/${candidateNumbers.length} candidates remain. Consider relaxing filter or increasing avoidDays.`);
            }

            // Trả về kết quả đã lọc (nếu còn số) hoặc kết quả gốc nếu không còn số nào
            return filtered.length > 0 ? filtered : candidateNumbers;
        } catch (error) {
            console.error('❌ Error avoiding duplicates:', error);
            // Trả về kết quả gốc nếu có lỗi
            return candidateNumbers;
        }
    }

    /**
     * Tạo seed độc nhất dựa trên nhiều yếu tố
     * @param {Date} targetDate - Ngày mục tiêu
     * @param {Array} historicalData - Dữ liệu lịch sử
     * @returns {number} Seed từ 0-99
     */
    generateUniqueSeed(targetDate, historicalData) {
        try {
            // QUAN TRỌNG: Normalize targetDate về 00:00:00 để đảm bảo deterministic
            // Cùng một ngày sẽ luôn cho cùng một seed, không phụ thuộc vào giờ gọi
            const normalizedDate = new Date(targetDate);
            normalizedDate.setHours(0, 0, 0, 0);
            
            // Yếu tố 1: Ngày trong năm
            const dayOfYear = Math.floor((normalizedDate - new Date(normalizedDate.getFullYear(), 0, 0)) / (1000 * 60 * 60 * 24));

            // Yếu tố 2: Thông tin từ dữ liệu lịch sử
            const latestSpecialPrize = historicalData[0]?.specialPrize?.[0]?.slice(-2) || '00';
            const latestFirstPrize = historicalData[0]?.firstPrize?.[0]?.slice(-2) || '00';
            const secondSpecialPrize = historicalData[1]?.specialPrize?.[0]?.slice(-2) || '00';
            const secondFirstPrize = historicalData[1]?.firstPrize?.[0]?.slice(-2) || '00';

            // Yếu tố 3: Ngày trong tuần và tháng
            const dayOfWeek = normalizedDate.getDay(); // 0-6
            const dayOfMonth = normalizedDate.getDate(); // 1-31
            const month = normalizedDate.getMonth() + 1; // 1-12
            const weekOfMonth = Math.floor((normalizedDate.getDate() - 1) / 7) + 1; // 1-5

            // Yếu tố 4: Hash từ tất cả yếu tố
            const combined = `${dayOfYear}-${latestSpecialPrize}-${latestFirstPrize}-${secondSpecialPrize}-${secondFirstPrize}-${dayOfWeek}-${dayOfMonth}-${month}-${weekOfMonth}`;
            
            let hash = 0;
            for (let i = 0; i < combined.length; i++) {
                const char = combined.charCodeAt(i);
                hash = ((hash << 5) - hash) + char;
                hash = hash & hash; // Convert to 32bit integer
            }

            // BỎ YẾU TỐ HOUR - Không dùng hour để đảm bảo deterministic
            // Seed chỉ dựa trên ngày và dữ liệu lịch sử
            const finalSeed = Math.abs(hash) % 100;

            return finalSeed;
        } catch (error) {
            console.error('❌ Error generating unique seed:', error);
            // Fallback to simple day of year
            const normalizedDate = new Date(targetDate);
            normalizedDate.setHours(0, 0, 0, 0);
            return normalizedDate.getDate() % 100;
        }
    }

    /**
     * Chọn số từ danh sách candidates với seed độc nhất
     * @param {Array<string>} candidates - Danh sách ứng viên
     * @param {Date} targetDate - Ngày mục tiêu
     * @param {Array} historicalData - Dữ liệu lịch sử
     * @returns {string} Số được chọn
     */
    selectFromCandidates(candidates, targetDate, historicalData) {
        if (!candidates || candidates.length === 0) {
            return '';
        }

        const seed = this.generateUniqueSeed(targetDate, historicalData);
        const index = seed % candidates.length;
        return candidates[index];
    }
}

module.exports = new SoiCauSyncService();

