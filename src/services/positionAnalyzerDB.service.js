/**
 * Position Analyzer Service
 * Thuật toán soi cầu dựa trên vị trí số với hiệu suất cao và độ chính xác tuyệt đối
 */

const XSMB = require('../models/xsmb.model');
const DEFAULT_ANALYSIS_CACHE_TTL = parseInt(process.env.POSITION_ANALYZER_CACHE_TTL_MS, 10) || (5 * 60 * 1000);
const DEFAULT_POSITIONS_CACHE_TTL = parseInt(process.env.POSITION_ANALYZER_POSITIONS_CACHE_TTL_MS, 10) || (30 * 60 * 1000);
const MAX_POSITIONS_CACHE_ENTRIES = parseInt(process.env.POSITION_ANALYZER_POSITIONS_CACHE_MAX_ENTRIES, 10) || 2000;

/**
 * Cấu trúc định vị số: (giải, phần_tử, vị_trí)
 * - Giải đặc biệt: (0, 0, 0-4)
 * - Giải nhất: (1, 0, 0-4) 
 * - Giải nhì: (2, 0-1, 0-4)
 * - Giải ba: (3, 0-5, 0-4)
 * - Giải tư: (4, 0-3, 0-4)
 * - Giải năm: (5, 0-5, 0-4)
 * - Giải sáu: (6, 0-2, 0-4)
 * - Giải bảy: (7, 0-3, 0-4)
 */

class PositionAnalyzer {
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
        this.analysisCache = new Map();
        this.cacheTTL = DEFAULT_ANALYSIS_CACHE_TTL;
        this.isVerbose = process.env.POSITION_ANALYZER_VERBOSE === 'true';
        this.positionsCache = new Map();
        this.positionsCacheTTL = DEFAULT_POSITIONS_CACHE_TTL;
        this.positionsCacheMaxEntries = MAX_POSITIONS_CACHE_ENTRIES;
    }

    debugLog(...args) {
        if (this.isVerbose) {
            console.log(...args);
        }
    }

    getCacheEntry(key) {
        const entry = this.analysisCache.get(key);
        if (!entry) {
            return null;
        }

        if (Date.now() > entry.expiresAt) {
            this.analysisCache.delete(key);
            return null;
        }

        return entry.data;
    }

    setCacheEntry(key, data) {
        this.analysisCache.set(key, {
            data,
            expiresAt: Date.now() + this.cacheTTL
        });
    }

    getResultCacheKey(result) {
        if (!result) {
            return 'unknown';
        }
        if (result._id) {
            return String(result._id);
        }
        if (result.drawDate instanceof Date) {
            return result.drawDate.toISOString();
        }
        return JSON.stringify(result.specialPrize || result);
    }

    prunePositionsCache() {
        if (this.positionsCache.size <= this.positionsCacheMaxEntries) {
            return;
        }
        const now = Date.now();

        // Remove expired entries first
        for (const [key, entry] of this.positionsCache.entries()) {
            if (entry.expiresAt <= now) {
                this.positionsCache.delete(key);
            }
        }

        if (this.positionsCache.size <= this.positionsCacheMaxEntries) {
            return;
        }

        // Remove oldest entries to enforce limit
        const excessCount = this.positionsCache.size - this.positionsCacheMaxEntries;
        const keys = Array.from(this.positionsCache.keys());
        for (let i = 0; i < excessCount; i++) {
            this.positionsCache.delete(keys[i]);
        }
    }

    getPositionsFromCache(result, cache = null) {
        const key = this.getResultCacheKey(result);

        if (cache) {
            if (cache.has(key)) {
                return cache.get(key);
            }
            const positions = this.analyzePositions(result);
            cache.set(key, positions);
            return positions;
        }

        const entry = this.positionsCache.get(key);
        if (entry && entry.expiresAt > Date.now()) {
            return entry.positions;
        }

        const positions = this.analyzePositions(result);
        this.positionsCache.set(key, {
            positions,
            expiresAt: Date.now() + this.positionsCacheTTL
        });
        this.prunePositionsCache();
        return positions;
    }

    /**
     * Phân tích vị trí số trong kết quả xổ số
     * @param {Object} result - Kết quả xổ số
     * @returns {Array} Mảng các vị trí số
     */
    analyzePositions(result) {
        const positions = [];

        // Giải đặc biệt
        if (Array.isArray(result.specialPrize) && result.specialPrize[0]) {
            const number = result.specialPrize[0];
            for (let i = 0; i < number.length; i++) {
                positions.push({
                    number: number[i],
                    position: `(0-0-${i})`,
                    prize: 0,
                    element: 0,
                    index: i,
                    fullNumber: number
                });
            }
        }

        // Giải nhất
        if (Array.isArray(result.firstPrize) && result.firstPrize[0]) {
            const number = result.firstPrize[0];
            for (let i = 0; i < number.length; i++) {
                positions.push({
                    number: number[i],
                    position: `(1-0-${i})`,
                    prize: 1,
                    element: 0,
                    index: i,
                    fullNumber: number
                });
            }
        }

        // Giải nhì
        if (Array.isArray(result.secondPrize)) {
            result.secondPrize.forEach((number, elementIndex) => {
                if (number) {
                    for (let i = 0; i < number.length; i++) {
                        positions.push({
                            number: number[i],
                            position: `(2-${elementIndex}-${i})`,
                            prize: 2,
                            element: elementIndex,
                            index: i,
                            fullNumber: number
                        });
                    }
                }
            });
        }

        // Giải ba
        if (Array.isArray(result.threePrizes)) {
            result.threePrizes.forEach((number, elementIndex) => {
                if (number) {
                    for (let i = 0; i < number.length; i++) {
                        positions.push({
                            number: number[i],
                            position: `(3-${elementIndex}-${i})`,
                            prize: 3,
                            element: elementIndex,
                            index: i,
                            fullNumber: number
                        });
                    }
                }
            });
        }

        // Giải tư
        if (Array.isArray(result.fourPrizes)) {
            result.fourPrizes.forEach((number, elementIndex) => {
                if (number) {
                    for (let i = 0; i < number.length; i++) {
                        positions.push({
                            number: number[i],
                            position: `(4-${elementIndex}-${i})`,
                            prize: 4,
                            element: elementIndex,
                            index: i,
                            fullNumber: number
                        });
                    }
                }
            });
        }

        // Giải năm
        if (Array.isArray(result.fivePrizes)) {
            result.fivePrizes.forEach((number, elementIndex) => {
                if (number) {
                    for (let i = 0; i < number.length; i++) {
                        positions.push({
                            number: number[i],
                            position: `(5-${elementIndex}-${i})`,
                            prize: 5,
                            element: elementIndex,
                            index: i,
                            fullNumber: number
                        });
                    }
                }
            });
        }

        // Giải sáu
        if (Array.isArray(result.sixPrizes)) {
            result.sixPrizes.forEach((number, elementIndex) => {
                if (number) {
                    for (let i = 0; i < number.length; i++) {
                        positions.push({
                            number: number[i],
                            position: `(6-${elementIndex}-${i})`,
                            prize: 6,
                            element: elementIndex,
                            index: i,
                            fullNumber: number
                        });
                    }
                }
            });
        }

        // Giải bảy
        if (Array.isArray(result.sevenPrizes)) {
            result.sevenPrizes.forEach((number, elementIndex) => {
                if (number) {
                    for (let i = 0; i < number.length; i++) {
                        positions.push({
                            number: number[i],
                            position: `(7-${elementIndex}-${i})`,
                            prize: 7,
                            element: elementIndex,
                            index: i,
                            fullNumber: number
                        });
                    }
                }
            });
        }

        return positions;
    }

    /**
     * Tìm kiếm pattern vị trí tạo ra 2 số cuối giải đặc biệt
     * @param {Array} results - Mảng kết quả xổ số (sắp xếp từ mới nhất đến cũ nhất)
     * @param {number} targetDays - Số ngày phân tích
     * @returns {Array} Mảng các pattern hợp lệ
     */
    findPositionPatterns(results, targetDays, positionCache = null) {
        const patterns = [];

        if (results.length < 2) return patterns; // Cần ít nhất 2 ngày

        this.debugLog(`🔍 Bắt đầu soi cầu vị trí cho ${targetDays} ngày`);

        // Hỗ trợ 2 hướng: LTR (trái→phải) và RTL (phải→trái)
        const directionModes = ['ltr', 'rtl'];

        directionModes.forEach(directionMode => {
            const directionLabel = directionMode === 'ltr' ? 'trái→phải' : 'phải→trái';
            this.debugLog(`↪️ Đang xét hướng ${directionLabel}`);

            // FIX: Tìm pattern trong biên độ targetDays, không chỉ 2 ngày liên tiếp
            for (let currentIndex = 0; currentIndex < results.length - 1; currentIndex++) {
                const currentResult = results[currentIndex]; // Ngày hiện tại
                const targetNumber = currentResult.specialPrize[0].slice(-2);

                this.debugLog(`📅 Tìm vị trí tạo ra ${targetNumber} trong biên độ ${targetDays} ngày (hướng ${directionLabel})`);

                // Tìm trong tất cả các ngày trước đó trong biên độ
                for (let previousIndex = currentIndex + 1; previousIndex < Math.min(currentIndex + targetDays + 1, results.length); previousIndex++) {
                    const previousResult = results[previousIndex]; // Ngày trước trong biên độ

                    if (!previousResult || !currentResult) continue;
                    if (!Array.isArray(previousResult.specialPrize) || !previousResult.specialPrize[0]) continue;
                    if (!Array.isArray(currentResult.specialPrize) || !currentResult.specialPrize[0]) continue;

                    const biendDo = previousIndex - currentIndex; // Tính biên độ thực tế
                    this.debugLog(`  🔍 Kiểm tra ngày ${previousIndex} (biên độ ${biendDo} ngày, hướng ${directionLabel})`);

                    const previousPositions = this.getPositionsFromCache(previousResult, positionCache);

                    // Tìm tất cả cặp vị trí có thể tạo ra số mục tiêu theo hướng được chỉ định
                    const validPairs = this.findValidPositionPairs(previousPositions, targetNumber, {
                        directionMode
                    });

                    // Thêm tìm kiếm pattern đơn lẻ (không cần cặp) - chỉ lấy theo hướng được chỉ định
                    const allSinglePatterns = this.findSinglePositionPatterns(previousPositions, targetNumber, {
                        includeReverse: true
                    });
                    // Lọc chỉ lấy singlePatterns có direction khớp với directionMode
                    const singlePatterns = allSinglePatterns.filter(single => {
                        if (single.type === 'consecutive') {
                            return single.direction === directionMode;
                        }
                        // single_digit không có direction, giữ lại
                        return true;
                    });

                    if (validPairs.length > 0 || singlePatterns.length > 0) {
                        this.debugLog(`  ✅ Tìm thấy ${validPairs.length} cặp vị trí và ${singlePatterns.length} vị trí đơn lẻ (biên độ ${biendDo} ngày, hướng ${directionLabel})`);
                        patterns.push({
                            dayIndex: currentIndex,
                            previousIndex: previousIndex,
                            targetNumber: targetNumber,
                            validPairs,
                            singlePatterns,
                            date: previousResult.drawDate,
                            nextDate: currentResult.drawDate,
                            biendDo: biendDo, // Biên độ thực tế
                            direction: directionMode // Lưu hướng
                        });
                    }
                }
            }
        });

        return patterns;
    }

    /**
     * Tìm các cặp vị trí hợp lệ tạo ra số mục tiêu
     * @param {Array} positions - Mảng vị trí số
     * @param {string} targetNumber - Số mục tiêu (2 chữ số)
     * @param {Object} options - Tùy chọn (directionMode: 'both', 'ltr', 'rtl')
     * @returns {Array} Mảng các cặp vị trí hợp lệ
     */
    findValidPositionPairs(positions, targetNumber, options = {}) {
        const validPairs = [];
        const directionMode = options.directionMode || 'both';
        const explicitForward = typeof options.includeForward === 'boolean' ? options.includeForward : null;
        const explicitReverse = typeof options.includeReverse === 'boolean' ? options.includeReverse : null;
        const includeForward = explicitForward !== null
            ? explicitForward
            : directionMode === 'both' || directionMode === 'ltr';
        const includeReverse = explicitReverse !== null
            ? explicitReverse
            : directionMode === 'both' || directionMode === 'rtl';

        for (let i = 0; i < positions.length; i++) {
            for (let j = i + 1; j < positions.length; j++) {
                const pos1 = positions[i];
                const pos2 = positions[j];

                // Tạo số từ 2 vị trí theo hướng LTR (trái→phải)
                // LTR: ghép pos2 + pos1 (số bên phải trước, bên trái sau) - giống positionAnalyzerLoto
                if (includeForward) {
                    const ltrNumber = pos2.number + pos1.number;
                    if (ltrNumber === targetNumber) {
                        validPairs.push({
                            position1: pos1,
                            position2: pos2,
                            combinedNumber: ltrNumber,
                            targetNumber,
                            direction: 'ltr'
                        });
                    }
                }

                // Tạo số từ 2 vị trí theo hướng RTL (phải→trái)
                // RTL: ghép pos1 + pos2 (số bên trái trước, bên phải sau) - giống positionAnalyzerLoto
                if (includeReverse) {
                    const rtlNumber = pos1.number + pos2.number;
                    if (rtlNumber === targetNumber) {
                        validPairs.push({
                            position1: pos1,
                            position2: pos2,
                            combinedNumber: rtlNumber,
                            targetNumber,
                            direction: 'rtl'
                        });
                    }
                }
            }
        }

        return validPairs;
    }

    /**
     * Tìm pattern vị trí đơn lẻ (không cần cặp)
     * @param {Array} positions - Mảng vị trí số
     * @param {string} targetNumber - Số mục tiêu (2 chữ số)
     * @param {Object} options - Tùy chọn (includeReverse: boolean)
     * @returns {Array} Mảng các vị trí đơn lẻ hợp lệ
     */
    findSinglePositionPatterns(positions, targetNumber, options = {}) {
        const singlePatterns = [];
        const includeReverse = options.includeReverse !== false;

        // Tìm vị trí có 2 chữ số liên tiếp tạo ra số mục tiêu
        for (let i = 0; i < positions.length - 1; i++) {
            const pos1 = positions[i];
            const pos2 = positions[i + 1];

            // Kiểm tra nếu 2 vị trí liên tiếp tạo ra số mục tiêu
            if (pos1.prize === pos2.prize && pos1.element === pos2.element &&
                pos2.index === pos1.index + 1) {
                // Hướng LTR (trái→phải): ghép pos2 + pos1 (số bên phải trước, bên trái sau)
                const ltrNumber = pos2.number + pos1.number;
                if (ltrNumber === targetNumber) {
                    singlePatterns.push({
                        position1: pos1,
                        position2: pos2,
                        combinedNumber: ltrNumber,
                        targetNumber,
                        type: 'consecutive',
                        direction: 'ltr'
                    });
                }

                // Hướng RTL (phải→trái): ghép pos1 + pos2 (số bên trái trước, bên phải sau)
                if (includeReverse) {
                    const rtlNumber = pos1.number + pos2.number;
                    if (rtlNumber === targetNumber) {
                        singlePatterns.push({
                            position1: pos1,
                            position2: pos2,
                            combinedNumber: rtlNumber,
                            targetNumber,
                            type: 'consecutive',
                            direction: 'rtl'
                        });
                    }
                }
            }
        }

        // Tìm vị trí có số trùng với chữ số đầu hoặc cuối của số mục tiêu
        const firstDigit = targetNumber[0];
        const lastDigit = targetNumber[1];

        positions.forEach(pos => {
            if (pos.number === firstDigit || pos.number === lastDigit) {
                singlePatterns.push({
                    position: pos,
                    targetNumber,
                    type: 'single_digit',
                    digit: pos.number
                });
            }
        });

        return singlePatterns;
    }

    /**
     * Kiểm tra tính nhất quán của pattern qua các ngày theo logic soi cầu vị trí
     * @param {Array} patterns - Mảng pattern từ các ngày
     * @param {Object} options - Tùy chọn: { requiredConsecutiveDays, exactMatch }
     * @returns {Array} Mảng pattern nhất quán
     */
    validateConsistentPatterns(patterns, options = {}) {
        const requiredConsecutiveDays = options.requiredConsecutiveDays || 1;
        const exactMatch = options.exactMatch || false;
        const consistentPatterns = [];

        this.debugLog(`🔍 Kiểm tra tính nhất quán của ${patterns.length} pattern (yêu cầu tối thiểu ${requiredConsecutiveDays} ngày liên tiếp)`);
        this.debugLog(`📊 Ngưỡng nhất quán tối thiểu: ${patterns.length <= 2 ? '50%' : Math.round((1 / patterns.length) * 100) + '%'}`);

        // Nếu chỉ có 1 ngày dữ liệu, sử dụng tất cả pattern có sẵn
        if (patterns.length === 1) {
            const pattern = patterns[0];

            // Thêm tất cả cặp vị trí với độ tin cậy cao
            pattern.validPairs.forEach(pair => {
                const directionKey = pair.direction || 'ltr';
                const key = `${pair.position1.position}-${pair.position2.position}-${directionKey}`;
                consistentPatterns.push({
                    positionKey: key,
                    pairs: [pair],
                    successRate: 1.0, // 100% vì chỉ có 1 ngày
                    totalOccurrences: 1,
                    totalDays: 1,
                    type: 'pair',
                    direction: directionKey
                });
            });

            // Thêm tất cả pattern đơn lẻ
            pattern.singlePatterns.forEach(single => {
                const directionKey = single.direction || 'ltr';
                const key = single.type === 'consecutive'
                    ? `${single.position1.position}-${single.position2.position}-${directionKey}`
                    : `${single.position.position}-${single.type}`;
                consistentPatterns.push({
                    positionKey: key,
                    singles: [single],
                    successRate: 1.0,
                    totalOccurrences: 1,
                    totalDays: 1,
                    type: 'single',
                    direction: single.type === 'consecutive' ? directionKey : undefined
                });
            });

            return consistentPatterns.sort((a, b) => b.successRate - a.successRate);
        }

        // Logic cho nhiều ngày dữ liệu
        const positionGroups = {};
        const singlePatternGroups = {};

        patterns.forEach(pattern => {
            // Xử lý cặp vị trí
            pattern.validPairs.forEach(pair => {
                const directionKey = pair.direction || 'ltr';
                const key = `${pair.position1.position}-${pair.position2.position}-${directionKey}`;
                if (!positionGroups[key]) {
                    positionGroups[key] = [];
                }
                positionGroups[key].push({
                    ...pair,
                    dayIndex: pattern.dayIndex,
                    targetNumber: pattern.targetNumber,
                    direction: directionKey
                });
            });

            // Xử lý pattern đơn lẻ
            pattern.singlePatterns.forEach(single => {
                const directionKey = single.direction || 'ltr';
                const key = single.type === 'consecutive'
                    ? `${single.position1.position}-${single.position2.position}-${directionKey}`
                    : `${single.position.position}-${single.type}`;
                if (!singlePatternGroups[key]) {
                    singlePatternGroups[key] = [];
                }
                singlePatternGroups[key].push({
                    ...single,
                    dayIndex: pattern.dayIndex,
                    targetNumber: pattern.targetNumber,
                    direction: single.type === 'consecutive' ? directionKey : undefined
                });
            });
        });

        // Tìm các vị trí xuất hiện nhất quán (cặp vị trí)
        Object.entries(positionGroups).forEach(([positionKey, pairs]) => {
            if (pairs.length >= 1) {
                // Sắp xếp theo dayIndex để kiểm tra tính liên tiếp
                const sortedPairs = pairs.sort((a, b) => a.dayIndex - b.dayIndex);

                // Kiểm tra tính liên tiếp: các dayIndex phải liên tiếp nhau
                const dayIndices = sortedPairs.map(p => p.dayIndex).sort((a, b) => a - b);
                let consecutiveCount = 1;
                let maxConsecutive = 1;

                for (let i = 1; i < dayIndices.length; i++) {
                    if (dayIndices[i] === dayIndices[i - 1] + 1) {
                        consecutiveCount++;
                        maxConsecutive = Math.max(maxConsecutive, consecutiveCount);
                    } else {
                        consecutiveCount = 1;
                    }
                }

                // Lọc theo yêu cầu consecutiveDays
                if (exactMatch) {
                    if (maxConsecutive !== requiredConsecutiveDays) {
                        return; // Bỏ qua nếu không đúng số lần yêu cầu
                    }
                } else {
                    if (maxConsecutive < requiredConsecutiveDays) {
                        return; // Bỏ qua nếu ít hơn số lần yêu cầu
                    }
                }

                // Tính tỷ lệ thành công dựa trên số lần xuất hiện
                const successRate = pairs.length / patterns.length;

                // Điều chỉnh ngưỡng nhất quán dựa trên số ngày phân tích
                const minThreshold = patterns.length <= 2 ? 0.5 : (1 / patterns.length); // 33% cho 3 ngày, 25% cho 4 ngày, etc.

                if (successRate >= minThreshold) {
                    consistentPatterns.push({
                        positionKey,
                        pairs: sortedPairs,
                        successRate,
                        totalOccurrences: pairs.length,
                        totalDays: patterns.length,
                        consecutiveDays: maxConsecutive, // Số lần liên tiếp thực tế
                        type: 'pair',
                        direction: sortedPairs[0]?.direction || 'ltr'
                    });
                }
            }
        });

        // Tìm các pattern đơn lẻ nhất quán
        Object.entries(singlePatternGroups).forEach(([positionKey, singles]) => {
            if (singles.length >= 1) {
                // Sắp xếp theo dayIndex để kiểm tra tính liên tiếp
                const sortedSingles = singles.sort((a, b) => a.dayIndex - b.dayIndex);

                // Kiểm tra tính liên tiếp: các dayIndex phải liên tiếp nhau
                const dayIndices = sortedSingles.map(s => s.dayIndex).sort((a, b) => a - b);
                let consecutiveCount = 1;
                let maxConsecutive = 1;

                for (let i = 1; i < dayIndices.length; i++) {
                    if (dayIndices[i] === dayIndices[i - 1] + 1) {
                        consecutiveCount++;
                        maxConsecutive = Math.max(maxConsecutive, consecutiveCount);
                    } else {
                        consecutiveCount = 1;
                    }
                }

                // Lọc theo yêu cầu consecutiveDays
                if (exactMatch) {
                    if (maxConsecutive !== requiredConsecutiveDays) {
                        return; // Bỏ qua nếu không đúng số lần yêu cầu
                    }
                } else {
                    if (maxConsecutive < requiredConsecutiveDays) {
                        return; // Bỏ qua nếu ít hơn số lần yêu cầu
                    }
                }

                // Tính tỷ lệ thành công dựa trên số lần xuất hiện
                const successRate = singles.length / patterns.length;

                // Điều chỉnh ngưỡng nhất quán dựa trên số ngày phân tích
                const minThreshold = patterns.length <= 2 ? 0.5 : (1 / patterns.length); // 33% cho 3 ngày, 25% cho 4 ngày, etc.

                if (successRate >= minThreshold) {
                    consistentPatterns.push({
                        positionKey,
                        singles: sortedSingles,
                        successRate,
                        totalOccurrences: singles.length,
                        totalDays: patterns.length,
                        consecutiveDays: maxConsecutive, // Số lần liên tiếp thực tế
                        type: 'single',
                        direction: sortedSingles[0]?.direction || 'ltr'
                    });
                }
            }
        });

        return consistentPatterns.sort((a, b) => b.successRate - a.successRate);
    }

    /**
     * Dự đoán dựa trên pattern vị trí
     * @param {Array} consistentPatterns - Mảng pattern nhất quán
     * @param {Object} currentResult - Kết quả hiện tại (ngày 21/10/2025)
     * @returns {Array} Mảng dự đoán cho ngày 22/10/2025
     */
    predictFromPatterns(consistentPatterns, currentResult) {
        const predictions = [];
        const predictionMap = new Map(); // Để tránh trùng lặp

        if (!currentResult) return predictions;

        // FIX: Điều chỉnh ngưỡng độ tin cậy thông minh dựa trên số pattern nhất quán
        let minConfidence;
        if (consistentPatterns.length <= 5) {
            minConfidence = 0.5; // 50% cho ít pattern
        } else if (consistentPatterns.length <= 20) {
            minConfidence = 0.3; // 30% cho pattern vừa
        } else if (consistentPatterns.length <= 100) {
            minConfidence = 0.2; // 20% cho nhiều pattern
        } else {
            minConfidence = 0.1; // 10% cho rất nhiều pattern
        }

        this.debugLog(`🎯 Ngưỡng độ tin cậy: ${Math.round(minConfidence * 100)}% (${consistentPatterns.length} pattern nhất quán)`);
        const topPatterns = consistentPatterns.filter(p => p.successRate >= minConfidence);
        this.debugLog(`📊 Pattern đạt ngưỡng: ${topPatterns.length}/${consistentPatterns.length}`);

        topPatterns.forEach(pattern => {
            // Xử lý pattern cặp vị trí
            if (pattern.type === 'pair' && pattern.pairs && pattern.pairs.length > 0) {
                const pair = pattern.pairs[0]; // Lấy cặp đầu tiên
                const pos1 = pair.position1;
                const pos2 = pair.position2;

                // Tìm số ở vị trí tương ứng trong kết quả hiện tại (ngày 21/10/2025)
                const pos1Number = this.getNumberAtPosition(currentResult, pos1.prize, pos1.element, pos1.index);
                const pos2Number = this.getNumberAtPosition(currentResult, pos2.prize, pos2.element, pos2.index);
                const direction = pattern.direction || pair.direction || 'ltr';

                if (pos1Number && pos2Number) {
                    // Tạo số dự đoán theo direction của pattern
                    // LTR (trái→phải): ghép pos2 + pos1 (số bên phải trước, bên trái sau)
                    // RTL (phải→trái): ghép pos1 + pos2 (số bên trái trước, bên phải sau)
                    const predictedNumber = direction === 'rtl'
                        ? pos1Number + pos2Number  // RTL: pos1 + pos2
                        : pos2Number + pos1Number; // LTR: pos2 + pos1
                    const key = `${predictedNumber}-${pos1.position}-${pos2.position}-${direction}`;

                    // Chỉ thêm nếu chưa có hoặc có độ tin cậy cao hơn
                    if (!predictionMap.has(key) || predictionMap.get(key).confidence < Math.round(pattern.successRate * 100)) {
                        const prediction = {
                            predictedNumber,
                            position1: pos1.position,
                            position2: pos2.position,
                            number1: pos1Number,
                            number2: pos2Number,
                            successRate: pattern.successRate,
                            totalOccurrences: pattern.totalOccurrences,
                            method: `Vị trí ${pos1.position} + ${pos2.position}${direction === 'rtl' ? ' (phải→trái)' : ' (trái→phải)'}`,
                            confidence: Math.round(pattern.successRate * 100),
                            direction
                        };
                        predictionMap.set(key, prediction);
                    }
                }
            }

            // Xử lý pattern đơn lẻ
            if (pattern.type === 'single' && pattern.singles && pattern.singles.length > 0) {
                const single = pattern.singles[0]; // Lấy pattern đầu tiên

                if (single.type === 'consecutive' && single.position1 && single.position2) {
                    const pos1Number = this.getNumberAtPosition(currentResult, single.position1.prize, single.position1.element, single.position1.index);
                    const pos2Number = this.getNumberAtPosition(currentResult, single.position2.prize, single.position2.element, single.position2.index);
                    const direction = pattern.direction || single.direction || 'ltr';

                    if (pos1Number && pos2Number) {
                        // Tạo số dự đoán theo direction của pattern
                        // LTR (trái→phải): ghép pos2 + pos1 (số bên phải trước, bên trái sau)
                        // RTL (phải→trái): ghép pos1 + pos2 (số bên trái trước, bên phải sau)
                        const predictedNumber = direction === 'rtl'
                            ? pos1Number + pos2Number  // RTL: pos1 + pos2
                            : pos2Number + pos1Number; // LTR: pos2 + pos1
                        predictions.push({
                            predictedNumber,
                            position1: single.position1.position,
                            position2: single.position2.position,
                            number1: pos1Number,
                            number2: pos2Number,
                            successRate: pattern.successRate,
                            totalOccurrences: pattern.totalOccurrences,
                            method: `Vị trí liên tiếp ${single.position1.position} + ${single.position2.position}${direction === 'rtl' ? ' (phải→trái)' : ' (trái→phải)'}`,
                            confidence: Math.round(pattern.successRate * 100),
                            direction
                        });
                    }
                } else if (single.type === 'single_digit' && single.position) {
                    const posNumber = this.getNumberAtPosition(currentResult, single.position.prize, single.position.element, single.position.index);

                    if (posNumber) {
                        // Tạo dự đoán dựa trên chữ số đơn lẻ
                        const digit = single.digit;
                        const predictedNumber = digit + digit; // Hoặc logic khác
                        predictions.push({
                            predictedNumber,
                            position1: single.position.position,
                            position2: 'single',
                            number1: posNumber,
                            number2: digit,
                            successRate: pattern.successRate,
                            totalOccurrences: pattern.totalOccurrences,
                            method: `Chữ số đơn lẻ ${single.position.position}`,
                            confidence: Math.round(pattern.successRate * 100)
                        });
                    }
                }
            }
        });

        // Chuyển Map thành Array và sắp xếp theo độ tin cậy
        const allPredictions = Array.from(predictionMap.values())
            .sort((a, b) => b.confidence - a.confidence);

        // FIX: Điều chỉnh ngưỡng độ tin cậy thông minh dựa trên số lượng dự đoán
        let minConfidenceThreshold;
        if (allPredictions.length <= 10) {
            minConfidenceThreshold = 20; // 20% cho ít dự đoán
        } else if (allPredictions.length <= 50) {
            minConfidenceThreshold = 25; // 25% cho dự đoán vừa
        } else if (allPredictions.length <= 100) {
            minConfidenceThreshold = 30; // 30% cho nhiều dự đoán
        } else if (allPredictions.length <= 200) {
            minConfidenceThreshold = 35; // 35% cho rất nhiều dự đoán
        } else {
            minConfidenceThreshold = 40; // 40% cho cực nhiều dự đoán
        }

        const finalPredictions = allPredictions
            .filter(p => p.confidence >= minConfidenceThreshold)
            .slice(0, 100); // Tăng giới hạn lên 100 dự đoán

        this.debugLog(`🎯 Lọc ra ${finalPredictions.length} dự đoán có độ tin cậy ≥${minConfidenceThreshold}% từ ${allPredictions.length} dự đoán tổng cộng`);

        return finalPredictions;
    }

    /**
     * Lấy số ở vị trí cụ thể trong kết quả
     * @param {Object} result - Kết quả xổ số
     * @param {number} prize - Giải (0-7)
     * @param {number} element - Phần tử
     * @param {number} index - Vị trí trong số
     * @returns {string|null} Số ở vị trí đó
     */
    getNumberAtPosition(result, prize, element, index) {
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
     * Soi cầu dựa trên vị trí số
     * @param {string} date - Ngày phân tích (DD/MM/YYYY)
     * @param {number} days - Số ngày phân tích (2-30)
     * @returns {Object} Kết quả soi cầu
     */
    async analyzePositionSoiCau(date, days = 2) {
        try {
            const requestedDays = Math.max(2, Math.min(days || 2, 30));
            const maxRequiredDays = 3; // Hiện tại cần tối đa 3 ngày để xét 2 lần liên tiếp
            const processingDays = Math.max(requestedDays, maxRequiredDays);

            // Validate số ngày yêu cầu (theo quy định cũ để giữ API ổn định)
            if (requestedDays < 2 || requestedDays > 30) {
                throw new Error('Số ngày phải từ 2 đến 30');
            }

            const cacheKey = `position-soicau:${date}:${requestedDays}`;
            const cachedResponse = this.getCacheEntry(cacheKey);
            if (cachedResponse) {
                this.debugLog(`⚡ Returning cached analysis for ${cacheKey}`);
                return cachedResponse;
            }

            // Parse ngày
            const [day, month, year] = date.split('/').map(Number);
            const targetDate = new Date(year, month - 1, day);

            // Lấy dữ liệu các ngày (bỏ ngày hiện tại)
            const endOfDay = new Date(targetDate);
            endOfDay.setDate(endOfDay.getDate() - 1); // Bỏ ngày hiện tại (22/10)
            endOfDay.setHours(23, 59, 59, 999);
            const startOfPeriod = new Date(endOfDay);
            startOfPeriod.setDate(startOfPeriod.getDate() - processingDays + 1); // Lấy đủ số ngày cần xử lý
            startOfPeriod.setHours(0, 0, 0, 0);

            this.debugLog(`📅 Lấy dữ liệu từ ${startOfPeriod.toLocaleDateString()} đến ${endOfDay.toLocaleDateString()} (${processingDays} ngày để xử lý, yêu cầu ${requestedDays} ngày)`);

            const results = await XSMB.find({
                drawDate: { $gte: startOfPeriod, $lte: endOfDay },
                station: 'xsmb'
                // Bỏ điều kiện isComplete để lấy tất cả dữ liệu
            })
                .select('drawDate specialPrize firstPrize secondPrize threePrizes fourPrizes fivePrizes sixPrizes sevenPrizes')
                .sort({ drawDate: -1 })
                .lean();

            if (results.length < 2) {
                throw new Error(`Không đủ dữ liệu cho ${requestedDays} ngày phân tích`);
            }

            this.debugLog(`🔍 Phân tích ${results.length} ngày dữ liệu`);

            // Logic tính toán với nhiều mức lifetime (1 lần và 2 lần liên tiếp)
            let consistentPatterns = [];
            let predictions = [];
            let predictionsByLifetime = {};
            let aggregatedPatterns = [];

            // Xét từng mức riêng biệt với số ngày dữ liệu tương ứng
            // 1 lần = 2 ngày, 2 lần = 3 ngày
            const maxLifetime = 2;
            const minLifetime = 1;
            const allLifetimePatterns = {};
            const allLifetimePredictions = {}; // Lưu predictions theo từng mức

            for (let lifetime = maxLifetime; lifetime >= minLifetime; lifetime--) {
                const requiredDays = lifetime + 1; // Số ngày dữ liệu cần thiết

                // Chỉ sử dụng số ngày dữ liệu tương ứng cho mức này
                const lifetimeResults = results.slice(0, requiredDays);

                if (lifetimeResults.length < requiredDays) {
                    continue;
                }

                this.debugLog(`🔍 Tính toán ${lifetime} lần liên tiếp với ${requiredDays} ngày dữ liệu`);

                // Tìm pattern với biên độ tối đa = lifetime
                const lifetimePatterns = this.findPositionPatterns(lifetimeResults, lifetime);
                aggregatedPatterns = aggregatedPatterns.concat(lifetimePatterns);

                // Kiểm tra tính nhất quán với số lần liên tiếp yêu cầu
                // CHỈ lấy các pattern có ĐÚNG số lần liên tiếp bằng lifetime (không >=)
                const consistentLifetimePatterns = this.validateConsistentPatterns(lifetimePatterns, {
                    requiredConsecutiveDays: lifetime,
                    exactMatch: true // Chỉ lấy pattern có đúng số lần yêu cầu
                });

                // Nhóm theo positionKey để chỉ lấy số lần lớn nhất
                consistentLifetimePatterns.forEach(pattern => {
                    const positionKey = pattern.positionKey;
                    if (!allLifetimePatterns[positionKey] || allLifetimePatterns[positionKey].consecutiveDays < lifetime) {
                        allLifetimePatterns[positionKey] = {
                            ...pattern,
                            lifetime: lifetime // Lưu lifetime để nhóm sau này
                        };
                    }
                });

                // Dự đoán dựa trên pattern của mức này
                const latestResult = lifetimeResults[0];
                const lifetimePredictions = this.predictFromPatterns(consistentLifetimePatterns, latestResult);

                // Lưu predictions theo mức
                allLifetimePredictions[lifetime] = lifetimePredictions;
                this.debugLog(`  ✅ ${lifetime} lần liên tiếp: ${consistentLifetimePatterns.length} pattern, ${lifetimePredictions.length} dự đoán`);
            }

            consistentPatterns = Object.values(allLifetimePatterns);
            this.debugLog(`✅ Tìm thấy ${consistentPatterns.length} pattern nhất quán (xét từ ${maxLifetime} xuống ${minLifetime} lần liên tiếp)`);

            // Nhóm predictions theo lifetime (số lần liên tiếp)
            // Tránh trùng lặp GIỮA các lifetime: nếu số đã xuất hiện ở lifetime cao hơn, không hiển thị ở lifetime thấp hơn
            predictionsByLifetime = {};
            const seenNumbers = new Set(); // Lưu các số đã xuất hiện ở lifetime cao hơn

            // Xử lý từng mức từ cao xuống thấp (2 -> 1)
            for (let lifetime = maxLifetime; lifetime >= minLifetime; lifetime--) {
                const lifetimePredictions = allLifetimePredictions[lifetime] || [];

                if (lifetimePredictions.length > 0) {
                    if (!predictionsByLifetime[lifetime]) {
                        predictionsByLifetime[lifetime] = [];
                    }

                    // Nhóm predictions theo số để kiểm tra xem số đã xuất hiện ở lifetime cao hơn chưa
                    const predictionsByNumber = new Map(); // Key: normalizedNumber, Value: array of predictions

                    lifetimePredictions.forEach(prediction => {
                        // Normalize số thành 2 chữ số
                        const predictedNumber = String(prediction.predictedNumber || '').padStart(2, '0');
                        const normalizedNumber = predictedNumber.length === 2 ? predictedNumber : predictedNumber.slice(-2);

                        if (!predictionsByNumber.has(normalizedNumber)) {
                            predictionsByNumber.set(normalizedNumber, []);
                        }
                        predictionsByNumber.get(normalizedNumber).push(prediction);
                    });

                    // Chỉ thêm các số chưa xuất hiện ở lifetime cao hơn
                    predictionsByNumber.forEach((predictions, normalizedNumber) => {
                        if (!seenNumbers.has(normalizedNumber)) {
                            predictions.forEach(prediction => {
                                predictionsByLifetime[lifetime].push({
                                    ...prediction,
                                    lifetime: lifetime
                                });
                            });
                            // Đánh dấu số này đã xuất hiện
                            seenNumbers.add(normalizedNumber);
                        }
                    });
                }
            }

            // Tạo predictionMap để lấy predictions chính (chỉ lấy lifetime lớn nhất cho mỗi position)
            const predictionMap = new Map(); // Key: position1|position2|direction|predictedNumber

            // Xử lý từng mức và chỉ lấy prediction có lifetime lớn nhất cho predictions chính
            for (let lifetime = maxLifetime; lifetime >= minLifetime; lifetime--) {
                const lifetimePredictions = allLifetimePredictions[lifetime] || [];

                lifetimePredictions.forEach(prediction => {
                    const key = `${prediction.position1}|${prediction.position2}|${prediction.direction || 'ltr'}|${prediction.predictedNumber}`;
                    const existing = predictionMap.get(key);

                    // Chỉ lấy prediction có lifetime lớn nhất
                    if (!existing || (existing.lifetime || existing.consecutiveDays || 1) < lifetime) {
                        predictionMap.set(key, {
                            ...prediction,
                            lifetime: lifetime
                        });
                    }
                });
            }

            // Sắp xếp các predictions trong mỗi nhóm theo số (tăng dần)
            Object.keys(predictionsByLifetime).forEach(lifetime => {
                predictionsByLifetime[lifetime].sort((a, b) => {
                    const numA = parseInt(a.predictedNumber);
                    const numB = parseInt(b.predictedNumber);
                    return numA - numB;
                });
            });

            // Tạo uniquePredictions từ predictionMap để làm predictions chính
            const uniquePredictions = Array.from(predictionMap.values());
            predictions = uniquePredictions;
            this.debugLog(`📊 Nhóm predictions theo lifetime: ${Object.keys(predictionsByLifetime).map(l => `${l} lần (${predictionsByLifetime[l].length} số)`).join(', ')}`);
            this.debugLog(`🎯 Tạo ra ${predictions.length} dự đoán cho ngày tiếp theo`);

            // Tạo thống kê số lần xuất hiện theo format bảng
            const numberStats = {};
            predictions.forEach(prediction => {
                const number = prediction.predictedNumber;
                if (numberStats[number]) {
                    numberStats[number].count++;
                    numberStats[number].positions.push({
                        position1: prediction.position1,
                        position2: prediction.position2,
                        confidence: prediction.confidence
                    });
                } else {
                    numberStats[number] = {
                        count: 1,
                        positions: [{
                            position1: prediction.position1,
                            position2: prediction.position2,
                            confidence: prediction.confidence
                        }]
                    };
                }
            });

            // Tạo bảng thống kê theo format "Đầu X"
            const tableStats = {};
            for (let tens = 0; tens <= 9; tens++) {
                tableStats[`Đầu ${tens}`] = [];
            }

            // Phân loại số theo chữ số hàng chục
            Object.entries(numberStats).forEach(([number, stats]) => {
                const num = parseInt(number);
                const tens = Math.floor(num / 10);
                const key = `Đầu ${tens}`;

                if (tableStats[key]) {
                    tableStats[key].push({
                        number: num,
                        count: stats.count,
                        positions: stats.positions
                    });
                }
            });

            // Sắp xếp các số trong mỗi hàng từ nhỏ đến lớn
            Object.keys(tableStats).forEach(key => {
                tableStats[key].sort((a, b) => a.number - b.number);
            });

            // Sắp xếp theo số từ nhỏ đến lớn (cho phần thống kê cũ)
            const sortedNumberStats = Object.entries(numberStats)
                .map(([number, stats]) => ({
                    number: parseInt(number),
                    count: stats.count,
                    positions: stats.positions
                }))
                .sort((a, b) => a.number - b.number);

            // Tạo kết quả tổng hợp
            const response = {
                analysisDate: date,
                analysisDays: requestedDays,
                totalResults: results.length,
                patternsFound: aggregatedPatterns.length,
                consistentPatterns: consistentPatterns.length,
                predictions: predictions, // Tất cả dự đoán (đã lọc chỉ lấy lifetime lớn nhất)
                predictionsByLifetime: predictionsByLifetime, // Nhóm theo số lần liên tiếp (1-2 lần cho special)
                numberStatistics: sortedNumberStats, // Thống kê số lần xuất hiện
                tableStatistics: tableStats, // Bảng thống kê theo format "Đầu X"
                metadata: {
                    dataFrom: results[results.length - 1]?.drawDate,
                    dataTo: results[0]?.drawDate,
                    successRate: consistentPatterns.length > 0
                        ? Math.round(consistentPatterns[0].successRate * 100)
                        : 0,
                    requestedDays,
                    processingDays
                },
                detailedAnalysis: {
                    patterns: aggregatedPatterns,
                    consistentPatterns,
                    allPredictions: predictions
                }
            };

            // Cache kết quả
            this.debugLog(`💾 Analysis completed: ${cacheKey}`);
            this.setCacheEntry(cacheKey, response);

            return response;

        } catch (error) {
            console.error('❌ Lỗi trong analyzePositionSoiCau:', error.message);
            throw error;
        }
    }
}

module.exports = new PositionAnalyzer();