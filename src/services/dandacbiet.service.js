/**
 * Dàn Đặc Biệt Service
 * Logic nghiệp vụ cho việc tạo dàn đề đặc biệt với các bộ lọc
 */

// Danh sách đầy đủ từ 00-99
const allNumbers = Array.from({ length: 100 }, (_, i) =>
    i.toString().padStart(2, '0')
);

// Các danh sách phân loại số
const dauChanList = allNumbers.filter(num => parseInt(num[0]) % 2 === 0);
const dauLeList = allNumbers.filter(num => parseInt(num[0]) % 2 === 1);
const dauBeList = allNumbers.filter(num => parseInt(num[0]) < 5);
const dauLonList = allNumbers.filter(num => parseInt(num[0]) >= 5);

const duoiChanList = allNumbers.filter(num => parseInt(num[1]) % 2 === 0);
const duoiLeList = allNumbers.filter(num => parseInt(num[1]) % 2 === 1);
const duoiBeList = allNumbers.filter(num => parseInt(num[1]) < 5);
const duoiLonList = allNumbers.filter(num => parseInt(num[1]) >= 5);

const tongChanList = allNumbers.filter(num =>
    (parseInt(num[0]) + parseInt(num[1])) % 2 === 0
);
const tongLeList = allNumbers.filter(num =>
    (parseInt(num[0]) + parseInt(num[1])) % 2 === 1
);
const tongBeList = allNumbers.filter(num =>
    (parseInt(num[0]) + parseInt(num[1])) < 9
);
const tongLonList = allNumbers.filter(num =>
    (parseInt(num[0]) + parseInt(num[1])) >= 9
);

const chanChanList = allNumbers.filter(num =>
    parseInt(num[0]) % 2 === 0 && parseInt(num[1]) % 2 === 0
);
const chanLeList = allNumbers.filter(num =>
    parseInt(num[0]) % 2 === 0 && parseInt(num[1]) % 2 === 1
);
const leChanList = allNumbers.filter(num =>
    parseInt(num[0]) % 2 === 1 && parseInt(num[1]) % 2 === 0
);
const leLeList = allNumbers.filter(num =>
    parseInt(num[0]) % 2 === 1 && parseInt(num[1]) % 2 === 1
);

const beBeList = allNumbers.filter(num =>
    parseInt(num[0]) < 5 && parseInt(num[1]) < 5
);
const beLonList = allNumbers.filter(num =>
    parseInt(num[0]) < 5 && parseInt(num[1]) >= 5
);
const lonBeList = allNumbers.filter(num =>
    parseInt(num[0]) >= 5 && parseInt(num[1]) < 5
);
const lonLonList = allNumbers.filter(num =>
    parseInt(num[0]) >= 5 && parseInt(num[1]) >= 5
);

const kepBangList = ['00', '11', '22', '33', '44', '55', '66', '77', '88', '99'];
const kepLechList = ['01', '10', '12', '21', '23', '32', '34', '43', '45', '54', '56', '65', '67', '76', '78', '87', '89', '98'];
const kepAmList = ['19', '28', '37', '46', '55', '64', '73', '82', '91'];
const satKepList = ['01', '10', '12', '21', '23', '32', '34', '43', '45', '54', '56', '65', '67', '76', '78', '87', '89', '98'];

// Map categories to lists
const categoryMap = {
    // Đầu
    'Đầu chẵn': dauChanList,
    'Đầu lẻ': dauLeList,
    'Đầu bé': dauBeList,
    'Đầu lớn': dauLonList,
    // Đuôi
    'Đuôi chẵn': duoiChanList,
    'Đuôi lẻ': duoiLeList,
    'Đuôi bé': duoiBeList,
    'Đuôi lớn': duoiLonList,
    // Tổng
    'Tổng chẵn': tongChanList,
    'Tổng lẻ': tongLeList,
    'Tổng bé': tongBeList,
    'Tổng lớn': tongLonList,
    // Đầu-Đuôi
    'Chẵn/Chẵn': chanChanList,
    'Chẵn/Lẻ': chanLeList,
    'Lẻ/Chẵn': leChanList,
    'Lẻ/Lẻ': leLeList,
    // Bé/Lớn
    'Bé/Bé': beBeList,
    'Bé/Lớn': beLonList,
    'Lớn/Bé': lonBeList,
    'Lớn/Lớn': lonLonList,
    // Kép
    'Kép bằng': kepBangList,
    'Kép lệch': kepLechList,
    'Kép âm': kepAmList,
    'Sát kép': satKepList
};

/**
 * Lấy nhanh dàn đặc biệt theo filter
 * @param {string} filter - Tên filter (VD: 'Đầu chẵn')
 * @returns {Array} - Mảng số phù hợp
 */
const getQuickDan = (filter) => {
    if (!filter || !categoryMap[filter]) {
        throw new Error('Filter không hợp lệ');
    }

    return categoryMap[filter];
};

/**
 * Tạo dàn đầu-đuôi
 * @param {Object} params - {dau, duoi, tong, them, bo}
 * @returns {Array} - Mảng số kết quả
 */
const taoDanDauDuoi = (params) => {
    const { dau, duoi, tong, them, bo } = params;

    let result = [];

    // Parse đầu và đuôi
    const dauArr = parseNumbers(dau);
    const duoiArr = parseNumbers(duoi);

    if (dauArr.length > 0 && duoiArr.length > 0) {
        // Tạo tổ hợp đầu-đuôi
        dauArr.forEach(d => {
            duoiArr.forEach(u => {
                result.push(`${d}${u}`);
            });
        });
    }

    // Lọc theo tổng nếu có
    if (tong) {
        const tongArr = parseNumbers(tong);
        if (tongArr.length > 0) {
            result = result.filter(num => {
                const sum = parseInt(num[0]) + parseInt(num[1]);
                return tongArr.includes(sum.toString());
            });
        }
    }

    // Thêm số nếu có
    if (them) {
        const themArr = parseNumbers(them);
        themArr.forEach(num => {
            if (num.length === 2 && !result.includes(num)) {
                result.push(num);
            }
        });
    }

    // Bỏ số nếu có
    if (bo) {
        const boArr = parseNumbers(bo);
        result = result.filter(num => {
            // Bỏ số chứa chữ số trong danh sách bỏ
            return !boArr.some(b => num.includes(b));
        });
    }

    return result.sort((a, b) => parseInt(a) - parseInt(b));
};

/**
 * Tạo dàn chạm
 * @param {Object} params - {cham, tong, them, bo}
 * @returns {Array} - Mảng số kết quả
 */
const taoDanCham = (params) => {
    const { cham, tong, them, bo } = params;

    let result = [];

    // Lấy tất cả số chạm số chỉ định
    if (cham) {
        const chamArr = parseNumbers(cham);
        result = allNumbers.filter(num => {
            return chamArr.some(c => num.includes(c));
        });
    }

    // Lọc theo tổng
    if (tong) {
        const tongArr = parseNumbers(tong);
        result = result.filter(num => {
            const sum = (parseInt(num[0]) + parseInt(num[1])).toString();
            return tongArr.includes(sum) || tongArr.includes(sum[sum.length - 1]);
        });
    }

    // Thêm số
    if (them) {
        const themArr = parseNumbers(them);
        themArr.forEach(num => {
            if (num.length === 2 && !result.includes(num)) {
                result.push(num);
            }
        });
    }

    // Bỏ số
    if (bo) {
        const boArr = parseNumbers(bo);
        result = result.filter(num => !boArr.includes(num));
    }

    return result.sort((a, b) => parseInt(a) - parseInt(b));
};

/**
 * Tạo dàn bộ
 * @param {Object} params - {bo, tong, them, boNums}
 * @returns {Array} - Mảng số kết quả
 */
const taoDanBo = (params) => {
    const { bo, tong, them, boNums } = params;

    let result = [];

    // Lấy từ bộ
    if (bo) {
        result = categoryMap[bo] || [];
    }

    // Lọc theo tổng
    if (tong) {
        const tongArr = parseNumbers(tong);
        result = result.filter(num => {
            const sum = parseInt(num[0]) + parseInt(num[1]);
            return tongArr.includes(sum.toString());
        });
    }

    // Thêm số
    if (them) {
        const themArr = parseNumbers(them);
        themArr.forEach(num => {
            if (num.length === 2 && !result.includes(num)) {
                result.push(num);
            }
        });
    }

    // Bỏ số (boNums để tránh conflict với tên tham số 'bo')
    if (boNums) {
        const boArr = parseNumbers(boNums);
        result = result.filter(num => {
            return !boArr.some(b => num.includes(b));
        });
    }

    return result.sort((a, b) => parseInt(a) - parseInt(b));
};

/**
 * Parse numbers từ string input
 * @param {string} input - Input string
 * @returns {Array} - Mảng các số/chữ số
 */
const parseNumbers = (input) => {
    if (!input) return [];

    // Xử lý cả dạng "1,2,3" và "123"
    if (input.includes(',')) {
        return input.split(',').map(n => n.trim()).filter(n => n);
    } else {
        // Nếu không có dấu phẩy, tách từng ký tự
        return input.split('').filter(n => n.trim());
    }
};

module.exports = {
    getQuickDan,
    taoDanDauDuoi,
    taoDanCham,
    taoDanBo,
    categoryMap,
    allNumbers
};

