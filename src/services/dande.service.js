/**
 * Dàn Đề Service
 * Logic nghiệp vụ chính cho việc tạo dàn đề
 * Tối ưu hiệu suất với thuật toán Fisher-Yates shuffle
 */

const specialSetsUtil = require('../utils/specialSets');

/**
 * Lấy số theo chạm (0-9)
 * @param {Array} touches - Mảng chạm
 * @returns {Array} - Mảng số theo chạm
 */
const getNumbersByTouch = (touches) => {
    const touchSets = {
        '0': ['00', '01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '20', '30', '40', '50', '60', '70', '80', '90'],
        '1': ['01', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '21', '31', '41', '51', '61', '71', '81', '91'],
        '2': ['02', '11', '20', '21', '22', '23', '24', '25', '26', '27', '28', '29', '32', '42', '52', '62', '72', '82', '92'],
        '3': ['03', '12', '21', '30', '31', '32', '33', '34', '35', '36', '37', '38', '39', '43', '53', '63', '73', '83', '93'],
        '4': ['04', '13', '22', '31', '40', '41', '42', '43', '44', '45', '46', '47', '48', '49', '54', '64', '74', '84', '94'],
        '5': ['05', '14', '23', '32', '41', '50', '51', '52', '53', '54', '55', '56', '57', '58', '59', '65', '75', '85', '95'],
        '6': ['06', '15', '24', '33', '42', '51', '60', '61', '62', '63', '64', '65', '66', '67', '68', '69', '76', '86', '96'],
        '7': ['07', '16', '25', '34', '43', '52', '61', '70', '71', '72', '73', '74', '75', '76', '77', '78', '79', '87', '97'],
        '8': ['08', '17', '26', '35', '44', '53', '62', '71', '80', '81', '82', '83', '84', '85', '86', '87', '88', '89', '98'],
        '9': ['09', '18', '27', '36', '45', '54', '63', '72', '81', '90', '91', '92', '93', '94', '95', '96', '97', '98', '99']
    };

    let result = [];
    touches.forEach(touch => {
        if (touchSets[touch]) {
            result = [...result, ...touchSets[touch]];
        }
    });

    return [...new Set(result)]; // Loại bỏ trùng lặp
};

/**
 * Lấy số theo tổng (0-9)
 * @param {Array} sums - Mảng tổng
 * @returns {Array} - Mảng số theo tổng
 */
const getNumbersBySum = (sums) => {
    const sumSets = {
        '0': ['00', '19', '28', '37', '46', '55', '64', '73', '82', '91'],
        '1': ['01', '10', '29', '38', '47', '56', '65', '74', '83', '92'],
        '2': ['02', '11', '20', '39', '48', '57', '66', '75', '84', '93'],
        '3': ['03', '12', '21', '30', '49', '58', '67', '76', '85', '94'],
        '4': ['04', '13', '22', '31', '40', '59', '68', '77', '86', '95'],
        '5': ['05', '14', '23', '32', '41', '50', '69', '78', '87', '96'],
        '6': ['06', '15', '24', '33', '42', '51', '60', '79', '88', '97'],
        '7': ['07', '16', '25', '34', '43', '52', '61', '70', '89', '98'],
        '8': ['08', '17', '26', '35', '44', '53', '62', '71', '80', '99'],
        '9': ['09', '18', '27', '36', '45', '54', '63', '72', '81', '90']
    };

    let result = [];
    sums.forEach(sum => {
        if (sumSets[sum]) {
            result = [...result, ...sumSets[sum]];
        }
    });

    return [...new Set(result)]; // Loại bỏ trùng lặp
};

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
 * Tạo dàn đề ngẫu nhiên 9x-0x với logic mới
 * @param {number} quantity - Số lượng dàn cần tạo
 * @param {Array} combinationNumbers - Mảng số mong muốn (tùy chọn)
 * @param {Array} excludeNumbers - Mảng loại bỏ số mong muốn (tùy chọn)
 * @param {boolean} excludeDoubles - Loại bỏ số kép bằng (tùy chọn)
 * @param {Array} specialSets - Mảng bộ số đặc biệt (tùy chọn)
 * @param {Array} touches - Mảng chạm (tùy chọn)
 * @param {Array} sums - Mảng tổng (tùy chọn)
 * @returns {Object} - Kết quả bao gồm levelsList và totalSelected
 */
const generateRandomDanDe = (quantity, combinationNumbers = [], excludeNumbers = [], excludeDoubles = false, specialSets = [], touches = [], sums = []) => {
    // Tính số lượng số thực tế có thể sử dụng
    let availableNumbers = 100; // Tổng số từ 00-99

    // Loại bỏ kép bằng (10 số)
    if (excludeDoubles) {
        availableNumbers -= 10;
    }

    // Loại bỏ số mong muốn
    if (excludeNumbers && excludeNumbers.length > 0) {
        availableNumbers -= excludeNumbers.length;
    }

    // Kiểm tra xung đột với số mong muốn
    if (combinationNumbers && combinationNumbers.length > 0) {
        // Nếu số mong muốn vượt quá số có sẵn, điều chỉnh
        if (combinationNumbers.length > availableNumbers) {
            console.warn(`Số mong muốn (${combinationNumbers.length}) vượt quá số có sẵn (${availableNumbers}). Điều chỉnh xuống ${availableNumbers} số.`);
            combinationNumbers = combinationNumbers.slice(0, availableNumbers);
        }
    }

    // Định nghĩa cấp độ dựa trên số lượng số thực tế
    let levelCounts;
    if (availableNumbers >= 95) {
        levelCounts = excludeDoubles ? [8, 18, 28, 38, 48, 58, 68, 78, 88, 90] : [8, 18, 28, 38, 48, 58, 68, 78, 88, 95];
    } else if (availableNumbers >= 90) {
        levelCounts = [8, 18, 28, 38, 48, 58, 68, 78, 88, availableNumbers];
    } else if (availableNumbers >= 80) {
        levelCounts = [8, 18, 28, 38, 48, 58, 68, 78, availableNumbers];
    } else if (availableNumbers >= 70) {
        levelCounts = [8, 18, 28, 38, 48, 58, 68, availableNumbers];
    } else if (availableNumbers >= 60) {
        levelCounts = [8, 18, 28, 38, 48, 58, availableNumbers];
    } else if (availableNumbers >= 50) {
        levelCounts = [8, 18, 28, 38, 48, availableNumbers];
    } else if (availableNumbers >= 40) {
        levelCounts = [8, 18, 28, 38, availableNumbers];
    } else if (availableNumbers >= 30) {
        levelCounts = [8, 18, 28, availableNumbers];
    } else if (availableNumbers >= 20) {
        levelCounts = [8, 18, availableNumbers];
    } else if (availableNumbers >= 10) {
        levelCounts = [8, availableNumbers];
    } else {
        // Trường hợp quá ít số, chỉ có bậc 8s
        levelCounts = [Math.min(8, availableNumbers)];
    }

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

        // Bước 1: Loại bỏ kép bằng (ưu tiên 1)
        if (excludeDoubles) {
            const doubleNumbers = ['00', '11', '22', '33', '44', '55', '66', '77', '88', '99'];
            currentPool = currentPool.filter(num => !doubleNumbers.includes(num));
        }

        // Bước 2: Loại bỏ số mong muốn (ưu tiên 2)
        if (excludeNumbers && excludeNumbers.length > 0) {
            currentPool = currentPool.filter(num => !excludeNumbers.includes(num));
        }

        // Bước 3: Chuẩn bị tất cả số ưu tiên (tiêu chí 3 + 4)
        let allPriorityNumbers = [];

        // Tiêu chí 3: Số mong muốn (ưu tiên cao nhất) - CHỈ LẤY SỐ CÒN LẠI TRONG POOL
        if (combinationNumbers && combinationNumbers.length > 0) {
            allPriorityNumbers = combinationNumbers.filter(num => currentPool.includes(num));
        }

        // Tiêu chí 4: Tổng + Bộ số đặc biệt + Chạm (ngang cấp nhau)
        let criteria4Numbers = [];
        let numberFrequency = {}; // Đếm tần suất xuất hiện

        if (sums && sums.length > 0) {
            const sumNumbers = getNumbersBySum(sums);
            sumNumbers.forEach(num => {
                criteria4Numbers.push(num);
                numberFrequency[num] = (numberFrequency[num] || 0) + 1;
            });
        }
        if (specialSets && specialSets.length > 0) {
            const specialNumbers = specialSetsUtil.getCombinedSpecialSetNumbers(specialSets);
            specialNumbers.forEach(num => {
                criteria4Numbers.push(num);
                numberFrequency[num] = (numberFrequency[num] || 0) + 1;
            });
        }
        if (touches && touches.length > 0) {
            const touchNumbers = getNumbersByTouch(touches);
            touchNumbers.forEach(num => {
                criteria4Numbers.push(num);
                numberFrequency[num] = (numberFrequency[num] || 0) + 1;
            });
        }

        // QUAN TRỌNG: Lọc bỏ các số đã bị loại bỏ khỏi tiêu chí 4
        // Chỉ giữ lại các số còn có sẵn trong currentPool
        const availableCriteria4Numbers = criteria4Numbers.filter(num => currentPool.includes(num));

        // Sắp xếp theo tần suất xuất hiện (nhiều nhất trước), sau đó theo thứ tự số
        // Lấy tất cả số từ tần suất cao nhất đến thấp nhất (kể cả tần suất 1)
        const uniqueCriteria4Numbers = [...new Set(availableCriteria4Numbers)].sort((a, b) => {
            const freqA = numberFrequency[a] || 0;
            const freqB = numberFrequency[b] || 0;

            // Ưu tiên tần suất cao hơn
            if (freqA !== freqB) {
                return freqB - freqA;
            }

            // Nếu tần suất bằng nhau, sắp xếp theo số
            return parseInt(a) - parseInt(b);
        });

        criteria4Numbers = uniqueCriteria4Numbers;

        // Xử lý từ bậc thấp lên cao (8s → 95s)
        levelCounts.forEach((count) => {
            let numbers = [];

            // Bước 1: Chọn số từ số mong muốn (tiêu chí 3) - CHỌN NGẪU NHIÊN THEO SỐ LƯỢNG CẦN THIẾT
            let finalNumbers = [];
            if (allPriorityNumbers.length > 0) {
                // Nếu số mong muốn >= số cần thiết, chọn ngẫu nhiên từ số mong muốn
                if (allPriorityNumbers.length >= count) {
                    finalNumbers = generateRandomNumbers(count, allPriorityNumbers);
                } else {
                    // Nếu số mong muốn < số cần thiết, lấy tất cả số mong muốn
                    finalNumbers = [...allPriorityNumbers];
                }
            }

            // Bước 2: Thêm từ tiêu chí 4 nếu còn thiếu (theo thứ tự ưu tiên đã sắp xếp)
            const remainingCount = count - finalNumbers.length;
            if (remainingCount > 0) {
            // Lấy số từ tiêu chí 4 có sẵn trong pool hiện tại, theo thứ tự ưu tiên
            const availableCriteria4 = uniqueCriteria4Numbers.filter(num =>
                currentPool.includes(num) && !finalNumbers.includes(num)
            );

                // Phân loại theo tần suất
                const highFreqNumbers = availableCriteria4.filter(num => (numberFrequency[num] || 0) > 1);
                const lowFreqNumbers = availableCriteria4.filter(num => (numberFrequency[num] || 0) === 1);

                // Lấy tất cả số có tần suất cao trước
                let selectedFromCriteria4 = [...highFreqNumbers];

                // Nếu còn thiếu, lấy ngẫu nhiên từ số có tần suất 1
                const stillNeeded = remainingCount - selectedFromCriteria4.length;
                if (stillNeeded > 0 && lowFreqNumbers.length > 0) {
                    const randomFromLowFreq = generateRandomNumbers(
                        Math.min(stillNeeded, lowFreqNumbers.length),
                        lowFreqNumbers
                    );
                    selectedFromCriteria4 = [...selectedFromCriteria4, ...randomFromLowFreq];
                }

                // Giới hạn theo số lượng cần thiết
                selectedFromCriteria4 = selectedFromCriteria4.slice(0, remainingCount);
                finalNumbers = [...finalNumbers, ...selectedFromCriteria4];
            }

            // Bước 3: Bù số ngẫu nhiên nếu vẫn thiếu (tiêu chí 5)
            const stillRemaining = count - finalNumbers.length;
            if (stillRemaining > 0) {
                const otherNumbers = currentPool.filter(num => !finalNumbers.includes(num));
                const selectedOthers = generateRandomNumbers(stillRemaining, otherNumbers);
                finalNumbers = [...finalNumbers, ...selectedOthers];
            }

            // Sắp xếp và lưu kết quả
            numbers = finalNumbers.sort((a, b) => parseInt(a) - parseInt(b));
            levels[count] = numbers;
            currentDanTotal += numbers.length;

            // Cập nhật pool cho bậc tiếp theo (quan trọng: mỗi bậc sử dụng kết quả của bậc trước)
            // Nhưng cần mở rộng pool để có đủ số cho bậc tiếp theo
            if (count < levelCounts[levelCounts.length - 1]) {
                const nextLevelCount = levelCounts[levelCounts.indexOf(count) + 1];
                const additionalNeeded = nextLevelCount - numbers.length;

                if (additionalNeeded > 0) {
                    const allNumbers = Array.from({ length: 100 }, (_, index) =>
                        index.toString().padStart(2, '0')
                    );
                    const availableNumbers = allNumbers.filter(num =>
                        !numbers.includes(num) &&
                        (!excludeDoubles || !['00', '11', '22', '33', '44', '55', '66', '77', '88', '99'].includes(num)) &&
                        (!excludeNumbers || !excludeNumbers.includes(num))
                    );

                    // QUAN TRỌNG: Ưu tiên thêm số từ tiêu chí 4 trước khi thêm số ngẫu nhiên
                    let additionalNumbers = [];

                    // Bước 1: Thêm số từ tiêu chí 4 chưa được sử dụng (theo thứ tự ưu tiên)
                    const unusedCriteria4 = uniqueCriteria4Numbers.filter(num =>
                        availableNumbers.includes(num) && !numbers.includes(num)
                    );

                    // Phân loại theo tần suất
                    const unusedHighFreq = unusedCriteria4.filter(num => (numberFrequency[num] || 0) > 1);
                    const unusedLowFreq = unusedCriteria4.filter(num => (numberFrequency[num] || 0) === 1);

                    // Lấy tất cả số có tần suất cao trước
                    additionalNumbers = [...unusedHighFreq];

                    // Nếu còn thiếu, lấy từ số có tần suất thấp
                    if (additionalNumbers.length < additionalNeeded && unusedLowFreq.length > 0) {
                        const stillNeeded = additionalNeeded - additionalNumbers.length;
                        const selectedLowFreq = generateRandomNumbers(
                            Math.min(stillNeeded, unusedLowFreq.length),
                            unusedLowFreq
                        );
                        additionalNumbers = [...additionalNumbers, ...selectedLowFreq];
                    }

                    // Bước 2: Nếu vẫn còn thiếu, mới thêm số ngẫu nhiên (tiêu chí 5)
                    if (additionalNumbers.length < additionalNeeded) {
                        const stillNeeded = additionalNeeded - additionalNumbers.length;
                        const otherAvailableNumbers = availableNumbers.filter(num =>
                            !additionalNumbers.includes(num) && !uniqueCriteria4Numbers.includes(num)
                        );
                        const randomNumbers = generateRandomNumbers(stillNeeded, otherAvailableNumbers);
                        additionalNumbers = [...additionalNumbers, ...randomNumbers];
                    }

                    currentPool = [...numbers, ...additionalNumbers];
                } else {
                    currentPool = numbers;
                }
            } else {
                currentPool = numbers;
            }
        });

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
        specialSets: specialSets || [],
        touches: touches || [],
        sums: sums || [],
        timestamp: new Date().toISOString(),
        metadata: {
            levelCounts,
            algorithm: 'New Priority Logic with Low-to-High Processing',
            version: '5.0.0'
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

