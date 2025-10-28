const NodeCache = require('node-cache');
const XSMB = require('../models/xsmb.model');

/**
 * Advanced Soi Cầu Service - Tích hợp tất cả phương pháp soi cầu cao cấp
 * 
 * Phương pháp áp dụng:
 * 1. Pattern Recognition (Nhận dạng mẫu)
 * 2. Cycle Analysis (Phân tích chu kỳ)
 * 3. Hot/Cold Number Analysis (Phân tích số nóng/lạnh)
 * 4. Adjacent Number Prediction (Dự đoán số lân cận)
 * 5. Mathematical Sequences (Dãy số toán học)
 * 6. Statistical Distribution (Phân phối thống kê)
 * 7. Time-Series Analysis (Phân tích chuỗi thời gian)
 * 8. Ensemble Learning (Học tập tập hợp)
 */
class AdvancedSoiCauService {
    constructor() {
        this.cache = new NodeCache({ stdTTL: 1800 });
        console.log('✅ AdvancedSoiCauService initialized with all methods');
    }

    /**
     * Main prediction method - Tích hợp tất cả phương pháp
     * @param {Date} date - Ngày dự đoán
     * @param {number} days - Số ngày dữ liệu lịch sử
     * @param {string} type - 'de' (Đề) hoặc 'lo' (Lô) hoặc 'both' (Cả hai)
     * @returns {Object} Predictions
     */
    async predict(date, days = 100, type = 'lo') {
        const historicalData = await this.getHistoricalData(date, days);

        if (historicalData.length < 7) {
            throw new Error('Không đủ dữ liệu lịch sử (cần ít nhất 7 ngày)');
        }

        console.log(`🚀 Starting Advanced Soi Cầu for ${date.toISOString().split('T')[0]} - Type: ${type.toUpperCase()}`);

        // 🤖 AI STEP 1: Feature Engineering (Auto-extract features)
        const features = this.extractAdvancedFeatures(historicalData, type);
        console.log(`🤖 Extracted ${Object.keys(features).length} advanced features`);

        // 🤖 AI STEP 2: Multiple prediction methods
        const methods = {
            patternRecognition: this.patternRecognitionMethod(historicalData, type),
            cycleAnalysis: this.cycleAnalysisMethod(historicalData, type),
            hotColdAnalysis: this.hotColdAnalysisMethod(historicalData, type),
            adjacentPrediction: this.adjacentNumberMethod(historicalData, type),
            mathematicalSequence: this.mathematicalSequenceMethod(historicalData, type),
            statisticalDistribution: this.statisticalDistributionMethod(historicalData, type),
            timeSeriesAnalysis: this.timeSeriesAnalysisMethod(historicalData, type),
            // 🧠 NEW AI METHOD: Deep Pattern Learning
            deepPatternLearning: this.deepPatternLearningMethod(historicalData, features, type)
        };

        // 🤖 AI STEP 3: Ensemble weights based on historical accuracy (Machine Learning)
        const ensembleWeights = await this.calculateDynamicWeights(historicalData, type);

        // 🤖 AI STEP 4: Combine all methods with weighted ensemble (with uncertainty estimation)
        let finalProbabilities = this.combineMethods(methods, ensembleWeights);

        // 🤖 AI STEP 5: Apply Reinforcement Learning penalty
        finalProbabilities = this.applyReinforcementLearning(finalProbabilities, historicalData, type);

        console.log(`✅ Advanced Soi Cầu completed with full AI pipeline (Type: ${type.toUpperCase()})`);
        return finalProbabilities;
    }

    /**
     * Method 1: Pattern Recognition
     * Nhận dạng các pattern phức tạp trong lịch sử
     */
    patternRecognitionMethod(historicalData, type = 'lo') {
        const predictions = {};
        const yesterday = historicalData[0];

        // Tìm các ngày có pattern tương tự với hôm qua
        const similarDays = this.findSimilarDays(yesterday, historicalData, type);

        // Lấy các số xuất hiện vào ngày tiếp theo của các ngày tương tự
        const nextNumbers = {};
        similarDays.forEach(day => {
            day.nextNumbers.forEach(num => {
                nextNumbers[num] = (nextNumbers[num] || 0) + day.similarity;
            });
        });

        // Normalize to probabilities
        const totalWeight = Object.values(nextNumbers).reduce((sum, w) => sum + w, 0);

        for (let i = 0; i < 100; i++) {
            const num = i.toString().padStart(2, '0');
            predictions[num] = nextNumbers[num] / totalWeight || 0;
        }

        console.log(`📊 Pattern Recognition: Found ${similarDays.length} similar patterns (Type: ${type})`);
        return predictions;
    }

    /**
     * Method 2: Cycle Analysis
     * Phân tích chu kỳ xuất hiện của các số
     */
    cycleAnalysisMethod(historicalData, type = 'lo') {
        const predictions = {};
        const cycles = {}; // Track cycle for each number

        // Calculate average cycle for each number
        for (let i = 0; i < 100; i++) {
            const num = i.toString().padStart(2, '0');
            const occurrences = [];

            historicalData.forEach((result, idx) => {
                if (this.hasNumber(result, num, type)) {
                    occurrences.push(idx);
                }
            });

            if (occurrences.length > 1) {
                const intervals = [];
                for (let j = 1; j < occurrences.length; j++) {
                    intervals.push(occurrences[j] - occurrences[j - 1]);
                }

                const avgCycle = intervals.reduce((sum, i) => sum + i, 0) / intervals.length;
                cycles[num] = avgCycle;

                // Predict based on cycle - higher probability if cycle is "due"
                const lastOccurrence = occurrences[0];
                const daysSinceLast = lastOccurrence;
                const cyclePosition = daysSinceLast % avgCycle;

                // Peak probability when cycle is complete
                predictions[num] = Math.cos(cyclePosition * 2 * Math.PI / avgCycle) * 0.5 + 0.5;
            } else {
                predictions[num] = 0;
            }
        }

        // Normalize
        const max = Math.max(...Object.values(predictions));
        Object.keys(predictions).forEach(num => {
            predictions[num] = max > 0 ? predictions[num] / max : 0;
        });

        console.log(`🔄 Cycle Analysis: Calculated cycles for all numbers`);
        return predictions;
    }

    /**
     * Method 3: Hot/Cold Number Analysis
     * Phân tích số nóng (xuất hiện nhiều) và số lạnh (ít xuất hiện)
     */
    hotColdAnalysisMethod(historicalData, type = 'lo') {
        const predictions = {};

        // Recent window (last 10 days)
        const recentData = historicalData.slice(0, 10);
        const olderData = historicalData.slice(10);

        const recentFreq = {};
        const olderFreq = {};

        // Count frequencies
        [...recentData, ...olderData].forEach(result => {
            this.getAllNumbers(result, type).forEach(num => {
                if (recentData.includes(result)) {
                    recentFreq[num] = (recentFreq[num] || 0) + 1;
                } else {
                    olderFreq[num] = (olderFreq[num] || 0) + 1;
                }
            });
        });

        // Calculate hot/cold scores
        for (let i = 0; i < 100; i++) {
            const num = i.toString().padStart(2, '0');
            const recentCount = recentFreq[num] || 0;
            const olderCount = olderFreq[num] || 0;

            // Hot numbers: appeared frequently recently
            // Cold numbers: didn't appear recently but may be "due"
            const hotScore = recentCount / recentData.length;
            const coldScore = 1 - (recentCount / 10); // Inverse of hot

            // Balance: prefer cold numbers slightly (they're "due")
            predictions[num] = hotScore * 0.3 + coldScore * 0.7;
        }

        console.log(`🔥 Hot/Cold Analysis: Identified hot and cold numbers`);
        return predictions;
    }

    /**
     * Method 4: Adjacent Number Prediction
     * Dự đoán dựa trên số lân cận
     */
    adjacentNumberMethod(historicalData, type = 'lo') {
        const predictions = {};
        const adjacencyMap = {}; // number -> adjacent numbers frequency

        historicalData.forEach((result, idx) => {
            if (idx === 0) return;

            const prevNumbers = this.getAllNumbers(result, type);
            const currNumbers = this.getAllNumbers(historicalData[idx - 1], type);

            // Track what numbers appear after each number
            prevNumbers.forEach(num => {
                if (!adjacencyMap[num]) adjacencyMap[num] = {};

                currNumbers.forEach(nextNum => {
                    adjacencyMap[num][nextNum] = (adjacencyMap[num][nextNum] || 0) + 1;
                });
            });
        });

        // Get yesterday's numbers
        const yesterdayNumbers = this.getAllNumbers(historicalData[0], type);

        // Predict based on adjacency
        for (let i = 0; i < 100; i++) {
            const num = i.toString().padStart(2, '0');
            let score = 0;

            yesterdayNumbers.forEach(yesterNum => {
                if (adjacencyMap[yesterNum] && adjacencyMap[yesterNum][num]) {
                    score += adjacencyMap[yesterNum][num];
                }
            });

            predictions[num] = score;
        }

        // Normalize
        const max = Math.max(...Object.values(predictions));
        Object.keys(predictions).forEach(num => {
            predictions[num] = max > 0 ? predictions[num] / max : 0;
        });

        console.log(`🔗 Adjacent Number: Built adjacency patterns`);
        return predictions;
    }

    /**
     * Method 5: Mathematical Sequences
     * Phát hiện các dãy số toán học
     */
    mathematicalSequenceMethod(historicalData) {
        const predictions = {};

        // Extract sequences from history
        const sequences = [];
        for (let i = 0; i < Math.min(historicalData.length - 4, 10); i++) {
            const sequence = [];

            for (let j = 0; j < 5; j++) {
                const de = this.getDe(historicalData[i + j]);
                if (de) sequence.push(parseInt(de));
            }

            if (sequence.length === 5) {
                sequences.push(sequence);
            }
        }

        // Try to predict next number using patterns
        for (let i = 0; i < 100; i++) {
            const num = i.toString().padStart(2, '0');
            const numVal = parseInt(num);

            let score = 0;

            sequences.forEach(seq => {
                // Check if this number fits the sequence pattern
                const diff1 = seq[1] - seq[0];
                const diff2 = seq[2] - seq[1];
                const diff3 = seq[3] - seq[2];
                const diff4 = seq[4] - seq[3];

                // Check arithmetic sequence
                if (diff1 === diff2 && diff2 === diff3 && diff3 === diff4) {
                    const expectedNext = seq[4] + diff1;
                    if ((expectedNext % 100) === numVal) score += 2;
                }

                // Check if differences form a pattern
                if (diff1 - diff2 === diff2 - diff3 && diff2 - diff3 === diff3 - diff4) {
                    const nextDiff = diff4 + (diff4 - diff3);
                    const expectedNext = seq[4] + nextDiff;
                    if ((expectedNext % 100) === numVal) score += 1.5;
                }
            });

            predictions[num] = score;
        }

        // Normalize
        const max = Math.max(...Object.values(predictions));
        Object.keys(predictions).forEach(num => {
            predictions[num] = max > 0 ? predictions[num] / max : 0;
        });

        console.log(`🧮 Mathematical Sequences: Analyzed ${sequences.length} sequences`);
        return predictions;
    }

    /**
     * Method 6: Statistical Distribution
     * Phân tích phân phối thống kê
     */
    statisticalDistributionMethod(historicalData, type = 'lo') {
        const predictions = {};
        const frequencies = {};

        // Count all occurrences
        historicalData.forEach(result => {
            this.getAllNumbers(result, type).forEach(num => {
                frequencies[num] = (frequencies[num] || 0) + 1;
            });
        });

        // Calculate mean and std dev
        const values = Object.values(frequencies);
        const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
        const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
        const stdDev = Math.sqrt(variance);

        // Predict based on deviation from expected frequency
        for (let i = 0; i < 100; i++) {
            const num = i.toString().padStart(2, '0');
            const freq = frequencies[num] || 0;
            const zScore = (freq - mean) / stdDev;

            // Numbers that are significantly below mean (cold) have higher probability
            if (zScore < -1) {
                predictions[num] = 1 - Math.abs(zScore) / 3; // Inverse relationship
            } else {
                predictions[num] = 0.2; // Baseline
            }
        }

        console.log(`📈 Statistical Distribution: Mean=${mean.toFixed(2)}, StdDev=${stdDev.toFixed(2)}`);
        return predictions;
    }

    /**
     * Method 7: Time-Series Analysis
     * Phân tích chuỗi thời gian
     */
    timeSeriesAnalysisMethod(historicalData) {
        const predictions = {};
        const timeSeries = [];

        // Build time series
        historicalData.forEach(result => {
            const de = this.getDe(result);
            if (de) timeSeries.push(parseInt(de));
        });

        // Autocorrelation analysis
        const autocorrelations = {};
        for (let lag = 1; lag <= 7; lag++) {
            if (timeSeries.length <= lag) continue;

            let correlation = 0;
            for (let i = lag; i < timeSeries.length; i++) {
                correlation += Math.abs(timeSeries[i] - timeSeries[i - lag]);
            }
            autocorrelations[lag] = 1 / (1 + correlation / (timeSeries.length - lag));
        }

        // Trend analysis
        const recentTrend = timeSeries.slice(0, 7);
        let trend = 0;
        for (let i = 1; i < recentTrend.length; i++) {
            trend += recentTrend[i] - recentTrend[i - 1];
        }
        trend = trend / (recentTrend.length - 1);

        // Predict next number based on trend
        const lastNumber = timeSeries[0];
        const expectedNumber = Math.round(lastNumber + trend) % 100;

        // Assign probability based on distance from expected
        for (let i = 0; i < 100; i++) {
            const num = i.toString().padStart(2, '0');
            const numVal = parseInt(num);
            const distance = Math.abs(numVal - expectedNumber);

            // Gaussian-like probability distribution
            predictions[num] = Math.exp(-Math.pow(distance, 2) / 50);
        }

        console.log(`📊 Time-Series: Expected trend=${trend.toFixed(2)}`);
        return predictions;
    }

    /**
     * Combine all methods with dynamic weights - ADVANCED AI LOGIC
     */
    combineMethods(methods, weights) {
        const combined = {};
        const methodNames = Object.keys(methods);

        // Initialize
        for (let i = 0; i < 100; i++) {
            combined[i.toString().padStart(2, '0')] = 0;
        }

        // Calculate variance across methods for each number (uncertainty)
        const uncertainties = {};
        for (let i = 0; i < 100; i++) {
            const num = i.toString().padStart(2, '0');
            const values = methodNames.map((_, idx) => methods[methodNames[idx]][num] || 0);
            const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
            const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
            uncertainties[num] = Math.sqrt(variance);
        }

        // Weighted sum with confidence adjustment
        Object.keys(methods).forEach((methodName, idx) => {
            const methodResults = methods[methodName];
            const weight = weights[idx] || (1 / methodNames.length);

            Object.keys(methodResults).forEach(num => {
                const baseValue = methodResults[num] || 0;
                const uncertainty = uncertainties[num];

                // Reduce weight for uncertain predictions (high variance across methods)
                const confidenceFactor = Math.exp(-uncertainty * 2); // Exponential decay
                const adjustedWeight = weight * (0.5 + 0.5 * confidenceFactor); // 50-100% of original

                combined[num] += baseValue * adjustedWeight;
            });
        });

        // Apply entropy-based smoothing (reduce extreme predictions)
        const entropy = this.calculateEntropy(combined);
        const smoothingFactor = 1 - (entropy / Math.log2(100)); // 0-1 scale
        const smoothingWeight = smoothingFactor * 0.1; // Max 10% smoothing

        for (let i = 0; i < 100; i++) {
            const num = i.toString().padStart(2, '0');
            const expectedValue = 1 / 100; // Uniform distribution
            combined[num] = combined[num] * (1 - smoothingWeight) + expectedValue * smoothingWeight;
        }

        console.log(`🔬 Advanced combine: entropy=${entropy.toFixed(3)}, smoothing=${(smoothingWeight * 100).toFixed(1)}%`);

        return combined;
    }

    /**
     * Calculate entropy of probability distribution
     * Lower entropy = more concentrated (risky), higher = more spread out (safe)
     */
    calculateEntropy(probabilities) {
        let entropy = 0;
        const total = Object.values(probabilities).reduce((sum, p) => sum + p, 0);

        if (total === 0) return Math.log2(100); // Max entropy

        for (let i = 0; i < 100; i++) {
            const num = i.toString().padStart(2, '0');
            const p = (probabilities[num] || 0) / total;
            if (p > 0) {
                entropy -= p * Math.log2(p);
            }
        }

        return entropy;
    }

    /**
     * Calculate dynamic weights based on historical accuracy - CORE AI LOGIC
     * Test each method on historical data and weight by actual accuracy
     */
    async calculateDynamicWeights(historicalData, type = 'lo') {
        if (historicalData.length < 14) {
            // Not enough data for validation, use default weights
            console.log('⚠️ Not enough historical data for dynamic weights, using defaults');
            return [0.15, 0.15, 0.15, 0.12, 0.12, 0.15, 0.16]; // Pattern, Cycle, Hot/Cold, Adjacent, Math, Stats, Time-Series
        }

        // Train on first N-7 days, validate on last 7 days
        const trainData = historicalData.slice(7); // Older data
        const testData = historicalData.slice(0, 7); // Recent 7 days

        const methodAccuracies = [];

        // Method 1: Pattern Recognition
        const patternAcc = this.validateMethod('pattern', trainData, testData, type);
        methodAccuracies.push(patternAcc);

        // Method 2: Cycle Analysis
        const cycleAcc = this.validateMethod('cycle', trainData, testData, type);
        methodAccuracies.push(cycleAcc);

        // Method 3: Hot/Cold
        const hotColdAcc = this.validateMethod('hotCold', trainData, testData, type);
        methodAccuracies.push(hotColdAcc);

        // Method 4: Adjacent
        const adjacentAcc = this.validateMethod('adjacent', trainData, testData, type);
        methodAccuracies.push(adjacentAcc);

        // Method 5: Mathematical
        const mathAcc = this.validateMethod('math', trainData, testData, type);
        methodAccuracies.push(mathAcc);

        // Method 6: Statistical
        const statsAcc = this.validateMethod('stats', trainData, testData, type);
        methodAccuracies.push(statsAcc);

        // Method 7: Time-Series
        const timeSeriesAcc = this.validateMethod('timeSeries', trainData, testData, type);
        methodAccuracies.push(timeSeriesAcc);

        // Convert accuracies to weights using softmax-like normalization
        const totalAcc = methodAccuracies.reduce((sum, acc) => sum + acc, 0);
        const baseWeight = 1 / methodAccuracies.length; // Equal weight baseline
        const weights = methodAccuracies.map(acc => {
            const relativeAcc = acc > 0 ? (acc / totalAcc) : 0;
            return relativeAcc * 0.7 + baseWeight * 0.3; // Balance between dynamic and equal
        });

        // Normalize to sum to 1
        const weightSum = weights.reduce((sum, w) => sum + w, 0);
        const normalizedWeights = weights.map(w => w / weightSum);

        console.log(`🎯 Dynamic weights calculated:`);
        console.log(`   Pattern: ${normalizedWeights[0].toFixed(3)} (acc: ${methodAccuracies[0].toFixed(3)})`);
        console.log(`   Cycle: ${normalizedWeights[1].toFixed(3)} (acc: ${methodAccuracies[1].toFixed(3)})`);
        console.log(`   Hot/Cold: ${normalizedWeights[2].toFixed(3)} (acc: ${methodAccuracies[2].toFixed(3)})`);
        console.log(`   Adjacent: ${normalizedWeights[3].toFixed(3)} (acc: ${methodAccuracies[3].toFixed(3)})`);
        console.log(`   Math: ${normalizedWeights[4].toFixed(3)} (acc: ${methodAccuracies[4].toFixed(3)})`);
        console.log(`   Stats: ${normalizedWeights[5].toFixed(3)} (acc: ${methodAccuracies[5].toFixed(3)})`);
        console.log(`   TimeSeries: ${normalizedWeights[6].toFixed(3)} (acc: ${methodAccuracies[6].toFixed(3)})`);

        return normalizedWeights;
    }

    /**
     * Validate a method on test data by comparing predictions to actual results
     * Returns accuracy score (0-1)
     */
    validateMethod(methodName, trainData, testData, type = 'lo') {
        let correctPredictions = 0;
        let totalTests = 0;

        for (let i = 0; i < testData.length - 1; i++) {
            const testDay = testData[i];
            const nextDay = testData[i - 1];
            const testNumbers = this.getAllNumbers(nextDay, type);

            // Generate prediction for this day using train data
            let predictions = {};

            switch (methodName) {
                case 'pattern':
                    predictions = this.patternRecognitionMethod(trainData, type);
                    break;
                case 'cycle':
                    predictions = this.cycleAnalysisMethod(trainData, type);
                    break;
                case 'hotCold':
                    predictions = this.hotColdAnalysisMethod(trainData, type);
                    break;
                case 'adjacent':
                    predictions = this.adjacentNumberMethod(trainData, type);
                    break;
                case 'math':
                    predictions = this.mathematicalSequenceMethod(trainData, type);
                    break;
                case 'stats':
                    predictions = this.statisticalDistributionMethod(trainData, type);
                    break;
                case 'timeSeries':
                    predictions = this.timeSeriesAnalysisMethod(trainData, type);
                    break;
                default:
                    return 0;
            }

            // Get top 5 predictions
            const top5 = Object.entries(predictions)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .map(([num]) => num);

            // Check if actual numbers are in top 5
            const hits = testNumbers.filter(num => top5.includes(num));

            if (hits.length > 0) {
                correctPredictions++;
            }
            totalTests++;

            // Update train data to include this day for next iteration
            trainData.unshift(testDay);
        }

        const accuracy = totalTests > 0 ? correctPredictions / totalTests : 0;
        return accuracy;
    }

    /**
     * 🤖 NEW AI METHOD 1: Extract Advanced Features
     * Auto-engineer features for ML
     */
    extractAdvancedFeatures(historicalData, type = 'lo') {
        const features = {};

        // Feature 1: Position streaks
        features.positionStreaks = this.extractPositionStreaks(historicalData, type);

        // Feature 2: Number momentum
        features.momentum = this.extractMomentum(historicalData, type);

        // Feature 3: Volatility index
        features.volatility = this.extractVolatility(historicalData, type);

        // Feature 4: Correlation matrix
        features.correlations = this.extractCorrelations(historicalData, type);

        // Feature 5: Cluster centers (k-means-like)
        features.clusters = this.extractClusters(historicalData, type);

        return features;
    }

    extractPositionStreaks(historicalData, type = 'lo') {
        const streaks = {};
        for (let i = 0; i < 100; i++) {
            const num = i.toString().padStart(2, '0');
            streaks[num] = { ten: 0, unit: 0, maxStreak: 0 };

            let currentStreak = 0;
            historicalData.forEach(result => {
                const allNums = this.getAllNumbers(result, type);
                if (allNums.has(num)) {
                    currentStreak++;
                    streaks[num].maxStreak = Math.max(streaks[num].maxStreak, currentStreak);
                } else {
                    currentStreak = 0;
                }
            });
        }
        return streaks;
    }

    extractMomentum(historicalData, type = 'lo') {
        const momentum = {};
        const window = 5;

        for (let i = 0; i < 100; i++) {
            const num = i.toString().padStart(2, '0');
            const recent = historicalData.slice(0, window);
            const older = historicalData.slice(window, window * 2);

            const recentCount = recent.filter(r => this.getAllNumbers(r, type).has(num)).length;
            const olderCount = older.filter(r => this.getAllNumbers(r, type).has(num)).length;

            momentum[num] = (recentCount - olderCount) / window; // Momentum score
        }

        return momentum;
    }

    extractVolatility(historicalData, type = 'lo') {
        const volatility = {};

        for (let i = 0; i < 100; i++) {
            const num = i.toString().padStart(2, '0');
            const occurrences = historicalData
                .map((r, idx) => this.getAllNumbers(r, type).has(num) ? idx : -1)
                .filter(idx => idx !== -1);

            if (occurrences.length > 1) {
                const intervals = [];
                for (let j = 1; j < occurrences.length; j++) {
                    intervals.push(occurrences[j] - occurrences[j - 1]);
                }

                const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length;
                const variance = intervals.reduce((sum, interval) => sum + Math.pow(interval - mean, 2), 0) / intervals.length;
                volatility[num] = Math.sqrt(variance); // Std dev = volatility
            } else {
                volatility[num] = 0;
            }
        }

        return volatility;
    }

    extractCorrelations(historicalData, type = 'lo') {
        const correlations = {};
        const window = 10;

        for (let i = 0; i < 100; i++) {
            const num = i.toString().padStart(2, '0');
            correlations[num] = {};

            const numAppearances = historicalData.slice(0, window)
                .map(r => this.getAllNumbers(r, type).has(num) ? 1 : 0);

            for (let j = 0; j < 100; j++) {
                const otherNum = j.toString().padStart(2, '0');
                const otherAppearances = historicalData.slice(0, window)
                    .map(r => this.getAllNumbers(r, type).has(otherNum) ? 1 : 0);

                // Pearson correlation
                const mean1 = numAppearances.reduce((a, b) => a + b, 0) / window;
                const mean2 = otherAppearances.reduce((a, b) => a + b, 0) / window;

                let numerator = 0, denom1 = 0, denom2 = 0;
                for (let k = 0; k < window; k++) {
                    numerator += (numAppearances[k] - mean1) * (otherAppearances[k] - mean2);
                    denom1 += Math.pow(numAppearances[k] - mean1, 2);
                    denom2 += Math.pow(otherAppearances[k] - mean2, 2);
                }

                const correlation = denom1 > 0 && denom2 > 0 ? numerator / Math.sqrt(denom1 * denom2) : 0;
                correlations[num][otherNum] = correlation;
            }
        }

        return correlations;
    }

    extractClusters(historicalData, type = 'lo') {
        // K-means-like clustering based on frequency and pattern
        const centers = [];
        const groups = [[], [], [], []]; // 4 clusters

        for (let i = 0; i < 100; i++) {
            const num = i.toString().padStart(2, '0');
            const freq = historicalData.filter(r => this.getAllNumbers(r, type).has(num)).length;

            // Cluster by frequency quartile
            const quartile = Math.floor(freq / 10);
            groups[Math.min(quartile, 3)].push(num);
        }

        groups.forEach((group, idx) => {
            centers.push({
                id: idx,
                numbers: group,
                size: group.length
            });
        });

        return centers;
    }

    /**
     * 🤖 NEW AI METHOD 2: Deep Pattern Learning (Multi-layer analysis)
     */
    deepPatternLearningMethod(historicalData, features) {
        const predictions = {};

        for (let i = 0; i < 100; i++) {
            const num = i.toString().padStart(2, '0');
            let score = 0;

            // Layer 1: Feature-based scoring
            const momentum = features.momentum[num] || 0;
            const volatility = features.volatility[num] || 0;
            const streak = features.positionStreaks[num]?.maxStreak || 0;

            score += momentum * 2.0; // Strong momentum = high score
            score += (1 - Math.min(volatility / 10, 1)) * 1.5; // Low volatility = high score
            score += streak * 0.5; // Streaks matter

            // Layer 2: Cluster-based scoring
            const cluster = features.clusters.find(c => c.numbers.includes(num));
            if (cluster && cluster.size < 30) { // Prefer smaller clusters
                score += 1.0;
            }

            // Layer 3: Correlation-based scoring
            const correlations = features.correlations[num] || {};
            const strongCorr = Object.values(correlations).filter(corr => Math.abs(corr) > 0.5).length;
            score += strongCorr * 0.3;

            predictions[num] = Math.max(0, score);
        }

        // Normalize
        const max = Math.max(...Object.values(predictions));
        Object.keys(predictions).forEach(num => {
            predictions[num] = max > 0 ? predictions[num] / max : 0;
        });

        console.log('🧠 Deep Pattern Learning: Applied multi-layer analysis');
        return predictions;
    }

    /**
     * 🤖 NEW AI METHOD 3: Reinforcement Learning Penalty
     */
    applyReinforcementLearning(probabilities, historicalData, type = 'lo') {
        // Learn from past mistakes: numbers that appeared recently should be penalized MORE
        const recentNumbers = this.getRecentNumbers(historicalData, 7, type);

        if (recentNumbers.size > 0) {
            console.log(`🤖 RL: Applying learned penalty to ${recentNumbers.size} recent numbers`);

            for (let num of recentNumbers) {
                if (probabilities[num]) {
                    // Exponential decay based on how recent
                    const daysAgo = this.getDaysSinceLastAppearance(num, historicalData, type);
                    const penaltyFactor = Math.exp(-daysAgo / 2); // Decay faster for very recent
                    probabilities[num] *= (1 - penaltyFactor * 0.8); // Up to 80% penalty
                }
            }

            // Normalize after penalty
            const total = Object.values(probabilities).reduce((sum, p) => sum + p, 0);
            if (total > 0) {
                Object.keys(probabilities).forEach(num => {
                    probabilities[num] = probabilities[num] / total;
                });
            }
        }

        return probabilities;
    }

    getDaysSinceLastAppearance(num, historicalData, type = 'lo') {
        for (let i = 0; i < historicalData.length; i++) {
            if (this.getAllNumbers(historicalData[i], type).has(num)) {
                return i;
            }
        }
        return historicalData.length;
    }

    /**
     * Helper methods
     */
    async getHistoricalData(date, days) {
        const endDate = new Date(date);
        endDate.setDate(endDate.getDate() - 1);
        endDate.setHours(23, 59, 59, 999);

        const startDate = new Date(endDate);
        startDate.setDate(startDate.getDate() - days + 1);
        startDate.setHours(0, 0, 0, 0);

        // Query without isComplete filter to get all data
        const data = await XSMB.find({
            drawDate: { $gte: startDate, $lte: endDate },
            station: 'xsmb'
        })
            .select('drawDate specialPrize firstPrize secondPrize threePrizes fourPrizes fivePrizes sixPrizes sevenPrizes')
            .sort({ drawDate: -1 })
            .lean();

        console.log(`📊 Advanced Soi Cầu: Got ${data.length} historical records`);

        return data;
    }

    findSimilarDays(targetDay, historicalData, type = 'lo') {
        const similarDays = [];
        const targetNumbers = this.getAllNumbers(targetDay, type);

        for (let i = 1; i < historicalData.length - 1; i++) {
            const pastDay = historicalData[i];
            const nextDay = historicalData[i - 1];

            const pastNumbers = this.getAllNumbers(pastDay, type);
            const similarity = this.jaccardSimilarity(targetNumbers, pastNumbers);

            if (similarity > 0) {
                similarDays.push({
                    similarity,
                    pastDay,
                    nextNumbers: this.getAllNumbers(nextDay, type)
                });
            }
        }

        return similarDays.sort((a, b) => b.similarity - a.similarity);
    }

    getAllNumbers(result, type = 'lo') {
        const numbers = new Set();

        if (type === 'de') {
            // Chỉ lấy Đề (2 số cuối giải đặc biệt)
            if (result.specialPrize && result.specialPrize.length > 0) {
                const de = result.specialPrize[0].slice(-2);
                if (de && de.length === 2) {
                    numbers.add(de);
                }
            }
        } else {
            // Lấy Lô (tất cả các giải)
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

    getDe(result) {
        if (result.specialPrize && result.specialPrize.length > 0) {
            return result.specialPrize[0].slice(-2);
        }
        return null;
    }

    hasNumber(result, number, type = 'lo') {
        return this.getAllNumbers(result, type).has(number);
    }

    jaccardSimilarity(set1, set2) {
        const intersection = new Set([...set1].filter(x => set2.has(x)));
        const union = new Set([...set1, ...set2]);
        return union.size === 0 ? 0 : intersection.size / union.size;
    }

    getRecentNumbers(historicalData, days = 5, type = 'lo') {
        const recentNumbers = new Set();
        const recentData = historicalData.slice(0, days); // First N days (most recent)

        recentData.forEach(result => {
            const allNums = this.getAllNumbers(result, type);
            allNums.forEach(num => recentNumbers.add(num));
        });

        return recentNumbers;
    }
}

module.exports = AdvancedSoiCauService;
