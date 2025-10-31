/**
 * Soi Cầu Utilities - Các hàm hỗ trợ cho soi cầu
 * Tất cả đều deterministic (dựa trên dữ liệu thực tế), không random
 */

/**
 * Tính tam giác Pascal từ dãy số
 * @param {Array<number>} digits - Dãy số đầu vào
 * @returns {string} - 2 số cuối cùng sau khi tính tam giác Pascal
 */
function calculatePascalTriangle(digits) {
    if (!digits || digits.length < 2) return '';
    
    let result = [...digits];
    
    // Lặp lại việc cộng 2 chữ số liền kề, lấy mod 10
    while (result.length > 2) {
        const newRow = [];
        for (let i = 0; i < result.length - 1; i++) {
            newRow.push((result[i] + result[i + 1]) % 10);
        }
        result = newRow;
    }
    
    return result.join('').padStart(2, '0');
}

/**
 * Tạo seed deterministic từ dữ liệu thực tế
 * @param {Date} targetDate - Ngày mục tiêu
 * @param {Array} historicalData - Dữ liệu lịch sử
 * @returns {number} - Seed từ 0-99
 */
function generateDeterministicSeed(targetDate, historicalData) {
    if (!historicalData || historicalData.length === 0) {
        return targetDate.getDate() % 100;
    }
    
    // Yếu tố 1: Ngày trong năm
    const dayOfYear = Math.floor((targetDate - new Date(targetDate.getFullYear(), 0, 0)) / (1000 * 60 * 60 * 24));
    
    // Yếu tố 2: Thông tin từ dữ liệu lịch sử (ngày gần nhất)
    const latest = historicalData[0] || {};
    const specialPrize = Array.isArray(latest.specialPrize) && latest.specialPrize[0] ? latest.specialPrize[0].toString() : '00000';
    const firstPrize = Array.isArray(latest.firstPrize) && latest.firstPrize[0] ? latest.firstPrize[0].toString() : '00000';
    
    // Lấy từng chữ số để tạo seed đa dạng
    const spDigits = specialPrize.split('').map(Number).filter(n => !isNaN(n));
    const fpDigits = firstPrize.split('').map(Number).filter(n => !isNaN(n));
    
    // Yếu tố 3: Ngày trong tuần và tháng
    const dayOfWeek = targetDate.getDay();
    const dayOfMonth = targetDate.getDate();
    const month = targetDate.getMonth() + 1;
    
    // Tính tổng từ tất cả yếu tố
    const sum = dayOfYear +
        (spDigits.reduce((a, b) => a + b, 0) % 100) +
        (fpDigits.reduce((a, b) => a + b, 0) % 100) +
        (dayOfWeek * 7) +
        (dayOfMonth * 3) +
        (month * 5);
    
    return sum % 100;
}

/**
 * Tính tần suất cặp lô (AB và BA là 1 cặp)
 * @param {Array} results - Dữ liệu lịch sử
 * @param {number} days - Số ngày để tính
 * @returns {Map} - Map với key là cặp lô (sorted), value là tần suất
 */
function calculatePairFrequency(results, days = 30) {
    const pairCount = new Map();
    const recentResults = results.slice(0, days);
    
    recentResults.forEach(result => {
        if (!result) return;
        
        // Lấy tất cả 2 số cuối từ các giải
        const allNumbers = [
            ...(Array.isArray(result.specialPrize) ? result.specialPrize : []),
            ...(Array.isArray(result.firstPrize) ? result.firstPrize : []),
            ...(Array.isArray(result.secondPrize) ? result.secondPrize : []),
            ...(Array.isArray(result.threePrizes) ? result.threePrizes : []),
            ...(Array.isArray(result.fourPrizes) ? result.fourPrizes : []),
            ...(Array.isArray(result.fivePrizes) ? result.fivePrizes : []),
            ...(Array.isArray(result.sixPrizes) ? result.sixPrizes : []),
            ...(Array.isArray(result.sevenPrizes) ? result.sevenPrizes : [])
        ]
            .map(prize => prize ? prize.toString().slice(-2) : '')
            .filter(num => num && /^\d{2}$/.test(num));
        
        // Tạo set để loại bỏ trùng lặp trong cùng 1 ngày
        // QUAN TRỌNG: Sắp xếp để đảm bảo thứ tự deterministic
        const uniqueNumbers = [...new Set(allNumbers)].sort();
        
        // Tạo tất cả các cặp có thể từ các số trong cùng 1 ngày
        for (let i = 0; i < uniqueNumbers.length; i++) {
            for (let j = i + 1; j < uniqueNumbers.length; j++) {
                const num1 = uniqueNumbers[i];
                const num2 = uniqueNumbers[j];
                
                // AB và BA là cùng 1 cặp (sorted)
                const pair = [num1, num2].sort().join('-');
                pairCount.set(pair, (pairCount.get(pair) || 0) + 1);
            }
        }
    });
    
    return pairCount;
}

/**
 * Tính số ngày gan (lâu chưa về) cho mỗi lô
 * @param {Array} results - Dữ liệu lịch sử (sắp xếp từ mới nhất đến cũ nhất)
 * @returns {Map} - Map với key là lô (2 số), value là số ngày gan
 */
function calculateGanDays(results) {
    const ganMap = new Map();
    
    // QUAN TRỌNG: Khởi tạo tất cả lô từ 00-99 theo thứ tự để đảm bảo deterministic
    // Sử dụng Array thay vì vòng lặp for để đảm bảo thứ tự
    const allNumbers = Array.from({ length: 100 }, (_, i) => i.toString().padStart(2, '0'));
    allNumbers.forEach(num => {
        ganMap.set(num, -1);
    });
    
    // Duyệt từ ngày mới nhất đến cũ nhất
    results.forEach((result, index) => {
        if (!result) return;
        
        // Lấy tất cả 2 số cuối từ các giải
        const allNumbers = [
            ...(Array.isArray(result.specialPrize) ? result.specialPrize : []),
            ...(Array.isArray(result.firstPrize) ? result.firstPrize : []),
            ...(Array.isArray(result.secondPrize) ? result.secondPrize : []),
            ...(Array.isArray(result.threePrizes) ? result.threePrizes : []),
            ...(Array.isArray(result.fourPrizes) ? result.fourPrizes : []),
            ...(Array.isArray(result.fivePrizes) ? result.fivePrizes : []),
            ...(Array.isArray(result.sixPrizes) ? result.sixPrizes : []),
            ...(Array.isArray(result.sevenPrizes) ? result.sevenPrizes : [])
        ]
            .map(prize => prize ? prize.toString().slice(-2) : '')
            .filter(num => num && /^\d{2}$/.test(num));
        
        // Set gan = index (số ngày từ ngày hiện tại) cho các số xuất hiện
        // QUAN TRỌNG: Sắp xếp uniqueNumbers để đảm bảo thứ tự deterministic
        const uniqueNumbers = [...new Set(allNumbers)].sort();
        uniqueNumbers.forEach(num => {
            if (ganMap.get(num) === -1) {
                ganMap.set(num, index);
            }
        });
    });
    
    return ganMap;
}

/**
 * Đếm số nháy của mỗi lô trong kết quả
 * @param {Object} result - Kết quả xổ số 1 ngày
 * @returns {Map} - Map với key là lô (2 số), value là số nháy
 */
function countNhay(result) {
    const nhayMap = new Map();
    
    if (!result) return nhayMap;
    
    // Lấy tất cả 2 số cuối từ các giải
    const allNumbers = [
        ...(Array.isArray(result.specialPrize) ? result.specialPrize : []),
        ...(Array.isArray(result.firstPrize) ? result.firstPrize : []),
        ...(Array.isArray(result.secondPrize) ? result.secondPrize : []),
        ...(Array.isArray(result.threePrizes) ? result.threePrizes : []),
        ...(Array.isArray(result.fourPrizes) ? result.fourPrizes : []),
        ...(Array.isArray(result.fivePrizes) ? result.fivePrizes : []),
        ...(Array.isArray(result.sixPrizes) ? result.sixPrizes : []),
        ...(Array.isArray(result.sevenPrizes) ? result.sevenPrizes : [])
    ]
        .map(prize => prize ? prize.toString().slice(-2) : '')
        .filter(num => num && /^\d{2}$/.test(num));
    
    // Đếm số lần xuất hiện
    allNumbers.forEach(num => {
        nhayMap.set(num, (nhayMap.get(num) || 0) + 1);
    });
    
    return nhayMap;
}

/**
 * Kiểm tra lô rơi liên tục trong nhiều ngày
 * @param {Array} results - Dữ liệu lịch sử (sắp xếp từ mới nhất)
 * @param {string} number - Số cần kiểm tra
 * @param {number} minDays - Số ngày tối thiểu
 * @returns {number} - Số ngày rơi liên tục (0 nếu không rơi)
 */
function checkConsecutiveDays(results, number, minDays = 2) {
    if (!results || results.length < minDays) return 0;
    
    let consecutiveDays = 0;
    
    for (let i = 0; i < results.length; i++) {
        const result = results[i];
        if (!result) break;
        
        // Lấy tất cả 2 số cuối từ các giải
        const allNumbers = [
            ...(Array.isArray(result.specialPrize) ? result.specialPrize : []),
            ...(Array.isArray(result.firstPrize) ? result.firstPrize : []),
            ...(Array.isArray(result.secondPrize) ? result.secondPrize : []),
            ...(Array.isArray(result.threePrizes) ? result.threePrizes : []),
            ...(Array.isArray(result.fourPrizes) ? result.fourPrizes : []),
            ...(Array.isArray(result.fivePrizes) ? result.fivePrizes : []),
            ...(Array.isArray(result.sixPrizes) ? result.sixPrizes : []),
            ...(Array.isArray(result.sevenPrizes) ? result.sevenPrizes : [])
        ]
            .map(prize => prize ? prize.toString().slice(-2) : '')
            .filter(num => num && /^\d{2}$/.test(num));
        
        if (allNumbers.includes(number)) {
            consecutiveDays++;
        } else {
            break; // Dừng nếu không rơi liên tục
        }
    }
    
    return consecutiveDays >= minDays ? consecutiveDays : 0;
}

module.exports = {
    calculatePascalTriangle,
    generateDeterministicSeed,
    calculatePairFrequency,
    calculateGanDays,
    countNhay,
    checkConsecutiveDays
};

