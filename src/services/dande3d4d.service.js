/**
 * Dàn Đề 3D/4D Service
 * Logic nghiệp vụ cho việc tạo dàn đề 3D và 4D
 */

/**
 * Parse và chuẩn hóa input thành các số 3 chữ số (3D) hoặc 4 chữ số (4D)
 * @param {string} input - Chuỗi input từ người dùng
 * @param {number} digitCount - Số chữ số (3 hoặc 4)
 * @returns {Object} - {numbers: Array, error: string}
 */
const parseInputND = (input, digitCount = 3) => {
    if (!input || typeof input !== 'string') {
        return { numbers: [], error: 'Input không hợp lệ' };
    }

    // Kiểm tra ký tự hợp lệ
    if (!/^[0-9\s,;]*$/.test(input)) {
        return {
            numbers: [],
            error: 'Vui lòng chỉ nhập số và các ký tự phân tách (, ; hoặc khoảng trắng)'
        };
    }

    // Chuẩn hóa
    const normalized = input
        .replace(/[;\s]+/g, ',')
        .replace(/,+/g, ',')
        .replace(/^,|,$/g, '');

    const nums = normalized.split(',')
        .map(num => num.trim())
        .filter(n => n);

    const numbers = [];
    const errors = [];

    nums.forEach(num => {
        if (!/^\d+$/.test(num)) {
            errors.push(`"${num}" không phải là số hợp lệ`);
        } else if (num.length < digitCount) {
            errors.push(`"${num}" quá ngắn (cần ít nhất ${digitCount} chữ số)`);
        } else if (num.length >= digitCount) {
            // Tách thành các số có digitCount chữ số
            for (let i = 0; i <= num.length - digitCount; i++) {
                const extracted = num.slice(i, i + digitCount);
                numbers.push(extracted);
            }
        }
    });

    if (errors.length > 0 && numbers.length === 0) {
        return { numbers: [], error: errors.join('; ') };
    }

    return { numbers, error: null };
};

/**
 * Tính tần suất xuất hiện của các số
 * @param {Array} numbers - Mảng các số
 * @returns {Object} - {frequency: Object, total: number}
 */
const calculateFrequency = (numbers) => {
    const frequency = {};

    numbers.forEach(num => {
        frequency[num] = (frequency[num] || 0) + 1;
    });

    const total = numbers.length;

    return { frequency, total };
};

/**
 * Phân loại số theo levels dựa trên tần suất
 * @param {Object} frequency - Object chứa tần suất các số
 * @returns {Object} - Levels object
 */
const createLevels = (frequency) => {
    const levels = {};

    Object.entries(frequency).forEach(([num, freq]) => {
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
 * Generate dàn đề 3D
 * @param {string} input - Input string từ người dùng
 * @returns {Object} - Kết quả với levels và metadata
 */
const generate3D = (input) => {
    const { numbers, error } = parseInputND(input, 3);

    if (error) {
        throw new Error(error);
    }

    if (numbers.length === 0) {
        throw new Error('Không có số hợp lệ nào được tìm thấy');
    }

    const { frequency, total } = calculateFrequency(numbers);
    const levels = createLevels(frequency);

    return {
        levels,
        totalSelected: total,
        frequency,
        timestamp: new Date().toISOString(),
        metadata: {
            uniqueNumbers: Object.keys(frequency).length,
            type: '3D',
            algorithm: 'Frequency Counter',
            version: '1.0.0'
        }
    };
};

/**
 * Generate dàn đề 4D
 * @param {string} input - Input string từ người dùng
 * @returns {Object} - Kết quả với levels và metadata
 */
const generate4D = (input) => {
    const { numbers, error } = parseInputND(input, 4);

    if (error) {
        throw new Error(error);
    }

    if (numbers.length === 0) {
        throw new Error('Không có số hợp lệ nào được tìm thấy');
    }

    const { frequency, total } = calculateFrequency(numbers);
    const levels = createLevels(frequency);

    return {
        levels,
        totalSelected: total,
        frequency,
        timestamp: new Date().toISOString(),
        metadata: {
            uniqueNumbers: Object.keys(frequency).length,
            type: '4D',
            algorithm: 'Frequency Counter',
            version: '1.0.0'
        }
    };
};

module.exports = {
    generate3D,
    generate4D,
    parseInputND,
    calculateFrequency,
    createLevels
};

