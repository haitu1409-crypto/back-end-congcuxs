const XSMB = require('../models/xsmb.model');
const SoiCauResult = require('../models/soiCauResult.model');
const soiCauSyncService = require('../services/soiCauSync.service');
const soiCauUtils = require('../utils/soiCauUtils');
const memoryCache = require('../utils/memoryCache');

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
    // QUAN TRỌNG: Đảm bảo results đã được sắp xếp theo drawDate giảm dần để deterministic
    const sortedResults = [...results].sort((a, b) => {
        if (!a || !b) return 0;
        const dateA = a.drawDate ? new Date(a.drawDate) : new Date(0);
        const dateB = b.drawDate ? new Date(b.drawDate) : new Date(0);
        return dateB - dateA; // Giảm dần (mới nhất trước)
    });
    
    const allNumbers = sortedResults.reduce((acc, result) => {
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
        .sort((a, b) => {
            // QUAN TRỌNG: Nếu count bằng nhau, sort theo number để deterministic
            if (b.count !== a.count) return b.count - a.count;
            return a.number.localeCompare(b.number);
        });

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

// Pascal method - Nâng cấp: Ghép đúng 10 chữ số từ ĐB (5) + G1 (5)
const applyPascal = async (results, diamondResult, pairResult, historicalPredictions, targetDate) => {
    if (!results[0]) return '';
    const latestResult = results[0];
    const specialPrize = Array.isArray(latestResult.specialPrize) && latestResult.specialPrize[0] ? latestResult.specialPrize[0] : '';
    const firstPrize = Array.isArray(latestResult.firstPrize) && latestResult.firstPrize[0] ? latestResult.firstPrize[0] : '';
    
    if (!specialPrize || !firstPrize || !/^\d+$/.test(specialPrize) || !/^\d+$/.test(firstPrize)) {
        return '';
    }

    // NÂNG CẤP: Ghép đúng 10 chữ số (5 chữ số ĐB + 5 chữ số G1)
    const spDigits = specialPrize.toString().padStart(5, '0').slice(-5).split('').map(Number);
    const fpDigits = firstPrize.toString().padStart(5, '0').slice(-5).split('').map(Number);
    const combinedDigits = [...spDigits, ...fpDigits]; // 10 chữ số
    
    // Tính tam giác Pascal từ 10 chữ số
    const pascalResult = soiCauUtils.calculatePascalTriangle(combinedDigits);
    
    if (!pascalResult) return '';

    // Lấy top numbers từ tần suất để có thêm options
    const frequencies = await calculateFrequencies(results, 'xsmb', Math.min(results.length, 14));
    const topNumbers = frequencies.slice(0, 10).map(item => item.number);

    // Tạo candidates: Pascal result + top numbers + fallback
    const candidates = [pascalResult, ...topNumbers.slice(0, 5), diamondResult, pairResult].filter(n => n && n !== '');
    
    // Tránh trùng lặp với các ngày gần đây
    const filteredCandidates = await soiCauSyncService.avoidDuplicates(candidates, targetDate || new Date(), 7, false);
    
    // Chọn deterministic dựa trên seed từ dữ liệu thực tế
    if (filteredCandidates.length > 0) {
        return soiCauSyncService.selectFromCandidates(filteredCandidates, targetDate || new Date(), results);
    } else if (candidates.length > 0) {
        return soiCauSyncService.selectFromCandidates(candidates, targetDate || new Date(), results);
    }

    return pascalResult || '';
};

// Diamond Shape method - Nâng cấp: Kết hợp logic mô tả (G3/G4/G5) và logic hiện tại
const applyDiamondShape = async (results, numDays, historicalPredictions, targetDate) => {
    if (!results.length) return '';
    
    const latestResult = results[0];
    
    // NÂNG CẤP: Ưu tiên lấy từ G3, G4, G5 như mô tả, nhưng cũng dùng dữ liệu từ nhiều ngày
    const g3Numbers = Array.isArray(latestResult.threePrizes) 
        ? latestResult.threePrizes.map(p => p ? p.toString().slice(-2) : '').filter(p => p).slice(0, 6)
        : [];
    const g4Numbers = Array.isArray(latestResult.fourPrizes)
        ? latestResult.fourPrizes.map(p => p ? p.toString().slice(-2) : '').filter(p => p).slice(0, 4)
        : [];
    const g5Numbers = Array.isArray(latestResult.fivePrizes)
        ? latestResult.fivePrizes.map(p => p ? p.toString().slice(-2) : '').filter(p => p).slice(0, 6)
        : [];
    
    // Xếp thành bảng 3 hàng: G3 (hàng 1), G4 (hàng 2), G5 (hàng 3)
    const table = [g3Numbers, g4Numbers, g5Numbers];
    
    let diamondResult = '';
    
    // Tìm pattern A-B-A trong bảng (theo logic mô tả)
    // Pattern có thể là: G3[i] = G3[j] và G5[k] nằm giữa, hoặc G5[i] = G5[j] và G3[k] nằm giữa
    for (let row = 0; row < table.length; row++) {
        const currentRow = table[row];
        for (let i = 0; i < currentRow.length - 2; i++) {
            for (let j = i + 2; j < currentRow.length; j++) {
                if (currentRow[i] === currentRow[j]) {
                    // Tìm số B ở giữa hoặc ở hàng khác
                    const a = currentRow[i];
                    
                    // Kiểm tra hàng giữa (G4) hoặc hàng đối diện
                    const middleRow = row === 0 ? table[1] : (row === 2 ? table[1] : []);
                    const oppositeRow = row === 0 ? table[2] : table[0];
                    
                    // Tìm số B (khác A) ở giữa hoặc ở hàng khác
                    for (let k = 0; k < middleRow.length; k++) {
                        if (middleRow[k] && middleRow[k] !== a) {
                            diamondResult = middleRow[k];
                            break;
                        }
                    }
                    if (diamondResult) break;
                    
                    for (let k = 0; k < oppositeRow.length; k++) {
                        if (oppositeRow[k] && oppositeRow[k] !== a) {
                            diamondResult = oppositeRow[k];
                            break;
                        }
                    }
                    if (diamondResult) break;
                }
            }
            if (diamondResult) break;
        }
        if (diamondResult) break;
    }
    
    // Fallback: Nếu không tìm thấy pattern trong bảng, dùng logic hiện tại (tìm trong dãy phẳng)
    if (!diamondResult) {
        const recentResults = results.slice(0, 3);
        const allLastTwoDigits = recentResults
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
                ];
            }, [])
            .map(prize => prize ? prize.toString().slice(-2) : '').filter(prize => prize);
        
        // Tìm pattern A-B-A trong dãy phẳng
        for (let i = 0; i < allLastTwoDigits.length - 2; i++) {
            for (let j = i + 1; j < allLastTwoDigits.length - 1; j++) {
                const [a, b, c] = [allLastTwoDigits[i], allLastTwoDigits[j], allLastTwoDigits[j + 1]];
                if (a === c && a !== b && b) {
                    diamondResult = b.padStart(2, '0');
                    break;
                }
            }
            if (diamondResult) break;
        }
        
        if (!diamondResult && allLastTwoDigits.length > 0) {
            // Ưu tiên số từ G3/G4/G5 nếu có
            const preferred = [...g3Numbers, ...g4Numbers, ...g5Numbers].filter(n => n);
            if (preferred.length > 0) {
                diamondResult = preferred[0];
            } else {
                diamondResult = allLastTwoDigits[0];
            }
        }
    }

    if (diamondResult) {
        // Loại bỏ gan
        const ganNumbers = await calculateGanNumbers(results, 'xsmb', numDays);
        if (ganNumbers.includes(diamondResult)) {
            const frequencies = await calculateFrequencies(results, 'xsmb', numDays);
            const topNumbers = frequencies.slice(0, 10).map(item => item.number);
            const candidates = [...topNumbers, ...g3Numbers, ...g4Numbers, ...g5Numbers]
                .filter(n => n && !ganNumbers.includes(n));
            if (candidates.length > 0) {
                diamondResult = soiCauSyncService.selectFromCandidates(candidates, targetDate || new Date(), results);
            }
        }
        
        // Tránh trùng lặp
        const candidates = [diamondResult].filter(n => n);
        const filtered = await soiCauSyncService.avoidDuplicates(candidates, targetDate || new Date(), 7, false);
        if (filtered.length > 0) {
            return filtered[0];
        }
    }
    
    return diamondResult || '';
};

// Frequency-based Pairs method - Nâng cấp: Tính cặp lô (AB-BA), điều kiện logic
const applyFrequencyPairs = async (results, historicalPredictions, targetDate) => {
    if (!results.length) return '';
    
    // NÂNG CẤP: Lấy 30 ngày để tính tần suất cặp lô
    const daysToCheck = Math.min(30, results.length);
    const recentResults = results.slice(0, daysToCheck);
    
    // Tính tần suất cặp lô (AB và BA là cùng 1 cặp)
    const pairFrequency = soiCauUtils.calculatePairFrequency(recentResults, daysToCheck);
    
    if (pairFrequency.size === 0) return '';
    
    // Sắp xếp theo tần suất giảm dần
    const sortedPairs = Array.from(pairFrequency.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10); // Top 10 cặp
    
    // Lấy số đã về hôm qua (ngày gần nhất)
    const latestResult = results[0];
    const yesterdayNumbers = new Set();
    if (latestResult) {
        const allNumbers = [
            ...(Array.isArray(latestResult.specialPrize) ? latestResult.specialPrize : []),
            ...(Array.isArray(latestResult.firstPrize) ? latestResult.firstPrize : []),
            ...(Array.isArray(latestResult.secondPrize) ? latestResult.secondPrize : []),
            ...(Array.isArray(latestResult.threePrizes) ? latestResult.threePrizes : []),
            ...(Array.isArray(latestResult.fourPrizes) ? latestResult.fourPrizes : []),
            ...(Array.isArray(latestResult.fivePrizes) ? latestResult.fivePrizes : []),
        ]
            .map(prize => prize ? prize.toString().slice(-2) : '')
            .filter(num => num && /^\d{2}$/.test(num));
        
        allNumbers.forEach(num => yesterdayNumbers.add(num));
    }
    
    // NÂNG CẤP: Logic "Nếu 1 con trong cặp đã về hôm qua → chọn con kia"
    const candidates = [];
    
    for (const [pair, frequency] of sortedPairs) {
        // Ưu tiên cặp có tần suất >10 lần (như mô tả)
        if (frequency >= 10) {
            const [num1, num2] = pair.split('-');
            
            // Nếu num1 đã về hôm qua → chọn num2
            if (yesterdayNumbers.has(num1)) {
                candidates.push({ number: num2, frequency, priority: 2 }); // Priority cao hơn
            }
            // Nếu num2 đã về hôm qua → chọn num1
            else if (yesterdayNumbers.has(num2)) {
                candidates.push({ number: num1, frequency, priority: 2 });
            }
            // Nếu cả 2 đều chưa về → thêm cả 2 nhưng priority thấp hơn
            else {
                candidates.push({ number: num1, frequency, priority: 1 });
                candidates.push({ number: num2, frequency, priority: 1 });
            }
        }
    }
    
    // Nếu không có cặp nào thỏa điều kiện, lấy từ top cặp
    if (candidates.length === 0 && sortedPairs.length > 0) {
        const [num1, num2] = sortedPairs[0][0].split('-');
        candidates.push({ number: num1, frequency: sortedPairs[0][1], priority: 0 });
        candidates.push({ number: num2, frequency: sortedPairs[0][1], priority: 0 });
    }
    
    if (candidates.length === 0) return '';
    
    // Sắp xếp: Priority cao > Tần suất cao
    candidates.sort((a, b) => {
        if (b.priority !== a.priority) return b.priority - a.priority;
        return b.frequency - a.frequency;
    });
    
    // Chọn số tốt nhất, tránh trùng lặp
    const candidateNumbers = candidates.map(c => c.number);
    const filtered = await soiCauSyncService.avoidDuplicates(candidateNumbers, targetDate || new Date(), 7, false);
    
    if (filtered.length > 0) {
        return soiCauSyncService.selectFromCandidates(filtered, targetDate || new Date(), results);
    }
    
    return candidateNumbers[0] || '';
};

// Gan and Frequency Combination method - Nâng cấp: Gan >8 ngày, kết hợp ĐB, ưu tiên gan sắp nổ
const applyGanFrequency = async (results, numDays, historicalPredictions, targetDate) => {
    if (!results.length) return '';
    
    // QUAN TRỌNG: Đảm bảo results được sort đúng trước khi tính gan
    // Tính gan phụ thuộc vào thứ tự (results[0] phải là ngày mới nhất)
    const sortedResults = [...results].sort((a, b) => {
        if (!a || !b || !a.drawDate || !b.drawDate) return 0;
        const dateA = new Date(a.drawDate);
        const dateB = new Date(b.drawDate);
        return dateB - dateA; // Giảm dần (mới nhất trước)
    });
    
    // QUAN TRỌNG: Normalize targetDate về 00:00:00 trước khi tính toán
    const normalizedTargetDate = new Date(targetDate || new Date());
    normalizedTargetDate.setHours(0, 0, 0, 0);
    
    // NÂNG CẤP: Tính số ngày gan cho mỗi lô
    const ganMap = soiCauUtils.calculateGanDays(sortedResults);
    
    // Lấy chữ số cuối của ĐB hôm qua
    const latestResult = sortedResults[0];
    const specialPrize = Array.isArray(latestResult.specialPrize) && latestResult.specialPrize[0] 
        ? latestResult.specialPrize[0].toString() : '';
    const lastDigitDB = specialPrize ? specialPrize.slice(-1) : '';
    
    // NÂNG CẤP: Lọc gan >8 ngày và sắp xếp theo ưu tiên gan sắp nổ (9-12 ngày)
    // QUAN TRỌNG: Chuyển Map sang Array và sắp xếp để đảm bảo thứ tự deterministic
    const ganCandidates = [];
    
    // Chuyển Map sang Array và sắp xếp theo số để đảm bảo thứ tự ổn định
    const ganArray = Array.from(ganMap.entries())
        .filter(([number, ganDays]) => ganDays >= 8) // Chỉ lấy gan >8 ngày
        .sort((a, b) => a[0].localeCompare(b[0])); // Sắp xếp theo số để deterministic
    
    ganArray.forEach(([number, ganDays]) => {
        let priority = 0;
        
        // Ưu tiên gan sắp nổ (9-12 ngày) - priority cao nhất
        if (ganDays >= 9 && ganDays <= 12) {
            priority = 3;
        }
        // Gan >12 ngày - priority trung bình
        else if (ganDays > 12) {
            priority = 2;
        }
        // Gan 8 ngày - priority thấp
        else {
            priority = 1;
        }
        
        // NÂNG CẤP: Kết hợp gan + chữ số cuối ĐB
        // Nếu số gan có chứa chữ số cuối ĐB → tăng priority
        if (lastDigitDB && (number.includes(lastDigitDB))) {
            priority += 1;
        }
        
        ganCandidates.push({ number, ganDays, priority });
    });
    
    // Sắp xếp: Priority cao > Gan cao (sắp nổ hơn) > Số thứ tự (đảm bảo deterministic)
    ganCandidates.sort((a, b) => {
        if (b.priority !== a.priority) return b.priority - a.priority;
        // Nếu cùng priority, ưu tiên gan trong khoảng 9-12 (sắp nổ nhất)
        const aNearNop = a.ganDays >= 9 && a.ganDays <= 12;
        const bNearNop = b.ganDays >= 9 && b.ganDays <= 12;
        if (aNearNop !== bNearNop) return bNearNop ? 1 : -1;
        if (b.ganDays !== a.ganDays) return b.ganDays - a.ganDays;
        // QUAN TRỌNG: Nếu vẫn bằng nhau, sắp xếp theo số (string) để đảm bảo thứ tự ổn định
        return a.number.localeCompare(b.number);
    });
    
    // Lấy top 10 gan (nhưng vẫn giữ logic mô tả là top 5)
    const topGan = ganCandidates.slice(0, 10).map(item => item.number);
    
    if (topGan.length === 0) return '';
    
    // NÂNG CẤP: Kết hợp với tần suất cao để tăng độ chính xác
    const frequencies = await calculateFrequencies(sortedResults, 'xsmb', numDays);
    // QUAN TRỌNG: Chuyển sang Set để lookup nhanh, nhưng vẫn giữ thứ tự topGan
    const highFreqNumbersSet = new Set(frequencies.slice(0, 10).map(item => item.number));
    
    // Ưu tiên gan có tần suất cao
    // QUAN TRỌNG: Giữ nguyên thứ tự topGan (đã được sort deterministic)
    // Duyệt theo thứ tự topGan để đảm bảo deterministic
    const bestCandidates = [];
    for (const num of topGan) {
        if (highFreqNumbersSet.has(num)) {
            bestCandidates.push(num);
        }
    }
    
    // Tạo candidates: Gan có tần suất cao > Gan sắp nổ > Gan thường
    // QUAN TRỌNG: Luôn giữ nguyên thứ tự từ topGan để đảm bảo deterministic
    const candidates = bestCandidates.length > 0 ? bestCandidates : topGan;
    
    // Tránh trùng lặp
    const filtered = await soiCauSyncService.avoidDuplicates(candidates, normalizedTargetDate, 7, false);
    
    // QUAN TRỌNG: Luôn chọn phần tử đầu tiên (đã được sort kỹ) để đảm bảo deterministic
    // KHÔNG dùng selectFromCandidates với seed vì seed có thể tạo ra sự không nhất quán
    // (mặc dù seed đã được normalize, nhưng nếu có nhiều candidates cùng priority,
    // thì việc dùng seed sẽ luân phiên giữa các candidates)
    if (filtered.length > 0) {
        return filtered[0]; // Luôn chọn phần tử đầu tiên
    }
    
    // Fallback: Chọn phần tử đầu tiên từ candidates
    return candidates[0] || '';
};

// Lô rơi method - Nâng cấp: 27 lô, ưu tiên ĐB/G1/2 nháy/rơi liên tục
const applyLoRoi = async (results, historicalPredictions, targetDate) => {
    if (results.length < 2 || !results[0] || !results[1]) return '';

    const latestResult = results[0];
    const previousResult = results[1];
    
    // NÂNG CẤP: Lấy tất cả 27 lô từ ngày hôm qua (đầy đủ tất cả giải)
    const getAllNumbers = (result) => {
        if (!result) return [];
        return [
            ...(Array.isArray(result.specialPrize) ? result.specialPrize : []),
            ...(Array.isArray(result.firstPrize) ? result.firstPrize : []),
            ...(Array.isArray(result.secondPrize) ? result.secondPrize : []),
            ...(Array.isArray(result.threePrizes) ? result.threePrizes : []),
            ...(Array.isArray(result.fourPrizes) ? result.fourPrizes : []),
            ...(Array.isArray(result.fivePrizes) ? result.fivePrizes : []),
            ...(Array.isArray(result.sixPrizes) ? result.sixPrizes : []),
            ...(Array.isArray(result.sevenPrizes) ? result.sevenPrizes : []),
        ]
            .map(prize => prize ? prize.toString().slice(-2) : '')
            .filter(prize => prize && /^\d{2}$/.test(prize));
    };

    const yesterdayNumbers = getAllNumbers(latestResult);
    const dayBeforeNumbers = getAllNumbers(previousResult);
    
    // Tìm lô rơi (xuất hiện ở cả 2 ngày)
    const roiNumbers = yesterdayNumbers.filter(num => dayBeforeNumbers.includes(num));
    
    if (roiNumbers.length === 0) return '';

    // NÂNG CẤP: Tính số nháy cho mỗi lô hôm qua
    const nhayMap = soiCauUtils.countNhay(latestResult);
    
    // NÂNG CẤP: Kiểm tra lô rơi liên tục 2-3 ngày
    const consecutiveDaysMap = new Map();
    for (const num of roiNumbers) {
        const consecutiveDays = soiCauUtils.checkConsecutiveDays(results.slice(0, 3), num, 2);
        if (consecutiveDays >= 2) {
            consecutiveDaysMap.set(num, consecutiveDays);
        }
    }
    
    // NÂNG CẤP: Tạo candidates với ưu tiên theo mô tả
    const candidates = [];
    
    // Ưu tiên 1: Lô từ ĐB/G1
    const dbNumber = Array.isArray(latestResult.specialPrize) && latestResult.specialPrize[0] 
        ? latestResult.specialPrize[0].toString().slice(-2) : '';
    const g1Numbers = Array.isArray(latestResult.firstPrize) 
        ? latestResult.firstPrize.map(p => p ? p.toString().slice(-2) : '').filter(p => p)
        : [];
    
    for (const num of roiNumbers) {
        let priority = 0;
        
        // Ưu tiên cao nhất: Lô từ ĐB
        if (num === dbNumber) {
            priority = 5;
        }
        // Ưu tiên cao: Lô từ G1
        else if (g1Numbers.includes(num)) {
            priority = 4;
        }
        // Ưu tiên: Lô 2 nháy
        else if (nhayMap.get(num) >= 2) {
            priority = 3;
        }
        // Ưu tiên: Lô rơi liên tục 2-3 ngày
        else if (consecutiveDaysMap.has(num)) {
            priority = 2;
        }
        // Lô rơi thường
        else {
            priority = 1;
        }
        
        candidates.push({ number: num, priority, nhay: nhayMap.get(num) || 1, consecutiveDays: consecutiveDaysMap.get(num) || 0 });
    }
    
    // Sắp xếp: Priority cao > Nháy cao > Rơi liên tục nhiều ngày
    candidates.sort((a, b) => {
        if (b.priority !== a.priority) return b.priority - a.priority;
        if (b.nhay !== a.nhay) return b.nhay - a.nhay;
        return b.consecutiveDays - a.consecutiveDays;
    });
    
    // Lấy số tốt nhất
    const bestNumber = candidates[0]?.number;
    
    if (!bestNumber) return '';
    
    // Tránh trùng lặp
    const filtered = await soiCauSyncService.avoidDuplicates([bestNumber], targetDate || new Date(), 7, false);
    
    return filtered.length > 0 ? filtered[0] : bestNumber;
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
            
            // QUAN TRỌNG: Sort lại validPastResults để đảm bảo deterministic
            validPastResults.sort((a, b) => {
                if (!a || !b || !a.drawDate || !b.drawDate) return 0;
                const dateA = new Date(a.drawDate);
                const dateB = new Date(b.drawDate);
                return dateB - dateA; // Giảm dần (mới nhất trước)
            });

            if (validPastResults.length === 0) continue;

            // Sử dụng simplified historical predictions để tránh recursive call
            const pastHistory = await getHistoricalPredictionsSimplified(new Date(pastDate.getTime() - 24 * 60 * 60 * 1000), numDays);

            const pastTargetDate = new Date(pastDate.getTime() - 24 * 60 * 60 * 1000);
            const diamondResult = await applyDiamondShape(validPastResults, numDays, pastHistory, pastTargetDate);
            const pairResult = await applyFrequencyPairs(validPastResults, pastHistory, pastTargetDate);
            const pascalResult = await applyPascal(validPastResults, diamondResult, pairResult, pastHistory, pastTargetDate);
            const ganFreqResult = await applyGanFrequency(validPastResults, numDays, pastHistory, pastTargetDate);
            const loRoiResult = await applyLoRoi(validPastResults, pastHistory, pastTargetDate);

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

        // Normalize targetDate về 00:00:00 để đảm bảo cache key nhất quán
        const normalizedTargetDate = new Date(targetDate);
        normalizedTargetDate.setHours(0, 0, 0, 0);
        
        const predictionDate = formatDate(normalizedTargetDate);
        console.log(`📅 Predicting for requested date: ${predictionDate}`);

        const formattedTargetDate = formatDate(normalizedTargetDate);

        // PERFORMANCE: Check cache trước khi tính toán
        const cacheKey = `soicau:${predictionDate}:${numDays}`;
        const cachedResult = memoryCache.get(cacheKey);
        
        if (cachedResult) {
            console.log(`✅ Cache HIT for ${cacheKey}`);
            clearTimeout(timeout);
            return res.status(200).json(cachedResult);
        }
        
        console.log(`⚠️ Cache MISS for ${cacheKey}, tính toán real-time...`);

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
        
        // QUAN TRỌNG: Sort lại validResults theo drawDate giảm dần để đảm bảo deterministic
        // (đặc biệt quan trọng khi có extendedResults được push vào)
        validResults.sort((a, b) => {
            if (!a || !b || !a.drawDate || !b.drawDate) return 0;
            const dateA = new Date(a.drawDate);
            const dateB = new Date(b.drawDate);
            return dateB - dateA; // Giảm dần (mới nhất trước)
        });
        
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
        const diamondResult = await applyDiamondShape(validResults, numDays, history, targetDate);
        console.log(`✅ Diamond result: ${diamondResult}`);

        const pairResult = await applyFrequencyPairs(validResults, history, targetDate);
        console.log(`✅ Pair result: ${pairResult}`);

        const pascalResult = await applyPascal(validResults, diamondResult, pairResult, history, targetDate);
        console.log(`✅ Pascal result: ${pascalResult}`);

        const ganFreqResult = await applyGanFrequency(validResults, numDays, history, targetDate);
        console.log(`✅ Gan freq result: ${ganFreqResult}`);

        const loRoiResult = await applyLoRoi(validResults, history, targetDate);
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

        // PERFORMANCE: Lưu vào cache trước khi save database
        // Cache 1 giờ (3600s) - đủ lâu để tránh tính toán lại nhưng không quá cũ
        memoryCache.set(cacheKey, response, 3600);
        console.log(`✅ Đã cache kết quả cho ${cacheKey} (TTL: 3600s)`);

        // PERFORMANCE: Sử dụng findOneAndUpdate với upsert để tối ưu database operations
        // Thay vì findOne + save (2 operations) → chỉ cần 1 operation (atomic)
        // Giảm race condition và tăng performance
        try {
            const dbDate = parseDateForDB(predictionDate);
            const result = await SoiCauResult.findOneAndUpdate(
                {
                    predictionDate: dbDate,
                    dataDays: numDays
                },
                {
                    $set: {
                        predictions: response.predictions,
                        combinedPrediction: response.combinedPrediction,
                        additionalSuggestions: response.additionalSuggestions,
                        history: response.history,
                        metadata: response.metadata,
                        updatedAt: new Date()
                    }
                },
                {
                    upsert: true, // Tạo mới nếu chưa có
                    new: true, // Trả về document sau khi update
                    runValidators: false, // Tắt validators để tăng performance (đã validate ở business logic)
                    setDefaultsOnInsert: true // Set defaults khi insert mới
                }
            );
            
            if (result) {
                console.log(`✅ Đã ${result._id ? 'cập nhật' : 'tạo mới'} dữ liệu trong database cho ngày ${predictionDate} (findOneAndUpdate)`);
            }
        } catch (dbErr) {
            console.error('❌ Lỗi khi lưu vào database:', dbErr.message);
            // Không throw error để không ảnh hưởng đến response
            // Cache đã được lưu, nên user vẫn nhận được kết quả
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