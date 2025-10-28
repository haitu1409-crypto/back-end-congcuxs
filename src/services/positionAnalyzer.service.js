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
    findPositionPatterns(results, targetDays) {
        const patterns = [];

        if (results.length < 2) return patterns; // Cần ít nhất 2 ngày

        console.log(`🔍 Bắt đầu soi cầu vị trí cho ${targetDays} ngày`);

        // FIX: Tìm pattern trong biên độ targetDays, không chỉ 2 ngày liên tiếp
        for (let currentIndex = 0; currentIndex < results.length - 1; currentIndex++) {
            const currentResult = results[currentIndex]; // Ngày hiện tại
            const targetNumber = currentResult.specialPrize[0].slice(-2);

            console.log(`📅 Tìm vị trí tạo ra ${targetNumber} trong biên độ ${targetDays} ngày`);

            // Tìm trong tất cả các ngày trước đó trong biên độ
            for (let previousIndex = currentIndex + 1; previousIndex < Math.min(currentIndex + targetDays + 1, results.length); previousIndex++) {
                const previousResult = results[previousIndex]; // Ngày trước trong biên độ

                if (!previousResult || !currentResult) continue;
                if (!Array.isArray(previousResult.specialPrize) || !previousResult.specialPrize[0]) continue;
                if (!Array.isArray(currentResult.specialPrize) || !currentResult.specialPrize[0]) continue;

                const biendDo = previousIndex - currentIndex; // Tính biên độ thực tế
                console.log(`  🔍 Kiểm tra ngày ${previousIndex} (biên độ ${biendDo} ngày)`);

                const previousPositions = this.analyzePositions(previousResult);

                // Tìm tất cả cặp vị trí có thể tạo ra số mục tiêu
                const validPairs = this.findValidPositionPairs(previousPositions, targetNumber);

                // Thêm tìm kiếm pattern đơn lẻ (không cần cặp)
                const singlePatterns = this.findSinglePositionPatterns(previousPositions, targetNumber);

                if (validPairs.length > 0 || singlePatterns.length > 0) {
                    console.log(`  ✅ Tìm thấy ${validPairs.length} cặp vị trí và ${singlePatterns.length} vị trí đơn lẻ (biên độ ${biendDo} ngày)`);
                    patterns.push({
                        dayIndex: currentIndex,
                        previousIndex: previousIndex,
                        targetNumber: targetNumber,
                        validPairs,
                        singlePatterns,
                        date: previousResult.drawDate,
                        nextDate: currentResult.drawDate,
                        biendDo: biendDo // Biên độ thực tế
                    });
                }
            }
        }

        return patterns;
    }

    /**
     * Tìm các cặp vị trí hợp lệ tạo ra số mục tiêu
     * @param {Array} positions - Mảng vị trí số
     * @param {string} targetNumber - Số mục tiêu (2 chữ số)
     * @returns {Array} Mảng các cặp vị trí hợp lệ
     */
    findValidPositionPairs(positions, targetNumber) {
        const validPairs = [];

        for (let i = 0; i < positions.length; i++) {
            for (let j = i + 1; j < positions.length; j++) {
                const pos1 = positions[i];
                const pos2 = positions[j];

                // Tạo số từ 2 vị trí
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
     * Tìm pattern vị trí đơn lẻ (không cần cặp)
     * @param {Array} positions - Mảng vị trí số
     * @param {string} targetNumber - Số mục tiêu (2 chữ số)
     * @returns {Array} Mảng các vị trí đơn lẻ hợp lệ
     */
    findSinglePositionPatterns(positions, targetNumber) {
        const singlePatterns = [];

        // Tìm vị trí có 2 chữ số liên tiếp tạo ra số mục tiêu
        for (let i = 0; i < positions.length - 1; i++) {
            const pos1 = positions[i];
            const pos2 = positions[i + 1];

            // Kiểm tra nếu 2 vị trí liên tiếp tạo ra số mục tiêu
            if (pos1.prize === pos2.prize && pos1.element === pos2.element &&
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
    validateConsistentPatterns(patterns) {
        const consistentPatterns = [];

        console.log(`🔍 Kiểm tra tính nhất quán của ${patterns.length} pattern`);
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

        patterns.forEach(pattern => {
            // Xử lý cặp vị trí
            pattern.validPairs.forEach(pair => {
                const key = `${pair.position1.position}-${pair.position2.position}`;
                if (!positionGroups[key]) {
                    positionGroups[key] = [];
                }
                positionGroups[key].push({
                    ...pair,
                    dayIndex: pattern.dayIndex,
                    targetNumber: pattern.targetNumber
                });
            });

            // Xử lý pattern đơn lẻ
            pattern.singlePatterns.forEach(single => {
                const key = single.type === 'consecutive'
                    ? `${single.position1.position}-${single.position2.position}`
                    : `${single.position.position}-${single.type}`;
                if (!singlePatternGroups[key]) {
                    singlePatternGroups[key] = [];
                }
                singlePatternGroups[key].push({
                    ...single,
                    dayIndex: pattern.dayIndex,
                    targetNumber: pattern.targetNumber
                });
            });
        });

        // Tìm các vị trí xuất hiện nhất quán (cặp vị trí)
        Object.entries(positionGroups).forEach(([positionKey, pairs]) => {
            if (pairs.length >= 1) {
                // FIX: Với biên độ > 2 ngày, không yêu cầu liên tiếp, chỉ cần xuất hiện đủ lần
                const sortedPairs = pairs.sort((a, b) => a.dayIndex - b.dayIndex);

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
                        consecutiveDays: pairs.length, // Số lần xuất hiện thực tế
                        type: 'pair'
                    });
                }
            }
        });

        // Tìm các pattern đơn lẻ nhất quán
        Object.entries(singlePatternGroups).forEach(([positionKey, singles]) => {
            if (singles.length >= 1) {
                // FIX: Với biên độ > 2 ngày, không yêu cầu liên tiếp, chỉ cần xuất hiện đủ lần
                const sortedSingles = singles.sort((a, b) => a.dayIndex - b.dayIndex);

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
                        consecutiveDays: singles.length, // Số lần xuất hiện thực tế
                        type: 'single'
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

        console.log(`🎯 Ngưỡng độ tin cậy: ${Math.round(minConfidence * 100)}% (${consistentPatterns.length} pattern nhất quán)`);
        const topPatterns = consistentPatterns.filter(p => p.successRate >= minConfidence);
        console.log(`📊 Pattern đạt ngưỡng: ${topPatterns.length}/${consistentPatterns.length}`);

        topPatterns.forEach(pattern => {
            // Xử lý pattern cặp vị trí
            if (pattern.type === 'pair' && pattern.pairs && pattern.pairs.length > 0) {
                const pair = pattern.pairs[0]; // Lấy cặp đầu tiên
                const pos1 = pair.position1;
                const pos2 = pair.position2;

                // Tìm số ở vị trí tương ứng trong kết quả hiện tại (ngày 21/10/2025)
                const pos1Number = this.getNumberAtPosition(currentResult, pos1.prize, pos1.element, pos1.index);
                const pos2Number = this.getNumberAtPosition(currentResult, pos2.prize, pos2.element, pos2.index);

                if (pos1Number && pos2Number) {
                    const predictedNumber = pos1Number + pos2Number;
                    const key = `${predictedNumber}-${pos1.position}-${pos2.position}`;

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
                            method: `Vị trí ${pos1.position} + ${pos2.position}`,
                            confidence: Math.round(pattern.successRate * 100)
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

                    if (pos1Number && pos2Number) {
                        const predictedNumber = pos1Number + pos2Number;
                        predictions.push({
                            predictedNumber,
                            position1: single.position1.position,
                            position2: single.position2.position,
                            number1: pos1Number,
                            number2: pos2Number,
                            successRate: pattern.successRate,
                            totalOccurrences: pattern.totalOccurrences,
                            method: `Vị trí liên tiếp ${single.position1.position} + ${single.position2.position}`,
                            confidence: Math.round(pattern.successRate * 100)
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
    async analyzePositionSoiCau(date, days = 2) {
        try {
            // Validate số ngày
            if (days < 2 || days > 30) {
                throw new Error('Số ngày phải từ 2 đến 30');
            }

            const cacheKey = `position-soicau:${date}:${days}`;

            // Parse ngày
            const [day, month, year] = date.split('/').map(Number);
            const targetDate = new Date(year, month - 1, day);

            // Lấy dữ liệu các ngày (bỏ ngày hiện tại)
            const endOfDay = new Date(targetDate);
            endOfDay.setDate(endOfDay.getDate() - 1); // Bỏ ngày hiện tại (22/10)
            endOfDay.setHours(23, 59, 59, 999);
            const startOfPeriod = new Date(endOfDay);
            startOfPeriod.setDate(startOfPeriod.getDate() - days + 1); // Lấy đúng số ngày yêu cầu
            startOfPeriod.setHours(0, 0, 0, 0);

            console.log(`📅 Lấy dữ liệu từ ${startOfPeriod.toLocaleDateString()} đến ${endOfDay.toLocaleDateString()}`);

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
            const patterns = this.findPositionPatterns(results, days);
            console.log(`📊 Tìm thấy ${patterns.length} pattern từ các ngày`);

            // Kiểm tra tính nhất quán
            const consistentPatterns = this.validateConsistentPatterns(patterns);
            console.log(`✅ Tìm thấy ${consistentPatterns.length} pattern nhất quán`);

            // Dự đoán dựa trên pattern - sử dụng dữ liệu ngày 21/10/2025 để dự đoán cho ngày 22/10/2025
            const latestResult = results[0]; // Ngày 21/10/2025
            const predictions = this.predictFromPatterns(consistentPatterns, latestResult);
            console.log(`🎯 Tạo ra ${predictions.length} dự đoán cho ngày tiếp theo`);

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
                predictions: predictions, // Tất cả dự đoán
                numberStatistics: sortedNumberStats, // Thống kê số lần xuất hiện
                tableStatistics: tableStats, // Bảng thống kê theo format "Đầu X"
                metadata: {
                    dataFrom: results[results.length - 1]?.drawDate,
                    dataTo: results[0]?.drawDate,
                    successRate: consistentPatterns.length > 0
                        ? Math.round(consistentPatterns[0].successRate * 100)
                        : 0
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
