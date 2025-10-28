/**
 * UTILITY FUNCTIONS ĐỂ EXTRACT DATA CHO BTĐ VÀ BTL
 * Tránh duplicate code trong các thuật toán
 */

/**
 * Extract data cho BẠCH THỦ ĐỀ
 * @param {Array} results - XSMB results từ database
 * @returns {Array} - [74, 81, 72, ...] 2 số cuối ĐB qua các ngày
 */
function extractDataForBTD(results) {
    if (!results || !Array.isArray(results)) return [];

    return results.map(result => {
        if (!result) return null;
        const specialPrize = Array.isArray(result.specialPrize) && result.specialPrize[0]
            ? parseInt(result.specialPrize[0].slice(-2)) : null;
        return specialPrize;
    }).filter(num => num !== null && num >= 0 && num <= 99);
}

/**
 * Extract data cho BẠCH THỦ LÔ - Phương án 1: Top số mỗi ngày
 * @param {Array} results - XSMB results từ database
 * @returns {Array} - [68, 45, 02, ...] Số xuất hiện nhiều nhất mỗi ngày
 */
function extractDataForBTL_TopNumber(results) {
    if (!results || !Array.isArray(results)) return [];

    return results.map(result => {
        if (!result) return null;

        // Lấy TẤT CẢ số trong ngày (27 số)
        const allNumbers = [
            ...(Array.isArray(result.sevenPrizes) ? result.sevenPrizes : []),
            ...(Array.isArray(result.sixPrizes) ? result.sixPrizes : []),
            ...(Array.isArray(result.fivePrizes) ? result.fivePrizes : []),
            ...(Array.isArray(result.fourPrizes) ? result.fourPrizes : []),
            ...(Array.isArray(result.threePrizes) ? result.threePrizes : []),
            ...(Array.isArray(result.secondPrize) ? result.secondPrize : []),
            ...(Array.isArray(result.firstPrize) ? result.firstPrize : []),
            ...(Array.isArray(result.specialPrize) ? result.specialPrize : [])
        ].map(num => parseInt(num.toString().slice(-2)));

        if (allNumbers.length === 0) return null;

        // Đếm tần suất
        const frequency = {};
        allNumbers.forEach(n => {
            if (n >= 0 && n <= 99) {
                frequency[n] = (frequency[n] || 0) + 1;
            }
        });

        // Lấy số xuất hiện nhiều nhất
        const sorted = Object.entries(frequency).sort((a, b) => b[1] - a[1]);
        return sorted.length > 0 ? parseInt(sorted[0][0]) : null;

    }).filter(num => num !== null && num >= 0 && num <= 99);
}

/**
 * Extract data cho BẠCH THỦ LÔ - Phương án 2: Tất cả số (cho Bayesian/Genetic)
 * @param {Array} results - XSMB results từ database
 * @returns {Object} - { allNumbers: [], frequency: {68: 28, 45: 25, ...} }
 */
function extractDataForBTL_AllNumbers(results) {
    if (!results || !Array.isArray(results)) return { allNumbers: [], frequency: {} };

    const allNumbers = [];
    const frequency = {};

    results.forEach(result => {
        if (!result) return;

        const dayNumbers = [
            ...(Array.isArray(result.sevenPrizes) ? result.sevenPrizes : []),
            ...(Array.isArray(result.sixPrizes) ? result.sixPrizes : []),
            ...(Array.isArray(result.fivePrizes) ? result.fivePrizes : []),
            ...(Array.isArray(result.fourPrizes) ? result.fourPrizes : []),
            ...(Array.isArray(result.threePrizes) ? result.threePrizes : []),
            ...(Array.isArray(result.secondPrize) ? result.secondPrize : []),
            ...(Array.isArray(result.firstPrize) ? result.firstPrize : []),
            ...(Array.isArray(result.specialPrize) ? result.specialPrize : [])
        ].map(num => parseInt(num.toString().slice(-2)));

        dayNumbers.forEach(n => {
            if (n >= 0 && n <= 99) {
                allNumbers.push(n);
                frequency[n] = (frequency[n] || 0) + 1;
            }
        });
    });

    return { allNumbers, frequency };
}

/**
 * Get top N most frequent numbers cho BTL
 */
function getTopFrequentNumbers(frequency, topN = 10) {
    return Object.entries(frequency)
        .sort((a, b) => b[1] - a[1])
        .slice(0, topN)
        .map(([num, count]) => ({
            number: parseInt(num),
            count: count,
            formatted: num.padStart(2, '0')
        }));
}

module.exports = {
    extractDataForBTD,
    extractDataForBTL_TopNumber,
    extractDataForBTL_AllNumbers,
    getTopFrequentNumbers
};


