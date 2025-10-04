/**
 * Dàn Đề Service
 * Logic nghiệp vụ chính cho việc tạo dàn đề
 * Tối ưu hiệu suất với thuật toán Fisher-Yates shuffle
 */

const specialSetsUtil = require('../utils/specialSets');

/**
 * Shuffle mảng sử dụng Fisher-Yates algorithm (O(n) time complexity)
 * @param {Array} array - Mảng cần shuffle
 * @returns {Array} - Mảng đã được shuffle
 */
const shuffleArray = (array) => {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
};

/**
 * Tạo số ngẫu nhiên từ một kho số
 * @param {number} count - Số lượng số cần tạo
 * @param {Array} sourcePool - Kho số nguồn
 * @returns {Array} - Mảng số đã được sắp xếp
 */
const generateRandomNumbers = (count, sourcePool) => {
    const shuffled = shuffleArray(sourcePool);
    const selected = shuffled.slice(0, Math.min(count, sourcePool.length));
    return selected.sort((a, b) => parseInt(a) - parseInt(b));
};

/**
 * Tạo dàn đề ngẫu nhiên 9x-0x
 * @param {number} quantity - Số lượng dàn cần tạo
 * @param {Array} combinationNumbers - Mảng số mong muốn (tùy chọn)
 * @param {Array} excludeNumbers - Mảng loại bỏ số mong muốn (tùy chọn)
 * @param {boolean} excludeDoubles - Loại bỏ số kép bằng (tùy chọn)
 * @returns {Object} - Kết quả bao gồm levelsList và totalSelected
 */
const generateRandomDanDe = (quantity, combinationNumbers = [], excludeNumbers = [], excludeDoubles = false, specialSets = []) => {
    // Định nghĩa số lượng số cho mỗi cấp độ (giảm dần từ 95 xuống 8)
    const levelCounts = [95, 88, 78, 68, 58, 48, 38, 28, 18, 8];
    const levelsList = [];
    let totalSelected = 0;

    // Tạo từng dàn
    for (let i = 0; i < quantity; i++) {
        const levels = {};
        let currentDanTotal = 0;

        // Khởi tạo kho số ban đầu (00-99)
        let currentPool = Array.from({ length: 100 }, (_, index) =>
            index.toString().padStart(2, '0')
        );

        // Loại bỏ số kép bằng nếu được chọn
        if (excludeDoubles) {
            const doubleNumbers = ['00', '11', '22', '33', '44', '55', '66', '77', '88', '99'];
            currentPool = currentPool.filter(num => !doubleNumbers.includes(num));
        }

        // Logic chính: Xử lý theo từng trường hợp
        // Ưu tiên: Bộ số đặc biệt > Số mong muốn > Số loại bỏ

        if (specialSets && specialSets.length > 0) {
            // Trường hợp 1: Có bộ số đặc biệt (ưu tiên cao nhất)
            const combinedSpecialNumbers = specialSetsUtil.getCombinedSpecialSetNumbers(specialSets);

            // Loại bỏ số loại bỏ từ pool
            if (excludeNumbers && excludeNumbers.length > 0) {
                currentPool = currentPool.filter(num => !excludeNumbers.includes(num));
            }

            // Áp dụng logic phân tầng cho bộ số đặc biệt
            levelCounts.forEach((count, index) => {
                let numbers;
                const specialCount = combinedSpecialNumbers.length;

                // Tính toán số lượng số từ bộ đặc biệt cần có trong bậc này
                let requiredSpecialCount;
                if (count <= specialCount) {
                    // Nếu bậc nhỏ hơn hoặc bằng số lượng số trong bộ
                    // Chọn ngẫu nhiên 'count' số từ bộ số đặc biệt
                    requiredSpecialCount = count;
                } else {
                    // Nếu bậc lớn hơn số lượng số trong bộ
                    // Chọn tất cả số trong bộ + (count - specialCount) số ngẫu nhiên
                    requiredSpecialCount = specialCount;
                }

                // Lấy số từ bộ đặc biệt có sẵn trong pool hiện tại
                const availableSpecial = combinedSpecialNumbers.filter(num => currentPool.includes(num));

                if (availableSpecial.length >= requiredSpecialCount) {
                    // Đủ số từ bộ đặc biệt trong pool
                    // Chọn ngẫu nhiên requiredSpecialCount số từ bộ đặc biệt có sẵn
                    const selectedSpecial = generateRandomNumbers(requiredSpecialCount, availableSpecial);

                    // Lấy số ngẫu nhiên khác để đủ count số
                    const remainingCount = count - selectedSpecial.length;
                    const otherNumbers = currentPool.filter(num => !selectedSpecial.includes(num));
                    const selectedOthers = generateRandomNumbers(remainingCount, otherNumbers);

                    // Kết hợp và sắp xếp
                    numbers = [...selectedSpecial, ...selectedOthers].sort((a, b) => parseInt(a) - parseInt(b));
                } else {
                    // Không đủ số từ bộ đặc biệt trong pool, lấy tất cả có sẵn + số ngẫu nhiên
                    const selectedSpecial = [...availableSpecial];
                    const remainingCount = count - selectedSpecial.length;
                    const otherNumbers = currentPool.filter(num => !selectedSpecial.includes(num));
                    const selectedOthers = generateRandomNumbers(remainingCount, otherNumbers);

                    // Kết hợp và sắp xếp
                    numbers = [...selectedSpecial, ...selectedOthers].sort((a, b) => parseInt(a) - parseInt(b));
                }

                levels[count] = numbers;
                currentDanTotal += numbers.length;
                // Cập nhật pool cho bậc tiếp theo (giữ nguyên logic cũ)
                currentPool = numbers;
            });
        } else if ((!combinationNumbers || combinationNumbers.length === 0) && (!excludeNumbers || excludeNumbers.length === 0)) {
            // Trường hợp 2: Không có số mong muốn và không có số loại bỏ
            levelCounts.forEach(count => {
                const numbers = generateRandomNumbers(count, currentPool);
                levels[count] = numbers;
                currentDanTotal += numbers.length;
                currentPool = numbers;
            });
        } else if (excludeNumbers && excludeNumbers.length > 0 && (!combinationNumbers || combinationNumbers.length === 0)) {
            // Trường hợp 3: Chỉ có số loại bỏ (logic đơn giản: loại bỏ khỏi pool)
            // Loại bỏ số loại bỏ khỏi pool ban đầu
            currentPool = currentPool.filter(num => !excludeNumbers.includes(num));

            levelCounts.forEach(count => {
                const numbers = generateRandomNumbers(count, currentPool);
                levels[count] = numbers;
                currentDanTotal += numbers.length;
                currentPool = numbers;
            });
        } else if (combinationNumbers && combinationNumbers.length > 0) {
            // Trường hợp 4: Có số mong muốn (có thể kèm số loại bỏ)
            // Loại bỏ số loại bỏ từ pool trước khi xử lý
            if (excludeNumbers && excludeNumbers.length > 0) {
                currentPool = currentPool.filter(num => !excludeNumbers.includes(num));
            }
            // Logic mới: Phân tầng số mong muốn theo bậc
            levelCounts.forEach((count, index) => {
                let numbers;
                const combinationCount = combinationNumbers.length;

                // Tính toán số lượng số mong muốn cần có trong bậc này
                let requiredCombinationCount;
                if (count <= combinationCount) {
                    // Nếu bậc nhỏ hơn hoặc bằng số lượng số mong muốn
                    // Chọn ngẫu nhiên 'count' số từ số mong muốn
                    requiredCombinationCount = count;
                } else {
                    // Nếu bậc lớn hơn số lượng số mong muốn
                    // Chọn tất cả số mong muốn + (count - combinationCount) số ngẫu nhiên
                    requiredCombinationCount = combinationCount;
                }

                // Lấy số mong muốn có sẵn trong pool hiện tại
                const availableCombination = combinationNumbers.filter(num => currentPool.includes(num));

                if (availableCombination.length >= requiredCombinationCount) {
                    // Đủ số mong muốn trong pool
                    // Chọn ngẫu nhiên requiredCombinationCount số từ số mong muốn có sẵn
                    const selectedCombination = generateRandomNumbers(requiredCombinationCount, availableCombination);

                    // Lấy số ngẫu nhiên khác để đủ count số
                    const remainingCount = count - selectedCombination.length;
                    const otherNumbers = currentPool.filter(num => !selectedCombination.includes(num));
                    const selectedOthers = generateRandomNumbers(remainingCount, otherNumbers);

                    // Kết hợp và sắp xếp
                    numbers = [...selectedCombination, ...selectedOthers].sort((a, b) => parseInt(a) - parseInt(b));
                } else {
                    // Không đủ số mong muốn trong pool, lấy tất cả có sẵn + số ngẫu nhiên
                    const selectedCombination = [...availableCombination];
                    const remainingCount = count - selectedCombination.length;
                    const otherNumbers = currentPool.filter(num => !selectedCombination.includes(num));
                    const selectedOthers = generateRandomNumbers(remainingCount, otherNumbers);

                    // Kết hợp và sắp xếp
                    numbers = [...selectedCombination, ...selectedOthers].sort((a, b) => parseInt(a) - parseInt(b));
                }

                levels[count] = numbers;
                currentDanTotal += numbers.length;
                currentPool = numbers;
            });
        }

        levelsList.push(levels);
        totalSelected += currentDanTotal;
    }

    return {
        levelsList,
        totalSelected,
        quantity,
        combinationNumbers: combinationNumbers || [],
        excludeNumbers: excludeNumbers || [],
        excludeDoubles: excludeDoubles || false,
        timestamp: new Date().toISOString(),
        metadata: {
            levelCounts,
            algorithm: 'Fisher-Yates Shuffle with Full Logic Support',
            version: '4.0.0'
        }
    };
};

/**
 * Validate dàn đề
 * @param {Object} levels - Dàn đề cần validate
 * @returns {boolean} - Kết quả validate
 */
const validateDanDe = (levels) => {
    if (!levels || typeof levels !== 'object') {
        return false;
    }

    const levelCounts = [95, 88, 78, 68, 58, 48, 38, 28, 18, 8];

    for (const count of levelCounts) {
        if (!levels[count] || !Array.isArray(levels[count])) {
            return false;
        }
        if (levels[count].length > count) {
            return false;
        }
    }

    return true;
};

module.exports = {
    generateRandomDanDe,
    validateDanDe,
    shuffleArray,
    generateRandomNumbers
};

