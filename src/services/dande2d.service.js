/**
 * Dàn Đề 2D Service
 * Logic nghiệp vụ cho việc tạo dàn đề 2D
 */

/**
 * Parse và chuẩn hóa input thành các cặp 2 chữ số
 * @param {string} input - Chuỗi input từ người dùng
 * @returns {Object} - {pairs: Array, error: string}
 */
const parseInput2D = (input) => {
    if (!input || typeof input !== 'string') {
        return { pairs: [], error: 'Input không hợp lệ' };
    }

    // Kiểm tra ký tự hợp lệ
    if (!/^[0-9\s,;]*$/.test(input)) {
        return {
            pairs: [],
            error: 'Vui lòng chỉ nhập số và các ký tự phân tách (, ; hoặc khoảng trắng)'
        };
    }

    // Chuẩn hóa: thay thế dấu cách và ; bằng ,
    const normalized = input
        .replace(/[;\s]+/g, ',')
        .replace(/,+/g, ',')
        .replace(/^,|,$/g, '');

    const nums = normalized.split(',')
        .map(num => num.trim())
        .filter(n => n);

    const pairs = [];

    nums.forEach(num => {
        const strNum = num.toString();
        if (strNum.length === 2 && !isNaN(parseInt(strNum))) {
            // Nếu là số 2 chữ số
            pairs.push(strNum.padStart(2, '0'));
        } else if (strNum.length >= 3 && !isNaN(parseInt(strNum))) {
            // Nếu có 3+ chữ số, tách thành các cặp 2 chữ số
            for (let i = 0; i < strNum.length - 1; i++) {
                const pair = strNum.slice(i, i + 2);
                pairs.push(pair.padStart(2, '0'));
            }
        }
    });

    return { pairs, error: null };
};

/**
 * Tính tần suất xuất hiện của các số
 * @param {Array} pairs - Mảng các cặp số 2 chữ số
 * @returns {Object} - {frequency: Object, total: number}
 */
const calculateFrequency = (pairs) => {
    const frequency = {};

    pairs.forEach(num => {
        frequency[num] = (frequency[num] || 0) + 1;
    });

    const total = pairs.length;

    return { frequency, total };
};

/**
 * Phân loại số theo levels dựa trên tần suất
 * @param {Object} frequency - Object chứa tần suất các số
 * @returns {Object} - Levels object
 */
const createLevels = (frequency) => {
    // Tạo tất cả số từ 00-99
    const allNumbers = Array.from({ length: 100 }, (_, i) =>
        i.toString().padStart(2, '0')
    );

    const levels = {};

    allNumbers.forEach(num => {
        const freq = frequency[num] || 0;
        if (!levels[freq]) {
            levels[freq] = [];
        }
        levels[freq].push(num);
    });

    // Sắp xếp số trong mỗi level
    Object.keys(levels).forEach(level => {
        levels[level].sort((a, b) => parseInt(a) - parseInt(b));
    });

    return levels;
};

/**
 * Tạo levels 1D từ dàn 2D
 * @param {Object} frequency - Tần suất các số 2D
 * @returns {Object} - Levels 1D (0-9)
 */
const createLevels1D = (frequency) => {
    const digitFrequency = {};

    // Đếm tần suất các chữ số 0-9
    Object.entries(frequency).forEach(([num, freq]) => {
        const digits = num.split('');
        digits.forEach(digit => {
            digitFrequency[digit] = (digitFrequency[digit] || 0) + freq;
        });
    });

    const levels1D = {};

    // Tạo levels cho 0-9
    for (let digit = 0; digit <= 9; digit++) {
        const freq = digitFrequency[digit.toString()] || 0;
        if (!levels1D[freq]) {
            levels1D[freq] = [];
        }
        levels1D[freq].push(digit);
    }

    // Sắp xếp
    Object.keys(levels1D).forEach(level => {
        levels1D[level].sort((a, b) => a - b);
    });

    return levels1D;
};

/**
 * Generate dàn đề 2D
 * @param {string} input - Input string từ người dùng
 * @returns {Object} - Kết quả với levels và metadata
 */
const generate2D = (input) => {
    // Parse input
    const { pairs, error } = parseInput2D(input);

    if (error) {
        throw new Error(error);
    }

    // Tính tần suất
    const { frequency, total } = calculateFrequency(pairs);

    // Tạo levels 2D và 1D
    const levels2D = createLevels(frequency);
    const levels1D = createLevels1D(frequency);

    return {
        levels2D,
        levels1D,
        totalSelected: total,
        frequency,
        timestamp: new Date().toISOString(),
        metadata: {
            uniqueNumbers: Object.keys(frequency).length,
            algorithm: 'Frequency Counter',
            version: '1.0.0'
        }
    };
};

module.exports = {
    generate2D,
    parseInput2D,
    calculateFrequency,
    createLevels,
    createLevels1D
};

