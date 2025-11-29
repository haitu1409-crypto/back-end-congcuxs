/**
 * Position Analyzer Service
 * Thuật toán soi cầu dựa trên vị trí số với hiệu suất cao và độ chính xác tuyệt đối
 */

const XSMB = require('../models/xsmb.model');

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
    findPositionPatterns(results, targetDays, options = {}) {
        const mode = options.mode || 'special';
        const patterns = [];

        if (results.length < 2) return patterns; // Cần ít nhất 2 ngày

        console.log(`🔍 Bắt đầu soi cầu vị trí cho ${targetDays} ngày`);

        const directionModes = mode === 'loto' ? ['ltr', 'rtl'] : ['both'];

        directionModes.forEach(directionMode => {
            if (mode === 'loto') {
                const directionLabel = directionMode === 'ltr' ? 'trái→phải' : 'phải→trái';
                console.log(`↪️ Đang xét hướng ${directionLabel}`);
            }

            for (let currentIndex = 0; currentIndex < results.length - 1; currentIndex++) {
                const currentResult = results[currentIndex]; // Ngày hiện tại
                const targetNumbers = this.getTargetNumbersForMode(currentResult, mode);

                // Với mode 'loto', tìm tất cả pattern có thể tạo ra bất kỳ số nào trong targetNumbers
                // và đối chiếu cả 2 hướng (forward và reverse) với tất cả targetNumbers
                if (mode === 'loto') {
                    // Tìm trong tất cả các ngày trước đó trong biên độ
                    for (let previousIndex = currentIndex + 1; previousIndex < Math.min(currentIndex + targetDays + 1, results.length); previousIndex++) {
                        const previousResult = results[previousIndex]; // Ngày trước trong biên độ

                        if (!previousResult || !currentResult) continue;

                        const biendDo = previousIndex - currentIndex; // Tính biên độ thực tế
                        console.log(`  🔍 Kiểm tra ngày ${previousIndex} (biên độ ${biendDo} ngày)`);

                        const previousPositions = this.analyzePositions(previousResult);

                        // Tạo Set chứa tất cả targetNumbers để đối chiếu nhanh
                        const targetNumberSet = new Set(targetNumbers.map(t => t.number));

                        // Tìm tất cả cặp vị trí và đối chiếu theo hướng được chỉ định với tất cả targetNumbers
                        const allValidPairs = [];
                        for (let i = 0; i < previousPositions.length; i++) {
                            for (let j = i + 1; j < previousPositions.length; j++) {
                                const pos1 = previousPositions[i];
                                const pos2 = previousPositions[j];

                                // Ghép số theo hướng được chỉ định (chỉ 1 hướng)
                                let combinedNumber;
                                if (directionMode === 'ltr') {
                                    // Hướng trái→phải: ghép pos2 + pos1 (số bên phải trước, bên trái sau)
                                    combinedNumber = pos2.number + pos1.number;
                                } else { // rtl
                                    // Hướng phải→trái: ghép pos1 + pos2 (số bên trái trước, bên phải sau)
                                    combinedNumber = pos1.number + pos2.number;
                                }

                                // Đối chiếu số đã ghép với tất cả targetNumbers
                                if (targetNumberSet.has(combinedNumber)) {
                                    // Tìm targetInfo tương ứng
                                    const targetInfo = targetNumbers.find(t => t.number === combinedNumber);
                                    allValidPairs.push({
                                        position1: pos1,
                                        position2: pos2,
                                        combinedNumber: combinedNumber,
                                        targetNumber: combinedNumber,
                                        targetPrize: targetInfo?.prize,
                                        targetPrizeName: targetInfo?.prizeName,
                                        targetElement: targetInfo?.elementIndex,
                                        direction: directionMode // Lưu direction theo hướng được chỉ định
                                    });
                                }
                            }
                        }

                        if (allValidPairs.length > 0) {
                            console.log(`  ✅ Tìm thấy ${allValidPairs.length} cặp vị trí (biên độ ${biendDo} ngày, hướng ${directionMode})`);
                            // Nhóm theo targetNumber và direction để tạo patterns
                            const groupedPairs = {};
                            allValidPairs.forEach(pair => {
                                const key = `${pair.targetNumber}-${pair.direction}`;
                                if (!groupedPairs[key]) {
                                    groupedPairs[key] = {
                                        targetNumber: pair.targetNumber,
                                        targetPrize: pair.targetPrize,
                                        targetPrizeName: pair.targetPrizeName,
                                        targetElement: pair.targetElement,
                                        direction: pair.direction,
                                        pairs: []
                                    };
                                }
                                groupedPairs[key].pairs.push(pair);
                            });

                            // Tạo pattern cho mỗi nhóm
                            Object.values(groupedPairs).forEach(group => {
                                patterns.push({
                                    dayIndex: currentIndex,
                                    previousIndex: previousIndex,
                                    targetNumber: group.targetNumber,
                                    targetPrize: group.targetPrize,
                                    targetPrizeName: group.targetPrizeName,
                                    targetElement: group.targetElement,
                                    validPairs: group.pairs,
                                    singlePatterns: [],
                                    date: previousResult.drawDate,
                                    nextDate: currentResult.drawDate,
                                    biendDo: biendDo,
                                    direction: group.direction
                                });
                            });
                        }
                    }
                } else {
                    // Logic cũ cho mode 'special'
                    targetNumbers.forEach(targetInfo => {
                        const targetNumber = targetInfo.number;

                        console.log(`📅 Tìm vị trí tạo ra ${targetNumber} (${targetInfo.prizeName}) trong biên độ ${targetDays} ngày`);

                        // Tìm trong tất cả các ngày trước đó trong biên độ
                        for (let previousIndex = currentIndex + 1; previousIndex < Math.min(currentIndex + targetDays + 1, results.length); previousIndex++) {
                            const previousResult = results[previousIndex]; // Ngày trước trong biên độ

                            if (!previousResult || !currentResult) continue;

                            const biendDo = previousIndex - currentIndex; // Tính biên độ thực tế
                            console.log(`  🔍 Kiểm tra ngày ${previousIndex} (biên độ ${biendDo} ngày)`);

                            const previousPositions = this.analyzePositions(previousResult);

                            // Tìm tất cả cặp vị trí có thể tạo ra số mục tiêu
                            const validPairs = this.findValidPositionPairs(previousPositions, targetNumber, {
                                directionMode
                            });

                            // Với soi cầu lô tô, chỉ xét các cặp vị trí; bỏ qua pattern đơn lẻ
                            const singlePatterns = this.findSinglePositionPatterns(previousPositions, targetNumber, {
                                includeReverse: true
                            });

                            if (validPairs.length > 0 || singlePatterns.length > 0) {
                                console.log(`  ✅ Tìm thấy ${validPairs.length} cặp vị trí và ${singlePatterns.length} vị trí đơn lẻ (biên độ ${biendDo} ngày)`);
                                patterns.push({
                                    dayIndex: currentIndex,
                                    previousIndex: previousIndex,
                                    targetNumber: targetNumber,
                                    targetPrize: targetInfo.prize,
                                    targetPrizeName: targetInfo.prizeName,
                                    targetElement: targetInfo.elementIndex,
                                    validPairs,
                                    singlePatterns,
                                    date: previousResult.drawDate,
                                    nextDate: currentResult.drawDate,
                                    biendDo: biendDo, // Biên độ thực tế
                                    direction: directionMode === 'both' ? undefined : directionMode
                                });
                            }
                        }
                    });
                }
            }
        });

        return patterns;
    }

    /**
     * Tìm các cặp vị trí hợp lệ tạo ra số mục tiêu
     * @param {Array} positions - Mảng vị trí số
     * @param {string} targetNumber - Số mục tiêu (2 chữ số)
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

                // Tạo số từ 2 vị trí
                if (includeForward) {
                    const forwardNumber = pos1.number + pos2.number;
                    if (forwardNumber === targetNumber) {
                        validPairs.push({
                            position1: pos1,
                            position2: pos2,
                            combinedNumber: forwardNumber,
                            targetNumber,
                            direction: 'ltr'
                        });
                    }
                }

                if (includeReverse) {
                    const reverseNumber = pos2.number + pos1.number;
                    if (reverseNumber === targetNumber) {
                        validPairs.push({
                            position1: pos1,
                            position2: pos2,
                            combinedNumber: reverseNumber,
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
                const forwardNumber = pos1.number + pos2.number;
                if (forwardNumber === targetNumber) {
                    singlePatterns.push({
                        position1: pos1,
                        position2: pos2,
                        combinedNumber: forwardNumber,
                        targetNumber,
                        type: 'consecutive',
                        direction: 'ltr'
                    });
                }

                if (includeReverse) {
                    const reverseNumber = pos2.number + pos1.number;
                    if (reverseNumber === targetNumber) {
                        singlePatterns.push({
                            position1: pos1,
                            position2: pos2,
                            combinedNumber: reverseNumber,
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
     * @returns {Array} Mảng pattern nhất quán
     */
    validateConsistentPatterns(patterns, options = {}) {
        const mode = options.mode || 'special';
        const requiredConsecutiveDays = options.requiredConsecutiveDays || 1;
        const exactMatch = options.exactMatch || false;
        const consistentPatterns = [];

        console.log(`🔍 Kiểm tra tính nhất quán của ${patterns.length} pattern (yêu cầu tối thiểu ${requiredConsecutiveDays} ngày liên tiếp${mode === 'loto' ? ' cho lô tô' : ''})`);
        console.log(`📊 Ngưỡng nhất quán tối thiểu: ${patterns.length <= 2 ? '50%' : Math.round((1 / patterns.length) * 100) + '%'}`);

        // Nếu chỉ có 1 ngày dữ liệu, sử dụng tất cả pattern có sẵn
        if (patterns.length === 1) {
            const pattern = patterns[0];

            // Thêm tất cả cặp vị trí với độ tin cậy cao
            pattern.validPairs.forEach(pair => {
                const key = `${pair.position1.position}-${pair.position2.position}`;
                consistentPatterns.push({
                    positionKey: key,
                    pairs: [pair],
                    successRate: 1.0, // 100% vì chỉ có 1 ngày
                    totalOccurrences: 1,
                    totalDays: 1,
                    type: 'pair'
                });
            });

            // Thêm tất cả pattern đơn lẻ
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

        // Logic cho nhiều ngày dữ liệu
        const positionGroups = {};
        const singlePatternGroups = {};

        const groupKey = (parts) => parts.filter(Boolean).join('|');
        const includeTargetNumber = mode !== 'loto';
        const includeTargetPrize = mode !== 'loto';

        patterns.forEach(pattern => {
            // Xử lý cặp vị trí
            pattern.validPairs.forEach(pair => {
                const directionKey = pair.direction || 'ltr';
                // FIX: Với mode 'loto', nhóm các pattern có cùng biên độ 1 ngày (KHÔNG nhóm theo targetNumber)
                // Để đảm bảo 4 lần match liên tiếp là từ cùng một vị trí, cùng hướng, cùng biên độ
                // Pattern có thể match với các targetNumber khác nhau qua các ngày, nhưng vẫn được coi là liên tiếp
                // Sau đó dự đoán số từ vị trí cuối cùng (ngày 22/11) cho ngày tiếp theo (23/11)
                const biendDo = pattern.biendDo || 1;
                const key = groupKey([
                    pair.position1.position,
                    pair.position2.position,
                    includeTargetNumber ? pattern.targetNumber : null, // Với mode 'loto', KHÔNG bao gồm targetNumber trong key
                    includeTargetPrize ? (pattern.targetPrize || 'any') : null,
                    directionKey,
                    mode === 'loto' ? `biendDo${biendDo}` : null // Thêm biên độ vào key cho mode 'loto'
                ]);
                if (!positionGroups[key]) {
                    positionGroups[key] = [];
                }
                positionGroups[key].push({
                    ...pair,
                    dayIndex: pattern.dayIndex,
                    previousIndex: pattern.previousIndex,
                    targetNumber: pattern.targetNumber,
                    targetPrize: pattern.targetPrize,
                    targetPrizeName: pattern.targetPrizeName,
                    biendDo: biendDo
                });
            });

            // Xử lý pattern đơn lẻ
            pattern.singlePatterns.forEach(single => {
                const directionKey = single.direction || 'ltr';
                const key = single.type === 'consecutive'
                    ? groupKey([
                        single.position1.position,
                        single.position2.position,
                        includeTargetNumber ? pattern.targetNumber : null,
                        includeTargetPrize ? (pattern.targetPrize || 'any') : null,
                        directionKey
                    ])
                    : groupKey([
                        single.position.position,
                        single.type,
                        includeTargetNumber ? pattern.targetNumber : null,
                        includeTargetPrize ? (pattern.targetPrize || 'any') : null
                    ]);
                if (!singlePatternGroups[key]) {
                    singlePatternGroups[key] = [];
                }
                singlePatternGroups[key].push({
                    ...single,
                    dayIndex: pattern.dayIndex,
                    previousIndex: pattern.previousIndex,
                    targetNumber: pattern.targetNumber,
                    targetPrize: pattern.targetPrize,
                    targetPrizeName: pattern.targetPrizeName
                });
            });
        });

        // Tìm các vị trí xuất hiện nhất quán (cặp vị trí)
        Object.entries(positionGroups).forEach(([positionKey, pairs]) => {
            if (pairs.length >= 1) {
                // Với mode 'loto': cho phép tất cả biên độ từ 1-10 (để có thể xét 3-10 lần liên tiếp)
                // Với mode 'special': chỉ lấy biên độ 1 ngày
                let filteredPairs = pairs;
                if (mode === 'loto') {
                    // Cho phép tất cả biên độ từ 1-10
                    filteredPairs = pairs.filter(p => p.biendDo >= 1 && p.biendDo <= 10);
                } else {
                    filteredPairs = pairs.filter(p => p.biendDo === 1);
                }

                if (filteredPairs.length === 0) {
                    return; // Bỏ qua nếu không có pattern nào hợp lệ
                }

                // FIX: Với mode 'loto', sử dụng dayIndex (ngày đích) thay vì previousIndex để kiểm tra tính liên tiếp
                // Vì dayIndex liên tiếp (3, 2, 1, 0) trong khi previousIndex không liên tiếp (4, 3, 2, 1)
                const normalizedPairs = this.normalizePatternOccurrences(filteredPairs, { usePreviousIndex: mode !== 'loto' })
                    .filter(seq => exactMatch ? seq.consecutiveDays === requiredConsecutiveDays : seq.consecutiveDays >= requiredConsecutiveDays);
                normalizedPairs.forEach(normalized => {
                    consistentPatterns.push({
                        positionKey,
                        pairs: normalized.entries,
                        successRate: normalized.successRate,
                        totalOccurrences: normalized.entries.length,
                        totalDays: patterns.length,
                        consecutiveDays: normalized.consecutiveDays,
                        type: 'pair',
                        targetPrize: normalized.entries[0]?.targetPrize,
                        targetPrizeName: normalized.entries[0]?.targetPrizeName,
                        targetNumber: normalized.entries[0]?.targetNumber,
                        biendDo: normalized.biendDo || normalized.entries[0]?.biendDo || 1,
                        direction: normalized.entries[0]?.direction || 'ltr'
                    });
                });
            }
        });

        // Tìm các pattern đơn lẻ nhất quán
        Object.entries(singlePatternGroups).forEach(([positionKey, singles]) => {
            if (singles.length >= 1) {
                // FIX: Với biên độ > 2 ngày, không yêu cầu liên tiếp, chỉ cần xuất hiện đủ lần
                const normalizedSingles = this.normalizePatternOccurrences(singles, { usePreviousIndex: true })
                    .filter(seq => exactMatch ? seq.consecutiveDays === requiredConsecutiveDays : seq.consecutiveDays >= requiredConsecutiveDays);
                normalizedSingles.forEach(normalized => {
                    consistentPatterns.push({
                        positionKey,
                        singles: normalized.entries,
                        successRate: normalized.successRate,
                        totalOccurrences: normalized.entries.length,
                        totalDays: patterns.length,
                        consecutiveDays: normalized.consecutiveDays,
                        type: 'single',
                        targetPrize: normalized.entries[0]?.targetPrize,
                        targetPrizeName: normalized.entries[0]?.targetPrizeName,
                        targetNumber: normalized.entries[0]?.targetNumber,
                        biendDo: normalized.biendDo || normalized.entries[0]?.biendDo || 2,
                        direction: normalized.entries[0]?.direction || 'ltr'
                    });
                });
            }
        });

        return consistentPatterns.sort((a, b) => b.successRate - a.successRate);
    }

    normalizePatternOccurrences(entries = [], options = {}) {
        if (!entries.length) return [];

        const usePreviousIndex = options.usePreviousIndex !== false;

        const dayBuckets = new Map();
        entries.forEach(entry => {
            const day = usePreviousIndex
                ? (entry.previousIndex ?? entry.dayIndex ?? entry.normalizedDay ?? 0)
                : (entry.dayIndex ?? entry.normalizedDay ?? entry.previousIndex ?? 0);
            if (!dayBuckets.has(day)) {
                dayBuckets.set(day, []);
            }
            dayBuckets.get(day).push(entry);
        });

        // Với mode 'loto' và usePreviousIndex = false, dayIndex giảm dần (3, 2, 1, 0)
        // Cần sắp xếp giảm dần để kiểm tra tính liên tiếp đúng
        const sortedDays = usePreviousIndex
            ? Array.from(dayBuckets.keys()).sort((a, b) => a - b) // Tăng dần cho previousIndex
            : Array.from(dayBuckets.keys()).sort((a, b) => b - a); // Giảm dần cho dayIndex
        if (!sortedDays.length) return [];

        const uniqueDayCount = sortedDays.length;
        const sequences = [];
        let currentSeq = [];
        let prevDay = null;

        sortedDays.forEach(day => {
            const bucketEntries = dayBuckets.get(day) || [];
            // Kiểm tra tính liên tiếp:
            // - Với usePreviousIndex = true: tăng dần (0, 1, 2, 3)
            // - Với usePreviousIndex = false: giảm dần (3, 2, 1, 0)
            if (prevDay === null) {
                currentSeq.push({ day, entries: bucketEntries });
            } else if (usePreviousIndex && day === prevDay + 1) {
                // Liên tiếp tăng dần (0, 1, 2, 3)
                currentSeq.push({ day, entries: bucketEntries });
            } else if (!usePreviousIndex && day === prevDay - 1) {
                // Liên tiếp giảm dần (3, 2, 1, 0)
                currentSeq.push({ day, entries: bucketEntries });
            } else {
                // Không liên tiếp - bắt đầu chuỗi mới
                sequences.push(currentSeq);
                currentSeq = [{ day, entries: bucketEntries }];
            }
            prevDay = day;
        });
        if (currentSeq.length) {
            sequences.push(currentSeq);
        }

        return sequences.map(seq => {
            const flattenedEntries = seq.flatMap(item => item.entries);
            return {
                entries: flattenedEntries,
                consecutiveDays: seq.length,
                successRate: seq.length / uniqueDayCount,
                biendDo: flattenedEntries[0]?.biendDo
            };
        });
    }

    /**
     * Dự đoán dựa trên pattern vị trí
     * @param {Array} consistentPatterns - Mảng pattern nhất quán
     * @param {Object} currentResult - Kết quả hiện tại (ngày 21/10/2025)
     * @returns {Array} Mảng dự đoán cho ngày 22/10/2025
     */
    predictFromPatterns(consistentPatterns, currentResult, options = {}) {
        const predictionMap = new Map(); // Để tránh trùng lặp
        const mode = options.mode || 'special';

        const addPrediction = (prediction) => {
            const keyParts = [
                prediction.predictedNumber,
                prediction.position1 || '',
                prediction.position2 || '',
                prediction.targetPrize || '',
                prediction.direction || ''
            ];
            const key = keyParts.join('-');
            const existing = predictionMap.get(key);
            if (!existing || existing.confidence < prediction.confidence) {
                predictionMap.set(key, prediction);
            }
        };

        if (!currentResult) return [];

        const currentPositions = this.analyzePositions(currentResult);

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

        if (mode === 'loto') {
            minConfidence = Math.min(minConfidence, 0.05); // Cho phép ngưỡng thấp hơn cho lô tô
        }

        console.log(`🎯 Ngưỡng độ tin cậy: ${Math.round(minConfidence * 100)}% (${consistentPatterns.length} pattern nhất quán)`);
        const topPatterns = consistentPatterns.filter(p => p.successRate >= minConfidence);
        console.log(`📊 Pattern đạt ngưỡng: ${topPatterns.length}/${consistentPatterns.length}`);

        topPatterns.forEach(pattern => {
            // Xử lý pattern cặp vị trí
            if (pattern.type === 'pair' && pattern.pairs && pattern.pairs.length > 0) {
                const pair = pattern.pairs[0]; // Lấy cặp đầu tiên
                const pos1 = pair.position1;
                const pos2 = pair.position2;
                const direction = pattern.direction || pair.direction || 'ltr';

                // Tìm số ở vị trí tương ứng trong kết quả hiện tại (ngày 21/10/2025)
                const pos1Number = this.getNumberAtPosition(currentResult, pos1.prize, pos1.element, pos1.index);
                const pos2Number = this.getNumberAtPosition(currentResult, pos2.prize, pos2.element, pos2.index);

                if (pos1Number && pos2Number) {
                    // Tạo số dự đoán theo direction của pattern
                    // Nếu pattern nhất quán với hướng LTR → chỉ dự đoán số LTR
                    // Nếu pattern nhất quán với hướng RTL → chỉ dự đoán số RTL
                    const predictedNumber = direction === 'rtl'
                        ? pos1Number + pos2Number  // RTL: pos1 + pos2
                        : pos2Number + pos1Number; // LTR: pos2 + pos1

                    addPrediction({
                        predictedNumber,
                        position1: pos1.position,
                        position2: pos2.position,
                        number1: pos1Number,
                        number2: pos2Number,
                        successRate: pattern.successRate,
                        totalOccurrences: pattern.totalOccurrences,
                        method: `Vị trí ${pos1.position} + ${pos2.position}${direction === 'rtl' ? ' (phải→trái)' : ' (trái→phải)'}`,
                        confidence: Math.round(pattern.successRate * 100),
                        targetPrize: pattern.targetPrize,
                        targetNumber: pattern.targetNumber,
                        consecutiveDays: pattern.consecutiveDays,
                        targetPrizeName: pattern.targetPrizeName,
                        biendDo: pattern.biendDo || 1,
                        direction
                    });
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
                        // RTL (phải→trái): pos1 + pos2 (số bên trái trước, bên phải sau) = "83"
                        // LTR (trái→phải): pos2 + pos1 (số bên phải trước, bên trái sau) = "38"
                        const predictedNumber = direction === 'rtl'
                            ? pos1Number + pos2Number
                            : pos2Number + pos1Number;
                        addPrediction({
                            predictedNumber,
                            position1: single.position1.position,
                            position2: single.position2.position,
                            number1: pos1Number,
                            number2: pos2Number,
                            successRate: pattern.successRate,
                            totalOccurrences: pattern.totalOccurrences,
                            method: `Vị trí liên tiếp ${single.position1.position} + ${single.position2.position}${direction === 'rtl' ? ' (phải→trái)' : ' (trái→phải)'}`,
                            confidence: Math.round(pattern.successRate * 100),
                            targetPrize: pattern.targetPrize,
                            targetNumber: pattern.targetNumber,
                            consecutiveDays: pattern.consecutiveDays,
                            targetPrizeName: pattern.targetPrizeName,
                            biendDo: pattern.biendDo || 2,
                            direction
                        });
                    }
                } else if (single.type === 'single_digit' && single.position) {
                    const posNumber = this.getNumberAtPosition(currentResult, single.position.prize, single.position.element, single.position.index);

                    if (posNumber) {
                        // Tạo dự đoán dựa trên chữ số đơn lẻ
                        const digit = single.digit;
                        const predictedNumber = digit + digit; // Hoặc logic khác
                        addPrediction({
                            predictedNumber,
                            position1: single.position.position,
                            position2: 'single',
                            number1: posNumber,
                            number2: digit,
                            successRate: pattern.successRate,
                            totalOccurrences: pattern.totalOccurrences,
                            method: `Chữ số đơn lẻ ${single.position.position}`,
                            confidence: Math.round(pattern.successRate * 100),
                            targetPrize: pattern.targetPrize,
                            targetNumber: pattern.targetNumber,
                            consecutiveDays: pattern.consecutiveDays,
                            targetPrizeName: pattern.targetPrizeName,
                            biendDo: pattern.biendDo || 2
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

        if (mode === 'loto') {
            minConfidenceThreshold = 0; // Không lọc theo ngưỡng confidence cho lô tô
        }

        const finalPredictions = allPredictions
            .filter(p => p.confidence >= minConfidenceThreshold)
            .slice(0, mode === 'loto' ? 300 : 100);

        console.log(`🎯 Lọc ra ${finalPredictions.length} dự đoán có độ tin cậy ≥${minConfidenceThreshold}% từ ${allPredictions.length} dự đoán tổng cộng`);

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
    getTargetNumbersForMode(result, mode = 'special') {
        const targets = [];
        if (!result) return targets;

        const prizeFields = [
            'specialPrize', 'firstPrize', 'secondPrize', 'threePrizes',
            'fourPrizes', 'fivePrizes', 'sixPrizes', 'sevenPrizes'
        ];

        if (mode === 'special') {
            if (Array.isArray(result.specialPrize) && result.specialPrize[0]) {
                targets.push({
                    number: result.specialPrize[0].slice(-2),
                    prize: 0,
                    prizeName: this.prizeStructure[0]?.name || 'Giải đặc biệt',
                    elementIndex: 0
                });
            }
            return targets;
        }

        prizeFields.forEach((field, prizeIndex) => {
            const entries = Array.isArray(result[field]) ? result[field] : [];
            entries.forEach((value, elementIndex) => {
                if (!value) return;
                const normalized = value.toString();
                if (!normalized.length) return;
                const lastTwo = normalized.slice(-2).padStart(2, '0');
                targets.push({
                    number: lastTwo,
                    prize: prizeIndex,
                    prizeName: this.prizeStructure[prizeIndex]?.name || `Giải ${prizeIndex}`,
                    elementIndex
                });
            });
        });

        return targets;
    }

    async analyzePositionSoiCau(date, days = 2, options = {}) {
        try {
            const mode = options.mode || 'special';
            // Validate số ngày
            if (days < 2 || days > 30) {
                throw new Error('Số ngày phải từ 2 đến 30');
            }

            const cacheKey = `position-soicau:${date}:${days}`;

            // Parse ngày
            const [day, month, year] = date.split('/').map(Number);
            const targetDate = new Date(year, month - 1, day);

            // Lấy dữ liệu các ngày (bỏ ngày hiện tại)
            // Với mode 'loto': lấy đủ 11 ngày để tính toán từ 3-10 lần liên tiếp (mỗi mức sẽ filter số ngày tương ứng)
            // Với mode 'special': lấy days + 1 ngày
            // Để có N lần match liên tiếp, cần N+1 ngày dữ liệu
            // Ví dụ: 3 lần = 4 ngày, 4 lần = 5 ngày, ..., 10 lần = 11 ngày
            const endOfDay = new Date(targetDate);
            endOfDay.setDate(endOfDay.getDate() - 1); // Bỏ ngày hiện tại
            endOfDay.setHours(23, 59, 59, 999);
            const startOfPeriod = new Date(endOfDay);

            if (mode === 'loto') {
                // Lấy đủ 11 ngày (cho 10 lần liên tiếp), nhưng mỗi mức sẽ chỉ sử dụng số ngày tương ứng
                startOfPeriod.setDate(startOfPeriod.getDate() - 10); // [endOfDay - 10, endOfDay] = 11 ngày
            } else {
                // Logic cũ cho special: [endOfDay - days, endOfDay] = days + 1 ngày
                startOfPeriod.setDate(startOfPeriod.getDate() - days);
            }
            startOfPeriod.setHours(0, 0, 0, 0);

            const dataDays = mode === 'loto' ? 11 : (days + 1);
            console.log(`📅 Lấy dữ liệu từ ${startOfPeriod.toLocaleDateString()} đến ${endOfDay.toLocaleDateString()} (${dataDays} ngày${mode === 'loto' ? ', cho loto 3-10 lần liên tiếp (mỗi mức dùng số ngày tương ứng)' : ''})`);

            const results = await XSMB.find({
                drawDate: { $gte: startOfPeriod, $lte: endOfDay },
                station: 'xsmb'
                // Bỏ điều kiện isComplete để lấy tất cả dữ liệu
            })
                .select('drawDate specialPrize firstPrize secondPrize threePrizes fourPrizes fivePrizes sixPrizes sevenPrizes')
                .sort({ drawDate: -1 })
                .lean();

            if (results.length < 2) {
                throw new Error(`Không đủ dữ liệu cho ${days} ngày phân tích`);
            }

            console.log(`🔍 Phân tích ${results.length} ngày dữ liệu`);

            // Tìm pattern vị trí
            // Với mode 'loto': tìm pattern với biên độ 1-10 (để có thể xét 3-10 lần liên tiếp)
            // Với mode 'special': dùng logic cũ
            const patternSearchDays = mode === 'loto' ? 10 : days;
            const patterns = this.findPositionPatterns(results, patternSearchDays, { mode });
            console.log(`📊 Tìm thấy ${patterns.length} pattern từ các ngày`);

            // Kiểm tra tính nhất quán
            let consistentPatterns = [];
            let predictions = [];
            let predictionsByLifetime = {};

            if (mode === 'loto') {
                // Xét từng mức riêng biệt với số ngày dữ liệu tương ứng
                // 3 lần = 4 ngày, 4 lần = 5 ngày, ..., 10 lần = 11 ngày
                const maxLifetime = 10;
                const minLifetime = 3;
                const allLifetimePatterns = {};
                const allLifetimePredictions = {}; // Lưu predictions theo từng mức

                for (let lifetime = maxLifetime; lifetime >= minLifetime; lifetime--) {
                    const requiredDays = lifetime + 1; // Số ngày dữ liệu cần thiết

                    // Chỉ sử dụng số ngày dữ liệu tương ứng cho mức này
                    const lifetimeResults = results.slice(0, requiredDays);

                    if (lifetimeResults.length < requiredDays) {
                        console.log(`⚠️ Không đủ ${requiredDays} ngày dữ liệu cho ${lifetime} lần liên tiếp, bỏ qua`);
                        continue;
                    }

                    console.log(`🔍 Tính toán ${lifetime} lần liên tiếp với ${requiredDays} ngày dữ liệu`);

                    // Tìm pattern với biên độ tối đa = lifetime (nhưng vẫn cho phép 1-10)
                    const lifetimePatterns = this.findPositionPatterns(lifetimeResults, Math.min(lifetime, 10), { mode });

                    // Kiểm tra tính nhất quán với số lần liên tiếp yêu cầu
                    // CHỈ lấy các pattern có ĐÚNG số lần liên tiếp bằng lifetime (không >=)
                    const consistentLifetimePatterns = this.validateConsistentPatterns(lifetimePatterns, {
                        mode,
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
                    const lifetimePredictions = this.predictFromPatterns(consistentLifetimePatterns, latestResult, { mode });

                    // Lưu predictions theo mức
                    allLifetimePredictions[lifetime] = lifetimePredictions;
                    console.log(`  ✅ ${lifetime} lần liên tiếp: ${consistentLifetimePatterns.length} pattern, ${lifetimePredictions.length} dự đoán`);
                }

                consistentPatterns = Object.values(allLifetimePatterns);
                console.log(`✅ Tìm thấy ${consistentPatterns.length} pattern nhất quán (xét từ ${maxLifetime} xuống ${minLifetime} lần liên tiếp)`);

                // Nhóm predictions theo lifetime (số lần liên tiếp)
                // Tránh trùng lặp GIỮA các lifetime: nếu số đã xuất hiện ở lifetime cao hơn, không hiển thị ở lifetime thấp hơn
                // NHƯNG trong cùng một lifetime: hiển thị đầy đủ tất cả các position (nếu số 07 có 2 position thì hiển thị 2 lần)
                // Xử lý từ cao xuống thấp (10 -> 3)
                predictionsByLifetime = {};
                const seenNumbers = new Set(); // Lưu các số đã xuất hiện ở lifetime cao hơn

                // Xử lý từng mức từ cao xuống thấp
                for (let lifetime = maxLifetime; lifetime >= minLifetime; lifetime--) {
                    const lifetimePredictions = allLifetimePredictions[lifetime] || [];

                    if (lifetimePredictions.length > 0) {
                        if (!predictionsByLifetime[lifetime]) {
                            predictionsByLifetime[lifetime] = [];
                        }

                        // Nhóm predictions theo số để kiểm tra xem số đã xuất hiện ở lifetime cao hơn chưa
                        const predictionsByNumber = new Map(); // Key: normalizedNumber, Value: array of predictions

                        lifetimePredictions.forEach(prediction => {
                            // Normalize số thành 2 chữ số (ví dụ: "5" -> "05", "55" -> "55")
                            const predictedNumber = String(prediction.predictedNumber || '').padStart(2, '0');
                            const normalizedNumber = predictedNumber.length === 2 ? predictedNumber : predictedNumber.slice(-2);

                            if (!predictionsByNumber.has(normalizedNumber)) {
                                predictionsByNumber.set(normalizedNumber, []);
                            }
                            predictionsByNumber.get(normalizedNumber).push(prediction);
                        });

                        // Chỉ thêm các số chưa xuất hiện ở lifetime cao hơn
                        // Nhưng thêm TẤT CẢ các predictions của số đó (để hiển thị đầy đủ các position)
                        predictionsByNumber.forEach((predictions, normalizedNumber) => {
                            // Nếu số này chưa xuất hiện ở lifetime cao hơn, thêm tất cả các predictions của nó
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

                // predictionsByLifetime đã được tạo ở trên với tất cả predictions của từng mức
                // Không bỏ trùng - cùng một số với position khác nhau sẽ được hiển thị đầy đủ

                // Sắp xếp các predictions trong mỗi nhóm theo số (tăng dần)
                Object.keys(predictionsByLifetime).forEach(lifetime => {
                    predictionsByLifetime[lifetime].sort((a, b) => {
                        const numA = parseInt(a.predictedNumber);
                        const numB = parseInt(b.predictedNumber);
                        return numA - numB;
                    });
                });

                // Tạo uniquePredictions từ predictionMap để làm predictions chính
                // (chỉ lấy lifetime lớn nhất cho mỗi position)
                const uniquePredictions = Array.from(predictionMap.values());
                predictions = uniquePredictions;
                console.log(`📊 Nhóm predictions theo lifetime: ${Object.keys(predictionsByLifetime).map(l => `${l} lần (${predictionsByLifetime[l].length} số)`).join(', ')}`);
            } else {
                // Logic cũ cho mode 'special'
                const requiredConsecutiveDays = Math.min(days, 2);
                consistentPatterns = this.validateConsistentPatterns(patterns, {
                    mode,
                    requiredConsecutiveDays
                });
                console.log(`✅ Tìm thấy ${consistentPatterns.length} pattern nhất quán`);

                const latestResult = results[0];
                predictions = this.predictFromPatterns(consistentPatterns, latestResult, { mode });
                console.log(`🎯 Tạo ra ${predictions.length} dự đoán cho ngày tiếp theo`);
            }

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
                analysisDays: days,
                totalResults: results.length,
                patternsFound: patterns.length,
                consistentPatterns: consistentPatterns.length,
                predictions: predictions, // Tất cả dự đoán (đã lọc chỉ lấy lifetime lớn nhất cho loto)
                predictionsByLifetime: predictionsByLifetime, // Nhóm theo số lần liên tiếp (3-10 lần cho loto)
                numberStatistics: sortedNumberStats, // Thống kê số lần xuất hiện
                tableStatistics: tableStats, // Bảng thống kê theo format "Đầu X"
                metadata: {
                    dataFrom: results[results.length - 1]?.drawDate,
                    dataTo: results[0]?.drawDate,
                    successRate: consistentPatterns.length > 0
                        ? Math.round(consistentPatterns[0].successRate * 100)
                        : 0,
                    mode,
                    dataDays: mode === 'loto' ? 11 : (days + 1) // Số ngày dữ liệu thực tế
                },
                detailedAnalysis: {
                    patterns,
                    consistentPatterns,
                    allPredictions: predictions
                }
            };

            // Cache kết quả
            console.log(`💾 Analysis completed: ${cacheKey}`);

            return response;

        } catch (error) {
            console.error('❌ Lỗi trong analyzePositionSoiCau:', error.message);
            throw error;
        }
    }
}

module.exports = new PositionAnalyzer();
