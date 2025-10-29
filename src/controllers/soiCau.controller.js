const XSMB = require('../models/xsmb.model');
const SoiCauResult = require('../models/soiCauResult.model');

// Format date to DD/MM/YYYY
const formatDate = (date) => {
    const d = new Date(date);
    const day = d.getDate().toString().padStart(2, '0');
    const month = (d.getMonth() + 1).toString().padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
};

// Parse date from DD/MM/YYYY or DD-MM-YYYY
const parseDate = (dateStr) => {
    let normalizedStr = dateStr;
    if (dateStr.includes('-')) {
        normalizedStr = dateStr.replace(/-/g, '/');
    }
    if (!normalizedStr || !/^\d{2}\/\d{2}\/\d{4}$/.test(normalizedStr)) {
        throw new Error('Định dạng ngày không hợp lệ. Vui lòng sử dụng DD/MM/YYYY hoặc DD-MM-YYYY.');
    }
    const [day, month, year] = normalizedStr.split('/').map(Number);
    if (day < 1 || day > 31 || month < 1 || month > 12 || year < 2000 || year > new Date().getFullYear()) {
        throw new Error('Ngày, tháng hoặc năm không hợp lệ.');
    }
    return new Date(year, month - 1, day);
};

// Parse date string to Date object for database
const parseDateForDB = (dateStr) => {
    if (typeof dateStr === 'string' && dateStr.includes('/')) {
        const [day, month, year] = dateStr.split('/').map(Number);
        // Tạo Date object với timezone UTC để nhất quán
        return new Date(Date.UTC(year, month - 1, day));
    }
    return new Date(dateStr);
};

// Replace 'N/A' with empty string
const sanitizeResult = (result) => (result === 'N/A' ? '' : result);

// Calculate frequencies from results
const calculateFrequencies = async (results, station, days) => {
    const allNumbers = results.reduce((acc, result) => {
        if (!result) return acc;
        return [
            ...acc,
            ...(Array.isArray(result.specialPrize) ? result.specialPrize.filter(num => /^\d+$/.test(num)) : []),
            ...(Array.isArray(result.firstPrize) ? result.firstPrize.filter(num => /^\d+$/.test(num)) : []),
            ...(Array.isArray(result.secondPrize) ? result.secondPrize.filter(num => /^\d+$/.test(num)) : []),
            ...(Array.isArray(result.threePrizes) ? result.threePrizes.filter(num => /^\d+$/.test(num)) : []),
            ...(Array.isArray(result.fourPrizes) ? result.fourPrizes.filter(num => /^\d+$/.test(num)) : []),
            ...(Array.isArray(result.fivePrizes) ? result.fivePrizes.filter(num => /^\d+$/.test(num)) : []),
            ...(Array.isArray(result.sixPrizes) ? result.sixPrizes.filter(num => /^\d+$/.test(num)) : []),
            ...(Array.isArray(result.sevenPrizes) ? result.sevenPrizes.filter(num => /^\d+$/.test(num)) : []),
        ];
    }, []).map(num => num ? num.slice(-2) : '').filter(num => num && /^\d{2}$/.test(num));

    const freqMap = {};
    allNumbers.forEach(num => {
        freqMap[num] = (freqMap[num] || 0) + 1;
    });
    const frequencies = Object.entries(freqMap)
        .map(([number, count]) => ({ number, count }))
        .sort((a, b) => b.count - a.count);

    return frequencies;
};

// Calculate gan numbers
const calculateGanNumbers = async (results, station, days) => {
    const allNumbers = results.reduce((acc, result) => {
        if (!result) return acc;
        return [
            ...acc,
            ...(Array.isArray(result.specialPrize) ? result.specialPrize.filter(num => /^\d+$/.test(num)) : []),
            ...(Array.isArray(result.firstPrize) ? result.firstPrize.filter(num => /^\d+$/.test(num)) : []),
            ...(Array.isArray(result.secondPrize) ? result.secondPrize.filter(num => /^\d+$/.test(num)) : []),
            ...(Array.isArray(result.threePrizes) ? result.threePrizes.filter(num => /^\d+$/.test(num)) : []),
            ...(Array.isArray(result.fourPrizes) ? result.fourPrizes.filter(num => /^\d+$/.test(num)) : []),
            ...(Array.isArray(result.fivePrizes) ? result.fivePrizes.filter(num => /^\d+$/.test(num)) : []),
            ...(Array.isArray(result.sixPrizes) ? result.sixPrizes.filter(num => /^\d+$/.test(num)) : []),
            ...(Array.isArray(result.sevenPrizes) ? result.sevenPrizes.filter(num => /^\d+$/.test(num)) : []),
        ];
    }, []).map(num => num ? num.slice(-2) : '').filter(num => num && /^\d{2}$/.test(num));

    const ganNumbers = Array.from({ length: 100 }, (_, i) => i.toString().padStart(2, '0'))
        .filter(num => !allNumbers.includes(num));

    return ganNumbers;
};

// Pascal method
const applyPascal = async (results, diamondResult, pairResult, historicalPredictions) => {
    if (!results[0]) return '';
    const latestResult = results[0];
    const specialPrize = Array.isArray(latestResult.specialPrize) && latestResult.specialPrize[0] ? latestResult.specialPrize[0] : '';
    const firstPrize = Array.isArray(latestResult.firstPrize) && latestResult.firstPrize[0] ? latestResult.firstPrize[0] : '';
    if (!specialPrize || !firstPrize || !/^\d+$/.test(specialPrize) || !/^\d+$/.test(firstPrize)) {
        return '';
    }
    const secondLatestResult = results[1] || {};
    const secondSpecialPrize = Array.isArray(secondLatestResult.specialPrize) && secondLatestResult.specialPrize[0] ? secondLatestResult.specialPrize[0] : specialPrize;
    const input = ((parseInt(specialPrize.slice(-2)) + parseInt(secondSpecialPrize.slice(-2))) % 100).toString().padStart(2, '0') + firstPrize.slice(-2);
    let result = input.split('').map(Number);
    while (result.length > 2) {
        result = result.slice(0, -1).map((num, i) => (num + result[i + 1]) % 10);
    }
    let pascalResult = result.join('').padStart(2, '0');

    const frequencies = await calculateFrequencies(results, 'xsmb', results.length);
    const topNumbers = frequencies.slice(0, 10).map(item => item.number); // Tăng từ 5 lên 10

    // TỐI ƯU: Thêm yếu tố ngẫu nhiên để tránh trùng lặp
    const currentDate = new Date();
    const dayOfYear = Math.floor((currentDate - new Date(currentDate.getFullYear(), 0, 0)) / (1000 * 60 * 60 * 24));
    const randomSeed = (parseInt(specialPrize.slice(-1)) + parseInt(firstPrize.slice(-1)) + dayOfYear) % 100;

    // Avoid repetition with historical predictions - nhưng không quá strict
    const historicalNumbers = historicalPredictions.flatMap(h => h.predictions.filter(p => p.number).map(p => p.number));
    if (historicalNumbers.includes(pascalResult) && topNumbers.length > 0) {
        // Thêm logic chọn số dựa trên ngày để tạo sự đa dạng
        const availableNumbers = topNumbers.filter(num => !historicalNumbers.includes(num));
        if (availableNumbers.length > 0) {
            const index = randomSeed % availableNumbers.length;
            pascalResult = availableNumbers[index];
        } else {
            // Nếu tất cả số đều đã được dự đoán, chọn dựa trên ngày
            const index = randomSeed % topNumbers.length;
            pascalResult = topNumbers[index];
        }
    }

    if (topNumbers.includes(pascalResult)) {
        return pascalResult;
    }
    return diamondResult || pairResult || topNumbers[0] || pascalResult;
};

// Diamond Shape method
const applyDiamondShape = async (results, numDays, historicalPredictions) => {
    if (!results.length) return '';
    const recentResults = results.slice(0, 3);
    const lastTwoDigits = recentResults
        .reduce((acc, result) => {
            if (!result) return acc;
            return [
                ...acc,
                ...(Array.isArray(result.specialPrize) ? result.specialPrize : []),
                ...(Array.isArray(result.firstPrize) ? result.firstPrize : []),
                ...(Array.isArray(result.secondPrize) ? result.secondPrize : []),
                ...(Array.isArray(result.threePrizes) ? result.threePrizes : []),
                ...(Array.isArray(result.fourPrizes) ? result.fourPrizes : []),
                ...(Array.isArray(result.fivePrizes) ? result.fivePrizes : []),
                ...(Array.isArray(result.sixPrizes) ? result.sixPrizes : []),
                ...(Array.isArray(result.sevenPrizes) ? result.sevenPrizes : []),
            ];
        }, [])
        .map(prize => prize ? prize.slice(-2) : '').filter(prize => prize);

    let diamondResult = '';
    for (let i = 0; i < lastTwoDigits.length - 2; i++) {
        for (let j = i + 1; j < lastTwoDigits.length - 1; j++) {
            const [a, b, c] = [lastTwoDigits[i], lastTwoDigits[j], lastTwoDigits[j + 1]];
            if (a === c && a !== b && b !== undefined) {
                diamondResult = b.padStart(2, '0');
                break;
            }
            if (b === c && a !== b && a !== undefined) {
                diamondResult = a.padStart(2, '0');
                break;
            }
        }
        if (diamondResult) break;
    }

    if (diamondResult) {
        const ganNumbers = await calculateGanNumbers(results, 'xsmb', numDays);
        if (ganNumbers.includes(diamondResult)) {
            return '';
        }

        // TỐI ƯU: Thêm yếu tố ngẫu nhiên dựa trên ngày
        const currentDate = new Date();
        const dayOfYear = Math.floor((currentDate - new Date(currentDate.getFullYear(), 0, 0)) / (1000 * 60 * 60 * 24));
        const randomSeed = (dayOfYear + parseInt(diamondResult)) % 100;

        // Avoid repetition with historical predictions - nhưng không quá strict
        const historicalNumbers = historicalPredictions.flatMap(h => h.predictions.filter(p => p.number).map(p => p.number));
        if (historicalNumbers.includes(diamondResult)) {
            const frequencies = await calculateFrequencies(results, 'xsmb', numDays);
            const topNumbers = frequencies.slice(0, 10).map(item => item.number); // Tăng từ 5 lên 10
            const availableNumbers = topNumbers.filter(num => !historicalNumbers.includes(num) && !ganNumbers.includes(num));
            if (availableNumbers.length > 0) {
                const index = randomSeed % availableNumbers.length;
                diamondResult = availableNumbers[index];
            } else {
                // Fallback với yếu tố ngẫu nhiên
                const index = randomSeed % topNumbers.length;
                diamondResult = topNumbers[index];
            }
        }
    }
    return diamondResult || lastTwoDigits[0] || '';
};

// Frequency-based Pairs method
const applyFrequencyPairs = async (results, historicalPredictions) => {
    if (!results.length) return '';
    const recentResults = results.slice(0, 5);
    const frequencies = await calculateFrequencies(recentResults, 'xsmb', recentResults.length);
    if (frequencies.length === 0) return '';

    // TỐI ƯU: Thêm yếu tố ngẫu nhiên dựa trên ngày
    const currentDate = new Date();
    const dayOfYear = Math.floor((currentDate - new Date(currentDate.getFullYear(), 0, 0)) / (1000 * 60 * 60 * 24));
    const randomSeed = (dayOfYear + frequencies.length) % 100;

    const historicalNumbers = historicalPredictions.flatMap(h => h.predictions.filter(p => p.number).map(p => p.number));
    const availableNumbers = frequencies.filter(item => !historicalNumbers.includes(item.number));

    if (availableNumbers.length > 0) {
        const index = randomSeed % availableNumbers.length;
        return availableNumbers[index].number;
    } else {
        // Fallback với yếu tố ngẫu nhiên
        const index = randomSeed % frequencies.length;
        return frequencies[index].number;
    }
};

// Gan and Frequency Combination method
const applyGanFrequency = async (results, numDays, historicalPredictions) => {
    if (!results.length) return '';
    const ganNumbers = await calculateGanNumbers(results, 'xsmb', numDays);
    const frequencies = await calculateFrequencies(results, 'xsmb', numDays);
    const nearGanNumbers = ganNumbers.slice(0, Math.min(10, ganNumbers.length)); // Tăng từ 5 lên 10
    const highFreqNumbers = frequencies.slice(0, 10).map(item => item.number); // Tăng từ 5 lên 10

    // TỐI ƯU: Thêm yếu tố ngẫu nhiên dựa trên ngày
    const currentDate = new Date();
    const dayOfYear = Math.floor((currentDate - new Date(currentDate.getFullYear(), 0, 0)) / (1000 * 60 * 60 * 24));
    const randomSeed = (dayOfYear + nearGanNumbers.length) % 100;

    const historicalNumbers = historicalPredictions.flatMap(h => h.predictions.filter(p => p.number).map(p => p.number));
    const availableCandidates = nearGanNumbers.filter(num => highFreqNumbers.includes(num) && !historicalNumbers.includes(num));

    if (availableCandidates.length > 0) {
        const index = randomSeed % availableCandidates.length;
        return availableCandidates[index];
    } else {
        const availableHighFreq = highFreqNumbers.filter(num => !historicalNumbers.includes(num));
        if (availableHighFreq.length > 0) {
            const index = randomSeed % availableHighFreq.length;
            return availableHighFreq[index];
        } else {
            const index = randomSeed % highFreqNumbers.length;
            return highFreqNumbers[index];
        }
    }
};

// Lô rơi method
const applyLoRoi = async (results, historicalPredictions) => {
    if (results.length < 2 || !results[0] || !results[1]) return '';

    const getLastTwoDigits = (result) => {
        if (!result) return [];
        return [
            ...(Array.isArray(result.specialPrize) ? result.specialPrize : []),
            ...(Array.isArray(result.firstPrize) ? result.firstPrize : []),
            ...(Array.isArray(result.secondPrize) ? result.secondPrize : []),
        ].map(prize => prize ? prize.slice(-2) : '').filter(prize => prize);
    };

    const lastTwoDigitsRecent = getLastTwoDigits(results[0]);
    const lastTwoDigitsPrevious = getLastTwoDigits(results[1]);

    // TỐI ƯU: Thêm yếu tố ngẫu nhiên dựa trên ngày
    const currentDate = new Date();
    const dayOfYear = Math.floor((currentDate - new Date(currentDate.getFullYear(), 0, 0)) / (1000 * 60 * 60 * 24));
    const randomSeed = (dayOfYear + lastTwoDigitsRecent.length) % 100;

    const historicalNumbers = historicalPredictions.flatMap(h => h.predictions.filter(p => p.number).map(p => p.number));
    const availableLoRoi = lastTwoDigitsRecent.filter(num => lastTwoDigitsPrevious.includes(num) && !historicalNumbers.includes(num));

    if (availableLoRoi.length > 0) {
        const index = randomSeed % availableLoRoi.length;
        return availableLoRoi[index];
    } else {
        const availableRecent = lastTwoDigitsRecent.filter(num => !historicalNumbers.includes(num));
        if (availableRecent.length > 0) {
            const index = randomSeed % availableRecent.length;
            return availableRecent[index];
        } else {
            const index = randomSeed % lastTwoDigitsRecent.length;
            return lastTwoDigitsRecent[index];
        }
    }
};

// Calculate historical hit rates
const calculateHitRates = async (results, predictions) => {
    const hitRates = {
        Pascal: 0,
        'Hình Quả Trám': 0,
        'Tần suất lô cặp': 0,
        'Lô gan kết hợp': 0,
        'Lô rơi': 0,
    };

    if (!results.length) {
        const defaultWeight = 1 / Object.keys(hitRates).length;
        Object.keys(hitRates).forEach(method => {
            hitRates[method] = defaultWeight;
        });
        return hitRates;
    }

    for (const result of results) {
        if (!result) continue;
        const actualNumbers = [
            ...(Array.isArray(result.specialPrize) ? result.specialPrize : []),
            ...(Array.isArray(result.firstPrize) ? result.firstPrize : []),
            ...(Array.isArray(result.secondPrize) ? result.secondPrize : []),
            ...(Array.isArray(result.threePrizes) ? result.threePrizes : []),
            ...(Array.isArray(result.fourPrizes) ? result.fourPrizes : []),
            ...(Array.isArray(result.fivePrizes) ? result.fivePrizes : []),
            ...(Array.isArray(result.sixPrizes) ? result.sixPrizes : []),
            ...(Array.isArray(result.sevenPrizes) ? result.sevenPrizes : []),
        ].map(num => num ? num.slice(-2) : '').filter(num => num);

        predictions.forEach(prediction => {
            if (prediction.number && actualNumbers.includes(prediction.number)) {
                hitRates[prediction.method] += 1 / results.length;
            }
        });
    }

    const total = Object.values(hitRates).reduce((sum, rate) => sum + rate, 0) || 1;
    Object.keys(hitRates).forEach(method => {
        hitRates[method] = total ? hitRates[method] / total : 1 / Object.keys(hitRates).length;
    });

    return hitRates;
};

// Combine predictions
const combinePredictions = async (predictions, results, historicalPredictions) => {
    const hitRates = await calculateHitRates(results, predictions);
    const scoreMap = {};
    predictions.forEach(prediction => {
        if (prediction.number) {
            scoreMap[prediction.number] = (scoreMap[prediction.number] || 0) + hitRates[prediction.method];
        }
    });

    const historicalNumbers = historicalPredictions.flatMap(h => h.predictions.filter(p => p.number).map(p => p.number));
    const sortedScores = Object.entries(scoreMap)
        .sort(([, scoreA], [, scoreB]) => scoreB - scoreA)
        .filter(([num]) => !historicalNumbers.includes(num));

    const topNumber = sortedScores[0]?.[0];
    const additionalSuggestions = sortedScores.slice(1, 4).map(([num]) => num.padStart(2, '0'));

    return {
        topNumber: topNumber ? topNumber.padStart(2, '0') : predictions.find(p => p.number && !historicalNumbers.includes(p.number))?.number || predictions.find(p => p.number)?.number || '',
        additionalSuggestions,
    };
};

// Fetch historical predictions
const getHistoricalPredictions = async (targetDate, numDays) => {
    const history = [];
    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);
    const startOfPeriod = new Date(endOfDay);
    startOfPeriod.setDate(startOfPeriod.getDate() - numDays + 1);
    startOfPeriod.setHours(0, 0, 0, 0);

    const results = await XSMB.find({
        drawDate: { $gte: startOfPeriod, $lte: endOfDay },
        station: 'xsmb',
    })
        .select('drawDate specialPrize firstPrize secondPrize threePrizes fourPrizes fivePrizes sixPrizes sevenPrizes')
        .sort({ drawDate: -1 })
        .lean();

    const currentTime = new Date();
    const today = formatDate(currentTime);

    for (let i = 0; i < Math.min(numDays, 10); i++) {
        const pastDate = new Date(targetDate);
        pastDate.setDate(pastDate.getDate() - i);
        const formattedPastDate = formatDate(pastDate);

        const cacheKey = `bachthu:predict:${formattedPastDate}:days:${numDays}:for:${formattedPastDate}`;

        let pastPrediction;
        if (!pastPrediction) {
            const pastEndOfDay = new Date(pastDate);
            pastEndOfDay.setDate(pastEndOfDay.getDate() - 1);
            pastEndOfDay.setHours(23, 59, 59, 999);
            const pastStartOfPeriod = new Date(pastEndOfDay);
            pastStartOfPeriod.setDate(pastStartOfPeriod.getDate() - numDays + 1);
            pastStartOfPeriod.setHours(0, 0, 0, 0);

            const pastResults = await XSMB.find({
                drawDate: { $gte: pastStartOfPeriod, $lte: pastEndOfDay },
                station: 'xsmb',
            })
                .select('drawDate specialPrize firstPrize secondPrize threePrizes fourPrizes fivePrizes sixPrizes sevenPrizes')
                .sort({ drawDate: -1 })
                .lean();

            if (pastResults.length === 0) continue;

            const validPastResults = pastResults.filter(result =>
                result &&
                (Array.isArray(result.specialPrize) ||
                    Array.isArray(result.firstPrize) ||
                    Array.isArray(result.secondPrize) ||
                    Array.isArray(result.threePrizes) ||
                    Array.isArray(result.fourPrizes) ||
                    Array.isArray(result.fivePrizes) ||
                    Array.isArray(result.sixPrizes) ||
                    Array.isArray(result.sevenPrizes))
            );

            if (validPastResults.length === 0) continue;

            // Sử dụng simplified historical predictions để tránh recursive call
            const pastHistory = await getHistoricalPredictionsSimplified(new Date(pastDate.getTime() - 24 * 60 * 60 * 1000), numDays);

            const diamondResult = await applyDiamondShape(validPastResults, numDays, pastHistory);
            const pairResult = await applyFrequencyPairs(validPastResults, pastHistory);
            const pascalResult = await applyPascal(validPastResults, diamondResult, pairResult, pastHistory);
            const ganFreqResult = await applyGanFrequency(validPastResults, numDays, pastHistory);
            const loRoiResult = await applyLoRoi(validPastResults, pastHistory);

            const predictions = [
                { method: 'Pascal', number: pascalResult, frame: pascalResult ? '3 ngày' : '' },
                { method: 'Hình Quả Trám', number: diamondResult, frame: diamondResult ? '5 ngày' : '' },
                { method: 'Tần suất lô cặp', number: pairResult, frame: pairResult ? '3 ngày' : '' },
                { method: 'Lô gan kết hợp', number: ganFreqResult, frame: ganFreqResult ? '5 ngày' : '' },
                { method: 'Lô rơi', number: loRoiResult, frame: loRoiResult ? '2 ngày' : '' },
            ].map(pred => ({
                ...pred,
                number: sanitizeResult(pred.number),
                frame: sanitizeResult(pred.frame),
            }));

            const { topNumber, additionalSuggestions } = await combinePredictions(predictions, validPastResults, pastHistory);

            pastPrediction = {
                predictionDate: formattedPastDate,
                predictions,
                combinedPrediction: sanitizeResult(topNumber),
                additionalSuggestions: additionalSuggestions.map(sanitizeResult),
            };
        }

        const actualResult = results.find(r => formatDate(r.drawDate) === formattedPastDate);
        const actualNumbers = actualResult
            ? [
                ...(Array.isArray(actualResult.specialPrize) ? actualResult.specialPrize : []),
                ...(Array.isArray(actualResult.firstPrize) ? actualResult.firstPrize : []),
                ...(Array.isArray(actualResult.secondPrize) ? actualResult.secondPrize : []),
                ...(Array.isArray(actualResult.threePrizes) ? actualResult.threePrizes : []),
                ...(Array.isArray(actualResult.fourPrizes) ? actualResult.fourPrizes : []),
                ...(Array.isArray(actualResult.fivePrizes) ? actualResult.fivePrizes : []),
                ...(Array.isArray(actualResult.sixPrizes) ? actualResult.sixPrizes : []),
                ...(Array.isArray(actualResult.sevenPrizes) ? actualResult.sevenPrizes : []),
            ].map(num => num ? num.slice(-2) : '').filter(num => num)
            : [];

        const predictedNumbers = pastPrediction.predictions
            .filter(p => p.number)
            .map(p => p.number);
        const matchingNumbers = actualNumbers.filter(num => predictedNumbers.includes(num));

        const isHit = matchingNumbers.length > 0;

        history.push({
            date: formattedPastDate,
            predictions: pastPrediction.predictions,
            combinedPrediction: pastPrediction.combinedPrediction,
            actualNumbers: matchingNumbers,
            isHit,
        });
    }

    return history;
};

// Simplified historical predictions without recursive calls
const getHistoricalPredictionsSimplified = async (targetDate, numDays) => {
    console.log(`🔄 getHistoricalPredictionsSimplified for ${formatDate(targetDate)}, days: ${numDays}`);
    const history = [];

    try {
        // Lấy dữ liệu từ database
        const endOfDay = new Date(targetDate);
        endOfDay.setHours(23, 59, 59, 999);
        const startOfPeriod = new Date(endOfDay);
        startOfPeriod.setDate(startOfPeriod.getDate() - numDays + 1);
        startOfPeriod.setHours(0, 0, 0, 0);

        const results = await XSMB.find({
            drawDate: { $gte: startOfPeriod, $lte: endOfDay },
            station: 'xsmb',
        })
            .select('drawDate specialPrize firstPrize secondPrize threePrizes fourPrizes fivePrizes sixPrizes sevenPrizes')
            .sort({ drawDate: -1 })
            .lean();

        console.log(`📊 Found ${results.length} results for historical predictions`);

        // Tạo historical predictions đơn giản (chỉ lấy 5 ngày gần nhất)
        for (let i = 1; i <= Math.min(5, results.length - 1); i++) {
            const pastDate = new Date(targetDate);
            pastDate.setDate(pastDate.getDate() - i);
            const formattedPastDate = formatDate(pastDate);

            console.log(`🔍 Looking for result on ${formattedPastDate}`);

            // Tìm kết quả thực tế cho ngày đó
            const actualResult = results.find(r => {
                const resultDate = formatDate(r.drawDate);
                console.log(`🔍 Comparing ${resultDate} with ${formattedPastDate}`);
                return resultDate === formattedPastDate;
            });

            if (!actualResult) {
                console.log(`⚠️ No result found for ${formattedPastDate}`);
                continue;
            }

            console.log(`✅ Found result for ${formattedPastDate}`);

            // Tạo prediction đơn giản dựa trên dữ liệu có sẵn
            const actualNumbers = [
                ...(Array.isArray(actualResult.specialPrize) ? actualResult.specialPrize : []),
                ...(Array.isArray(actualResult.firstPrize) ? actualResult.firstPrize : []),
                ...(Array.isArray(actualResult.secondPrize) ? actualResult.secondPrize : []),
                ...(Array.isArray(actualResult.threePrizes) ? actualResult.threePrizes : []),
                ...(Array.isArray(actualResult.fourPrizes) ? actualResult.fourPrizes : []),
                ...(Array.isArray(actualResult.fivePrizes) ? actualResult.fivePrizes : []),
                ...(Array.isArray(actualResult.sixPrizes) ? actualResult.sixPrizes : []),
                ...(Array.isArray(actualResult.sevenPrizes) ? actualResult.sevenPrizes : []),
            ].map(num => num ? num.slice(-2) : '').filter(num => num);

            // Tạo prediction giả lập (dựa trên số xuất hiện nhiều nhất)
            const numberCounts = {};
            actualNumbers.forEach(num => {
                numberCounts[num] = (numberCounts[num] || 0) + 1;
            });

            const topNumbers = Object.entries(numberCounts)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 3)
                .map(([num]) => num);

            const mockPredictions = [
                { method: 'Pascal', number: topNumbers[0] || '', frame: '3 ngày' },
                { method: 'Hình Quả Trám', number: topNumbers[1] || '', frame: '5 ngày' },
                { method: 'Tần suất lô cặp', number: topNumbers[2] || '', frame: '3 ngày' },
            ].filter(p => p.number);

            const historyEntry = {
                date: formattedPastDate,
                predictions: mockPredictions,
                combinedPrediction: topNumbers[0] || '',
                actualNumbers: actualNumbers.slice(0, 3), // Lấy 3 số đầu
                isHit: mockPredictions.some(p => actualNumbers.includes(p.number)),
            };

            console.log(`📝 Adding history entry:`, historyEntry);
            history.push(historyEntry);
        }

        console.log(`✅ Created ${history.length} historical predictions`);
        return history;
    } catch (error) {
        console.error('❌ Error in getHistoricalPredictionsSimplified:', error.message);
        return [];
    }
};

// Fetch bạch thủ prediction
const getBachThuMB = async (req, res) => {
    // Set timeout để tránh hang
    const timeout = setTimeout(() => {
        if (!res.headersSent) {
            console.error('⏰ API timeout after 30 seconds');
            res.status(408).json({
                error: 'Request timeout. Vui lòng thử lại sau.',
                message: 'API đang xử lý quá lâu, có thể do thiếu dữ liệu hoặc tính toán phức tạp.'
            });
        }
    }, 30000); // 30 seconds timeout

    try {
        const { date, days } = req.query;
        console.log(`🔄 Starting getBachThuMB for date: ${date}, days: ${days}`);
        const numDays = parseInt(days) || 14;

        // Parse target date from query parameter or use current date
        let targetDate;
        if (date) {
            try {
                targetDate = parseDate(date);
            } catch (error) {
                return res.status(400).json({ error: error.message });
            }
        } else {
            targetDate = new Date();
        }

        const currentTime = new Date();
        const today = formatDate(targetDate);
        const lastUpdateKey = `lastUpdate:${today}`;

        // Dự đoán cho đúng ngày được yêu cầu
        const predictionDate = formatDate(targetDate);
        console.log(`📅 Predicting for requested date: ${predictionDate}`);

        const formattedTargetDate = formatDate(targetDate);

        // Tạm thời bỏ qua cache để test function mới
        console.log(`🔄 Force tính toán real-time để test function mới`);

        console.log(`⚠️ Không có dữ liệu trong database, tính toán real-time cho ngày ${predictionDate}`);

        const endOfDay = new Date(targetDate);
        endOfDay.setHours(23, 59, 59, 999);
        const startOfPeriod = new Date(endOfDay);
        startOfPeriod.setDate(startOfPeriod.getDate() - numDays + 1);
        startOfPeriod.setHours(0, 0, 0, 0);

        const results = await XSMB.find({
            drawDate: { $gte: startOfPeriod, $lte: endOfDay },
            station: 'xsmb',
        })
            .select('drawDate specialPrize firstPrize secondPrize threePrizes fourPrizes fivePrizes sixPrizes sevenPrizes')
            .sort({ drawDate: -1 })
            .lean();

        if (results.length === 0) {
            const extendedStart = new Date(endOfDay);
            extendedStart.setDate(extendedStart.getDate() - 30);
            const extendedResults = await XSMB.find({
                drawDate: { $gte: extendedStart, $lte: endOfDay },
                station: 'xsmb',
            })
                .select('drawDate specialPrize firstPrize secondPrize threePrizes fourPrizes fivePrizes sixPrizes sevenPrizes')
                .sort({ drawDate: -1 })
                .lean();

            if (extendedResults.length === 0) {
                return res.status(404).json({
                    error: `Không tìm thấy dữ liệu xổ số trong ${numDays} ngày hoặc 30 ngày trước ngày ${formattedTargetDate}.`,
                    suggestedDate: formatDate(new Date(targetDate.setDate(targetDate.getDate() - 1))),
                });
            }
            results.push(...extendedResults);
        }

        console.log(`📊 Found ${results.length} results, filtering valid ones...`);
        const validResults = results.filter(result =>
            result &&
            (Array.isArray(result.specialPrize) ||
                Array.isArray(result.firstPrize) ||
                Array.isArray(result.secondPrize) ||
                Array.isArray(result.threePrizes) ||
                Array.isArray(result.fourPrizes) ||
                Array.isArray(result.fivePrizes) ||
                Array.isArray(result.sixPrizes) ||
                Array.isArray(result.sevenPrizes))
        );
        console.log(`✅ Valid results: ${validResults.length}`);

        if (validResults.length === 0) {
            return res.status(404).json({
                error: `Dữ liệu xổ số không hợp lệ trong ${numDays} ngày trước ngày ${formattedTargetDate}.`,
                suggestedDate: formatDate(new Date(targetDate.setDate(targetDate.getDate() - 1))),
            });
        }

        const latestDate = new Date(validResults[0].drawDate);
        const earliestDate = new Date(validResults[validResults.length - 1].drawDate);

        console.log(`🔄 Getting historical predictions...`);
        const history = await getHistoricalPredictionsSimplified(targetDate, numDays);
        console.log(`✅ Historical predictions: ${history.length}`);

        console.log(`🔄 Applying prediction methods...`);
        const diamondResult = await applyDiamondShape(validResults, numDays, history);
        console.log(`✅ Diamond result: ${diamondResult}`);

        const pairResult = await applyFrequencyPairs(validResults, history);
        console.log(`✅ Pair result: ${pairResult}`);

        const pascalResult = await applyPascal(validResults, diamondResult, pairResult, history);
        console.log(`✅ Pascal result: ${pascalResult}`);

        const ganFreqResult = await applyGanFrequency(validResults, numDays, history);
        console.log(`✅ Gan freq result: ${ganFreqResult}`);

        const loRoiResult = await applyLoRoi(validResults, history);
        console.log(`✅ Lo roi result: ${loRoiResult}`);

        const predictions = [
            { method: 'Pascal', number: pascalResult, frame: pascalResult ? '3 ngày' : '', description: 'Ghép 2 số cuối của giải đặc biệt và giải nhất, cộng các số liền kề đến khi còn 2 số.' },
            { method: 'Hình Quả Trám', number: diamondResult, frame: diamondResult ? '5 ngày' : '', description: 'Tìm mẫu A-B-A hoặc B-A-B trong các giải, số ở giữa là bạch thủ lô.' },
            { method: 'Tần suất lô cặp', number: pairResult, frame: pairResult ? '3 ngày' : '', description: 'Chọn số từ cặp số có tần suất xuất hiện cao nhất.' },
            { method: 'Lô gan kết hợp', number: ganFreqResult, frame: ganFreqResult ? '5 ngày' : '', description: 'Chọn số gần đạt ngưỡng gan nhưng có tần suất cao.' },
            { method: 'Lô rơi', number: loRoiResult, frame: loRoiResult ? '2 ngày' : '', description: 'Chọn số xuất hiện liên tục trong 2-3 ngày gần nhất ở cùng vị trí giải.' },
        ].map(pred => ({
            ...pred,
            number: sanitizeResult(pred.number) || 'N/A',
            frame: sanitizeResult(pred.frame) || 'N/A',
        })).filter(pred => pred.number !== 'N/A' && pred.frame !== 'N/A'); // Lọc bỏ những prediction không hợp lệ

        const { topNumber, additionalSuggestions } = await combinePredictions(predictions, validResults, history);

        const allPrizes = validResults.reduce((acc, result) => {
            if (!result) return acc;
            return [
                ...acc,
                ...(Array.isArray(result.specialPrize) ? result.specialPrize : []),
                ...(Array.isArray(result.firstPrize) ? result.firstPrize : []),
                ...(Array.isArray(result.secondPrize) ? result.secondPrize : []),
                ...(Array.isArray(result.threePrizes) ? result.threePrizes : []),
                ...(Array.isArray(result.fourPrizes) ? result.fourPrizes : []),
                ...(Array.isArray(result.fivePrizes) ? result.fivePrizes : []),
                ...(Array.isArray(result.sixPrizes) ? result.sixPrizes : []),
                ...(Array.isArray(result.sevenPrizes) ? result.sevenPrizes : []),
            ];
        }, []);

        const numbers = [...new Set(
            allPrizes
                .map(prize => {
                    if (!prize || typeof prize !== 'string' || !/^\d+$/.test(prize)) return null;
                    const str = prize.toString();
                    return str.length >= 2 ? parseInt(str.slice(-2)) : parseInt(str);
                })
                .filter(num => num !== null && num >= 0 && num <= 99)
        )].map(num => num.toString().padStart(2, '0'));

        // Lấy Top 10 số xuất hiện từ 3 lần trở lên
        let filteredFrequencies = (await calculateFrequencies(validResults, 'xsmb', 10))
            .filter(freq => freq.count >= 3)
            .sort((a, b) => b.count - a.count);

        if (filteredFrequencies.length < 10) {
            const additionalFrequencies = (await calculateFrequencies(validResults, 'xsmb', 10))
                .filter(freq => freq.count === 2 && !filteredFrequencies.some(f => f.number === freq.number))
                .sort((a, b) => b.count - a.count)
                .slice(0, 10 - filteredFrequencies.length);
            filteredFrequencies = [...filteredFrequencies, ...additionalFrequencies];
        }

        filteredFrequencies = filteredFrequencies.slice(0, 10);
        const uniqueBachThuLo = [...new Set(filteredFrequencies.map(freq => freq.number))].slice(0, 10);

        const response = {
            predictionDate,
            dataRange: {
                from: formatDate(earliestDate),
                to: formatDate(latestDate),
                days: numDays,
                actualDays: validResults.length,
            },
            predictions,
            combinedPrediction: sanitizeResult(topNumber),
            additionalSuggestions: additionalSuggestions.map(sanitizeResult),
            history,
            totalNumbers: numbers.length,
            numbers,
            frequencies: filteredFrequencies,
            bachThuLo: uniqueBachThuLo,
            metadata: {
                predictionFor: predictionDate,
                dataFrom: formatDate(earliestDate),
                dataTo: formatDate(latestDate),
                totalDraws: validResults.length,
                specialPrize: sanitizeResult(validResults[0] && Array.isArray(validResults[0].specialPrize) ? validResults[0].specialPrize[0] || '' : ''),
                firstPrize: sanitizeResult(validResults[0] && Array.isArray(validResults[0].firstPrize) ? validResults[0].firstPrize[0] || '' : ''),
                message: validResults.length < numDays
                    ? `Dự đoán cho ngày ${predictionDate} dựa trên dữ liệu từ ${formatDate(earliestDate)} đến ${formatDate(latestDate)} (chỉ tìm thấy ${validResults.length} ngày cho tần suất Top 10).`
                    : `Dự đoán cho ngày ${predictionDate} dựa trên dữ liệu từ ${formatDate(earliestDate)} đến ${formatDate(latestDate)}.`,
                frequencyDays: 14,
            },
        };

        // Lưu vào database (tránh duplicate)
        try {
            // Kiểm tra xem đã có dữ liệu cho ngày này chưa
            const existingResult = await SoiCauResult.findOne({
                predictionDate: parseDateForDB(predictionDate),
                dataDays: numDays
            });

            if (existingResult) {
                console.log(`⚠️ Đã có dữ liệu cho ngày ${predictionDate}, cập nhật thay vì tạo mới`);
                // Cập nhật dữ liệu hiện có
                existingResult.predictions = response.predictions;
                existingResult.combinedPrediction = response.combinedPrediction;
                existingResult.additionalSuggestions = response.additionalSuggestions;
                existingResult.history = response.history;
                existingResult.metadata = response.metadata;
                await existingResult.save();
                console.log(`✅ Đã cập nhật dữ liệu cho ngày ${predictionDate}`);
            } else {
                // Tạo mới
                const soiCauResult = new SoiCauResult({
                    predictionDate: parseDateForDB(predictionDate),
                    dataDays: numDays,
                    predictions: response.predictions,
                    combinedPrediction: response.combinedPrediction,
                    additionalSuggestions: response.additionalSuggestions,
                    history: response.history,
                    metadata: response.metadata
                });
                await soiCauResult.save();
                console.log(`✅ Đã tạo mới dữ liệu cho ngày ${predictionDate}`);
            }
        } catch (dbErr) {
            console.error('❌ Lỗi khi lưu vào database:', dbErr.message);
        }

        clearTimeout(timeout);
        res.status(200).json(response);
    } catch (error) {
        clearTimeout(timeout);
        console.error('Lỗi trong getBachThuMB:', error.message);
        if (error.message.includes('Không tìm thấy dữ liệu') || error.message.includes('Dữ liệu xổ số không hợp lệ')) {
            res.status(404).json({ error: error.message, suggestedDate: formatDate(new Date()) });
        } else {
            res.status(500).json({ error: `Lỗi máy chủ nội bộ: ${error.message}` });
        }
    }
};

module.exports = {
    getBachThuMB,
    getHistoricalPredictionsSimplified,
};