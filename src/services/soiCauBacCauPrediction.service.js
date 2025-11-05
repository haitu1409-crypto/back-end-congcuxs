/**
 * Service dự đoán Soi Cầu Bắc Cầu
 * Sử dụng nhiều thuật toán để phát hiện quy luật và dự đoán 2 số cuối
 */

const XSMB = require('../models/xsmb.model');

class SoiCauBacCauPredictionService {
    constructor() {
        this.algorithmNames = {
            PATTERN_MATCH: 'PATTERN_MATCH',
            SEQUENCE_ANALYSIS: 'SEQUENCE_ANALYSIS',
            RELATIVE_POSITION: 'RELATIVE_POSITION',
            FREQUENCY_ANALYSIS: 'FREQUENCY_ANALYSIS',
            DIFFERENCE_PATTERN: 'DIFFERENCE_PATTERN',
            CYCLIC_PATTERN: 'CYCLIC_PATTERN',
            SUM_PATTERN: 'SUM_PATTERN',
            DELTA_ANALYSIS: 'DELTA_ANALYSIS'
        };
    }

    /**
     * Format số thành chuỗi 2 chữ số
     */
    formatTwoDigits(num) {
        return num.toString().padStart(2, '0');
    }

    /**
     * Parse vị trí từ position string
     */
    parsePosition(positionStr) {
        if (!positionStr) return null;
        const match = positionStr.match(/\((\d+)-(\d+)-(\d+)\)/);
        if (match) {
            return {
                prize: parseInt(match[1]),
                element: parseInt(match[2]),
                digit: parseInt(match[3])
            };
        }
        return null;
    }

    /**
     * THUẬT TOÁN 1: Pattern Matching
     * Tìm các pattern lặp lại trong lịch sử
     */
    findPatternMatching(statistics, targetCell) {
        const { weekIndex, dayIndex } = targetCell;
        const results = [];

        // Tìm các ô trước đó có cùng vị trí thứ trong tuần
        const historicalCells = statistics
            .map(stat => {
                const cellPos = this.calculateCellPosition(new Date(stat.drawDate.replace(/\//g, '-')), statistics[0]?.drawDate);
                return {
                    ...stat,
                    weekIndex: cellPos.weekIndex,
                    dayIndex: cellPos.dayIndex
                };
            })
            .filter(stat => stat.dayIndex === dayIndex && stat.weekIndex < weekIndex);

        if (historicalCells.length < 2) return results;

        // Tìm pattern từ 3-5 ô gần nhất
        const recentCells = historicalCells.slice(-5);
        const patterns = [];

        for (let patternLength = 2; patternLength <= recentCells.length && patternLength <= 4; patternLength++) {
            const recentPattern = recentCells.slice(-patternLength);
            const lastTwoDigits = recentPattern.map(cell => {
                const specialPrize = cell.prizes?.specialPrize?.[0];
                return specialPrize?.number?.slice(-2) || null;
            }).filter(n => n !== null);

            if (lastTwoDigits.length === patternLength) {
                patterns.push({
                    length: patternLength,
                    digits: lastTwoDigits,
                    confidence: 0.7 - (patternLength - 2) * 0.1
                });
            }
        }

        // Dự đoán dựa trên pattern
        if (patterns.length > 0) {
            const bestPattern = patterns[patterns.length - 1];
            if (bestPattern.length >= 2) {
                const predicted = bestPattern.digits[bestPattern.length - 1];
                results.push({
                    algorithm: this.algorithmNames.PATTERN_MATCH,
                    predicted: predicted,
                    confidence: bestPattern.confidence,
                    reasoning: `Phát hiện pattern lặp lại ${bestPattern.length} lần: ${bestPattern.digits.join(' → ')}`,
                    metadata: {
                        patternLength: bestPattern.length,
                        patternDigits: bestPattern.digits
                    }
                });
            }
        }

        return results;
    }

    /**
     * THUẬT TOÁN 2: Sequence Analysis
     * Phân tích dãy số theo chuỗi số học
     */
    findSequenceAnalysis(statistics, targetCell) {
        const { weekIndex, dayIndex } = targetCell;
        const results = [];

        const historicalCells = statistics
            .map(stat => {
                const cellPos = this.calculateCellPosition(new Date(stat.drawDate.replace(/\//g, '-')), statistics[0]?.drawDate);
                return {
                    ...stat,
                    weekIndex: cellPos.weekIndex,
                    dayIndex: cellPos.dayIndex,
                    lastTwoDigits: parseInt(stat.info?.lastTwoDigits || 0)
                };
            })
            .filter(stat => stat.dayIndex === dayIndex && stat.weekIndex < weekIndex)
            .map(cell => cell.lastTwoDigits);

        if (historicalCells.length < 3) return results;

        // Phân tích chuỗi số học: +d, -d, *m, /m
        const recentDigits = historicalCells.slice(-5);
        
        // Kiểm tra cộng trừ
        for (let i = recentDigits.length - 1; i >= 2; i--) {
            const diffs = [];
            for (let j = i; j > recentDigits.length - 5 && j > 0; j--) {
                diffs.push(Math.abs(recentDigits[j] - recentDigits[j-1]));
            }
            
            // Nếu các hiệu số giống nhau
            if (diffs.length >= 2 && diffs.every(d => d === diffs[0])) {
                const predicted = recentDigits[i] + diffs[0];
                results.push({
                    algorithm: this.algorithmNames.SEQUENCE_ANALYSIS,
                    predicted: this.formatTwoDigits(predicted % 100),
                    confidence: 0.6,
                    reasoning: `Phát hiện chuỗi cộng dần ${diffs[0]}: ${recentDigits.slice(i-2, i+1).map(d => this.formatTwoDigits(d)).join(' → ')}`,
                    metadata: {
                        sequenceType: 'arithmetic',
                        difference: diffs[0],
                        recentDigits: recentDigits.slice(i-2, i+1).map(d => this.formatTwoDigits(d))
                    }
                });
                break;
            }
        }

        return results;
    }

    /**
     * THUẬT TOÁN 3: Relative Position Analysis
     * Phân tích dựa trên vị trí tương đối trong bảng
     */
    findRelativePositionAnalysis(statistics, targetCell) {
        const { weekIndex, dayIndex } = targetCell;
        const results = [];

        // Lấy dữ liệu cùng vị trí cột (cùng thứ)
        const sameColumnCells = statistics
            .map(stat => {
                const cellPos = this.calculateCellPosition(new Date(stat.drawDate.replace(/\//g, '-')), statistics[0]?.drawDate);
                return {
                    ...stat,
                    weekIndex: cellPos.weekIndex,
                    dayIndex: cellPos.dayIndex,
                    lastTwoDigits: parseInt(stat.info?.lastTwoDigits || 0)
                };
            })
            .filter(stat => stat.dayIndex === dayIndex && stat.weekIndex < weekIndex);

        if (sameColumnCells.length < 3) return results;

        const recentCells = sameColumnCells.slice(-10);
        const lastTwoDigits = recentCells.map(c => c.lastTwoDigits);

        // Tính trung bình và độ lệch
        const mean = lastTwoDigits.reduce((a, b) => a + b, 0) / lastTwoDigits.length;
        const variance = lastTwoDigits.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / lastTwoDigits.length;
        const stdDev = Math.sqrt(variance);

        // Dự đoán dựa trên xu hướng
        if (lastTwoDigits.length >= 5) {
            const trend = lastTwoDigits.slice(-5);
            const predicted = trend[trend.length - 1];
            
            results.push({
                algorithm: this.algorithmNames.RELATIVE_POSITION,
                predicted: this.formatTwoDigits(predicted),
                confidence: 0.55,
                reasoning: `Dựa trên xu hướng vị trí cột: trung bình ${Math.round(mean)}, độ lệch ${Math.round(stdDev)}`,
                metadata: {
                    mean: Math.round(mean),
                    stdDev: Math.round(stdDev),
                    recentTrend: trend.map(d => this.formatTwoDigits(d))
                }
            });
        }

        return results;
    }

    /**
     * THUẬT TOÁN 4: Frequency Analysis
     * Phân tích tần suất xuất hiện của các chữ số
     */
    findFrequencyAnalysis(statistics, targetCell) {
        const { weekIndex, dayIndex } = targetCell;
        const results = [];

        const historicalCells = statistics
            .map(stat => {
                const cellPos = this.calculateCellPosition(new Date(stat.drawDate.replace(/\//g, '-')), statistics[0]?.drawDate);
                return {
                    ...stat,
                    weekIndex: cellPos.weekIndex,
                    dayIndex: cellPos.dayIndex,
                    lastTwoDigits: stat.info?.lastTwoDigits || ''
                };
            })
            .filter(stat => stat.dayIndex === dayIndex && stat.weekIndex < weekIndex)
            .slice(-20);

        if (historicalCells.length < 5) return results;

        // Đếm tần suất từng chữ số ở vị trí cuối
        const digitFreq = { tens: {}, ones: {} };
        
        historicalCells.forEach(cell => {
            const digits = cell.lastTwoDigits;
            if (digits && digits.length >= 2) {
                const tensDigit = digits[0];
                const onesDigit = digits[1];
                
                digitFreq.tens[tensDigit] = (digitFreq.tens[tensDigit] || 0) + 1;
                digitFreq.ones[onesDigit] = (digitFreq.ones[onesDigit] || 0) + 1;
            }
        });

        // Tìm chữ số có tần suất cao nhất
        const maxTens = Object.keys(digitFreq.tens).reduce((a, b) => 
            digitFreq.tens[a] > digitFreq.tens[b] ? a : b
        );
        const maxOnes = Object.keys(digitFreq.ones).reduce((a, b) => 
            digitFreq.ones[a] > digitFreq.ones[b] ? a : b
        );

        const predicted = maxTens + maxOnes;
        
        results.push({
            algorithm: this.algorithmNames.FREQUENCY_ANALYSIS,
            predicted: predicted,
            confidence: 0.5,
            reasoning: `Chữ số xuất hiện thường xuyên nhất: hàng chục = ${maxTens}, hàng đơn vị = ${maxOnes}`,
            metadata: {
                tensFrequency: digitFreq.tens[maxTens] || 0,
                onesFrequency: digitFreq.ones[maxOnes] || 0,
                totalSamples: historicalCells.length
            }
        });

        return results;
    }

    /**
     * THUẬT TOÁN 5: Difference Pattern
     * Phân tích pattern hiệu số giữa các số liên tiếp
     */
    findDifferencePattern(statistics, targetCell) {
        const { weekIndex, dayIndex } = targetCell;
        const results = [];

        const historicalCells = statistics
            .map(stat => {
                const cellPos = this.calculateCellPosition(new Date(stat.drawDate.replace(/\//g, '-')), statistics[0]?.drawDate);
                return {
                    ...stat,
                    weekIndex: cellPos.weekIndex,
                    dayIndex: cellPos.dayIndex,
                    lastTwoDigits: parseInt(stat.info?.lastTwoDigits || 0)
                };
            })
            .filter(stat => stat.dayIndex === dayIndex && stat.weekIndex < weekIndex)
            .map(cell => cell.lastTwoDigits)
            .slice(-8);

        if (historicalCells.length < 4) return results;

        // Phân tích pattern hiệu số
        const differences = [];
        for (let i = historicalCells.length - 1; i > 0; i--) {
            const diff = (historicalCells[i] - historicalCells[i-1] + 100) % 100;
            differences.unshift(diff);
        }

        // Tìm pattern lặp lại
        for (let patternLen = 2; patternLen <= Math.min(4, Math.floor(differences.length / 2)); patternLen++) {
            const recentDiff = differences.slice(-patternLen);
            const prevDiff = differences.slice(-patternLen * 2, -patternLen);
            
            if (JSON.stringify(recentDiff) === JSON.stringify(prevDiff)) {
                const nextDiff = recentDiff[0];
                const predicted = (historicalCells[historicalCells.length - 1] + nextDiff) % 100;
                
                results.push({
                    algorithm: this.algorithmNames.DIFFERENCE_PATTERN,
                    predicted: this.formatTwoDigits(predicted),
                    confidence: 0.65,
                    reasoning: `Pattern hiệu số lặp lại ${patternLen} lần: ${recentDiff.join(', ')}`,
                    metadata: {
                        patternLength: patternLen,
                        patternDifferences: recentDiff
                    }
                });
                break;
            }
        }

        return results;
    }

    /**
     * THUẬT TOÁN 6: Cyclic Pattern
     * Phát hiện chu kỳ lặp lại
     */
    findCyclicPattern(statistics, targetCell) {
        const { weekIndex, dayIndex } = targetCell;
        const results = [];

        const historicalCells = statistics
            .map(stat => {
                const cellPos = this.calculateCellPosition(new Date(stat.drawDate.replace(/\//g, '-')), statistics[0]?.drawDate);
                return {
                    ...stat,
                    weekIndex: cellPos.weekIndex,
                    dayIndex: cellPos.dayIndex,
                    lastTwoDigits: stat.info?.lastTwoDigits || ''
                };
            })
            .filter(stat => stat.dayIndex === dayIndex && stat.weekIndex < weekIndex)
            .slice(-20);

        if (historicalCells.length < 6) return results;

        const lastTwoDigits = historicalCells.map(c => c.lastTwoDigits);

        // Tìm chu kỳ từ 2 đến 7
        for (let cycle = 2; cycle <= Math.min(7, Math.floor(lastTwoDigits.length / 2)); cycle++) {
            const recentCycle = lastTwoDigits.slice(-cycle * 2);
            const firstHalf = recentCycle.slice(0, cycle);
            const secondHalf = recentCycle.slice(cycle);
            
            // Kiểm tra xem có phải là chu kỳ không
            let isCycle = true;
            for (let i = 0; i < cycle; i++) {
                if (firstHalf[i] !== secondHalf[i]) {
                    isCycle = false;
                    break;
                }
            }

            if (isCycle) {
                const predicted = firstHalf[0];
                results.push({
                    algorithm: this.algorithmNames.CYCLIC_PATTERN,
                    predicted: predicted,
                    confidence: 0.7,
                    reasoning: `Chu kỳ ${cycle} lần: ${firstHalf.join(' → ')} lặp lại`,
                    metadata: {
                        cycleLength: cycle,
                        cyclePattern: firstHalf
                    }
                });
                break;
            }
        }

        return results;
    }

    /**
     * THUẬT TOÁN 7: Sum Pattern
     * Phân tích tổng các chữ số
     */
    findSumPattern(statistics, targetCell) {
        const { weekIndex, dayIndex } = targetCell;
        const results = [];

        const historicalCells = statistics
            .map(stat => {
                const cellPos = this.calculateCellPosition(new Date(stat.drawDate.replace(/\//g, '-')), statistics[0]?.drawDate);
                return {
                    ...stat,
                    weekIndex: cellPos.weekIndex,
                    dayIndex: cellPos.dayIndex,
                    lastTwoDigits: parseInt(stat.info?.lastTwoDigits || 0)
                };
            })
            .filter(stat => stat.dayIndex === dayIndex && stat.weekIndex < weekIndex)
            .map(cell => cell.lastTwoDigits)
            .slice(-10);

        if (historicalCells.length < 3) return results;

        // Tính tổng và phân tích
        const sums = historicalCells.map(num => {
            const tens = Math.floor(num / 10);
            const ones = num % 10;
            return tens + ones;
        });

        // Kiểm tra pattern tổng
        const recentSums = sums.slice(-5);
        const meanSum = recentSums.reduce((a, b) => a + b, 0) / recentSums.length;

        // Dự đoán dựa trên trung bình
        const predictedSum = Math.round(meanSum);
        
        // Tìm số phù hợp với tổng này
        const candidates = [];
        for (let i = 0; i < 100; i++) {
            const tens = Math.floor(i / 10);
            const ones = i % 10;
            if (tens + ones === predictedSum) {
                candidates.push(i);
            }
        }

        if (candidates.length > 0) {
            // Chọn số gần với số gần nhất
            const lastNumber = historicalCells[historicalCells.length - 1];
            const predicted = candidates.reduce((a, b) => 
                Math.abs(a - lastNumber) < Math.abs(b - lastNumber) ? a : b
            );

            results.push({
                algorithm: this.algorithmNames.SUM_PATTERN,
                predicted: this.formatTwoDigits(predicted),
                confidence: 0.5,
                reasoning: `Tổng các chữ số ổn định: ${predictedSum}, chọn số ${predicted}`,
                metadata: {
                    meanSum: predictedSum,
                    candidates: candidates.length
                }
            });
        }

        return results;
    }

    /**
     * THUẬT TOÁN 8: Delta Analysis
     * Phân tích thay đổi theo thời gian
     */
    findDeltaAnalysis(statistics, targetCell) {
        const { weekIndex, dayIndex } = targetCell;
        const results = [];

        const historicalCells = statistics
            .map(stat => {
                const cellPos = this.calculateCellPosition(new Date(stat.drawDate.replace(/\//g, '-')), statistics[0]?.drawDate);
                return {
                    ...stat,
                    weekIndex: cellPos.weekIndex,
                    dayIndex: cellPos.dayIndex,
                    lastTwoDigits: parseInt(stat.info?.lastTwoDigits || 0)
                };
            })
            .filter(stat => stat.dayIndex === dayIndex && stat.weekIndex < weekIndex)
            .map(cell => cell.lastTwoDigits)
            .slice(-10);

        if (historicalCells.length < 3) return results;

        // Phân tích xu hướng
        const trend = [];
        for (let i = 1; i < historicalCells.length; i++) {
            const delta = (historicalCells[i] - historicalCells[i-1] + 100) % 100;
            if (delta > 50) {
                trend.push(-1); // Giảm
            } else if (delta < 50 && delta > 0) {
                trend.push(1); // Tăng
            } else {
                trend.push(0); // Giữ nguyên
            }
        }

        // Dự đoán dựa trên xu hướng
        const recentTrend = trend.slice(-3);
        const avgTrend = recentTrend.reduce((a, b) => a + b, 0) / recentTrend.length;

        const lastNumber = historicalCells[historicalCells.length - 1];
        const delta = Math.round(avgTrend * 5); // Nhân với 5 để tạo độ lệch
        const predicted = (lastNumber + delta + 100) % 100;

        results.push({
            algorithm: this.algorithmNames.DELTA_ANALYSIS,
            predicted: this.formatTwoDigits(predicted),
            confidence: 0.45,
            reasoning: `Xu hướng ${avgTrend > 0 ? 'tăng' : avgTrend < 0 ? 'giảm' : 'ổn định'}: dự đoán ${predicted}`,
            metadata: {
                avgTrend: avgTrend.toFixed(2),
                lastNumber: this.formatTwoDigits(lastNumber)
            }
        });

        return results;
    }

    /**
     * Tính vị trí ô trong bảng
     */
    calculateCellPosition(date, startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        
        const current = new Date(date);
        current.setHours(0, 0, 0, 0);
        
        const diffTime = current - start;
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
        
        const dayOfWeekIndex = (current.getDay() + 6) % 7;
        const weekIndex = Math.floor(diffDays / 7);
        
        return {
            weekIndex,
            dayIndex: dayOfWeekIndex
        };
    }

    /**
     * Chạy tất cả các thuật toán và tổng hợp kết quả
     */
    async predictNextCell(statistics, targetWeekIndex, targetDayIndex) {
        try {
            const targetCell = {
                weekIndex: targetWeekIndex,
                dayIndex: targetDayIndex
            };

            // Chạy tất cả các thuật toán
            const allPredictions = [
                ...this.findPatternMatching(statistics, targetCell),
                ...this.findSequenceAnalysis(statistics, targetCell),
                ...this.findRelativePositionAnalysis(statistics, targetCell),
                ...this.findFrequencyAnalysis(statistics, targetCell),
                ...this.findDifferencePattern(statistics, targetCell),
                ...this.findCyclicPattern(statistics, targetCell),
                ...this.findSumPattern(statistics, targetCell),
                ...this.findDeltaAnalysis(statistics, targetCell)
            ];

            // Xếp hạng theo confidence
            allPredictions.sort((a, b) => b.confidence - a.confidence);

            // Tổng hợp top predictions
            const topPredictions = allPredictions.slice(0, 5);

            // Tính trung bình weighted confidence cho các số trùng lặp
            const predictionMap = {};
            allPredictions.forEach(pred => {
                if (!predictionMap[pred.predicted]) {
                    predictionMap[pred.predicted] = {
                        predicted: pred.predicted,
                        algorithms: [],
                        totalConfidence: 0,
                        count: 0
                    };
                }
                predictionMap[pred.predicted].algorithms.push(pred.algorithm);
                predictionMap[pred.predicted].totalConfidence += pred.confidence;
                predictionMap[pred.predicted].count += 1;
            });

            // Chuyển đổi thành array và tính avg confidence
            const aggregatedPredictions = Object.values(predictionMap).map(p => ({
                predicted: p.predicted,
                confidence: p.totalConfidence / p.count,
                algorithmCount: p.count,
                algorithms: p.algorithms
            }));

            // Sắp xếp theo confidence và count
            aggregatedPredictions.sort((a, b) => {
                if (Math.abs(a.confidence - b.confidence) < 0.05) {
                    return b.algorithmCount - a.algorithmCount;
                }
                return b.confidence - a.confidence;
            });

            return {
                success: true,
                targetCell,
                totalAlgorithmsRun: allPredictions.length,
                topPredictions,
                aggregatedPredictions: aggregatedPredictions.slice(0, 10),
                allPredictions: allPredictions.slice(0, 10),
                summary: {
                    highestConfidence: aggregatedPredictions[0]?.confidence || 0,
                    mostRecommended: aggregatedPredictions[0]?.predicted || null,
                    algorithmConsensus: aggregatedPredictions.filter(p => p.algorithmCount >= 2).length
                }
            };

        } catch (error) {
            console.error('❌ Lỗi khi dự đoán:', error);
            throw error;
        }
    }
}

module.exports = new SoiCauBacCauPredictionService();

