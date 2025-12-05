/**
 * Thống Kê Dàn Controller
 */

const ThongKeDan = require('../models/thongKeDan.model');
const XSMB = require('../models/xsmb.model');
const { 
    normalizeTwoDigit, 
    uniqueNumbers,
    getPointsByLabelOrCount,
    getLabelPriority,
    formatDateKey,
    getChamPointsByDigitCount
} = require('../services/prediction.service');

// Helper function để lấy 2 số cuối giải đặc biệt
function getSpecialLastTwo(doc) {
    if (!doc) return null;
    const candidate = Array.isArray(doc.specialPrize)
        ? doc.specialPrize[0]
        : doc.specialPrize;
    return normalizeTwoDigit(candidate);
}

// Copy logic từ telegram để parse input theo tiêu đề
const LETTER_REGEX = /[a-zA-ZÀ-ỹĐđ]/u;
const ALL_TWO_DIGIT_NUMBERS = Array.from({ length: 100 }, (_, index) =>
    index.toString().padStart(2, '0')
);
const CHAM_NUMBER_CACHE = new Map();

const BUCKET_CONFIG = [
    { base: '0X', synonyms: ['0x', '0X', '8s', '8S', '8 s', '8 S', '9s', '9S', '9 s', '9 S'] },
    { base: '1X', synonyms: ['1x', '1X', '18s', '18S', '1 8s', '1 8S', '18 s', '18 S', '17s', '17S', '17 s', '17 S'] },
    { base: '2X', synonyms: ['2x', '2X', '28s', '28S', '2 8s', '2 8S', '28 s', '28 S', '24s', '24S', '24 s', '24 S'] },
    { base: '3X', synonyms: ['3x', '3X', '38s', '38S', '3 8s', '3 8S', '38 s', '38 S', '33s', '33S', '33 s', '33 S'] },
    { base: '4X', synonyms: ['4x', '4X', '48s', '48S', '4 8s', '4 8S', '48 s', '48 S', '45s', '45S', '45 s', '45 S'] },
    { base: '5X', synonyms: ['5x', '5X', '58s', '58S', '5 8s', '5 8S', '58 s', '58 S', '54s', '54S', '54 s', '54 S'] },
    { base: '6X', synonyms: ['6x', '6X', '68s', '68S', '6 8s', '6 8S', '68 s', '68 S', '66s', '66S', '66 s', '66 S'] },
    { base: '7X', synonyms: ['7x', '7X', '78s', '78S', '7 8s', '7 8S', '78 s', '78 S'] },
    { base: '8X', synonyms: ['8x', '8X', '85s', '85S', '88s', '88S', '8 5s', '8 5S', '8 8s', '8 8S', '85 s', '85 S', '88 s', '88 S'] },
    { base: '9X', synonyms: ['9x', '9X', '95s', '95S', '9 5s', '9 5S', '95 s', '95 S'] },
    {
        base: 'TTĐ', synonyms: [
            'ttđ', 'TTĐ', 'ttd', 'TTD',
            'TtĐ', 'TTđ', 'Ttđ', 'tTĐ', 'tTđ', 'Ttd', 'tTD',
            'ttĐ', 'TTd', 'Ttd', 'tTd', 'TtD', 'tTD',
            '4s', '4S', '4 s', '4 S'
        ]
    },
    {
        base: 'STĐ', synonyms: [
            'stđ', 'STĐ', 'std', 'STD',
            'StĐ', 'STđ', 'Stđ', 'sTĐ', 'sTđ', 'Std', 'sTD',
            'stĐ', 'STd', 'Std', 'sTd', 'StD', 'sTD'
        ]
    },
    {
        base: 'BTĐ', synonyms: [
            'btđ', 'BTĐ', 'btd', 'BTD',
            'BtĐ', 'BTđ', 'Btđ', 'bTĐ', 'bTđ', 'Btd', 'bTD',
            'btĐ', 'BTd', 'Btd', 'bTd', 'BtD', 'bTD'
        ]
    },
    {
        base: 'CHẠM', type: 'cham', synonyms: [
            'chạm', 'Chạm', 'CHẠM', 'cham', 'Cham', 'CHAM'
        ]
    }
];

const LABEL_TOKEN_MAP = new Map();
BUCKET_CONFIG.forEach(config => {
    config.synonyms.forEach((syn) => {
        const key = sanitizeLabelToken(syn);
        if (key) LABEL_TOKEN_MAP.set(key, config);
    });
});

function normalizeVietnameseText(input = '') {
    return input
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/g, 'd')
        .replace(/Đ/g, 'D');
}

function sanitizeLabelToken(token = '') {
    if (!token) return '';
    return normalizeVietnameseText(token)
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');
}

function matchLabelFromTokens(tokens, index) {
    const maxLen = Math.min(3, tokens.length - index);

    // Thử match với BUCKET_CONFIG trước (ưu tiên)
    for (let len = maxLen; len > 0; len -= 1) {
        const rawSlice = tokens.slice(index, index + len);
        const candidate = sanitizeLabelToken(rawSlice.join(''));
        if (candidate && LABEL_TOKEN_MAP.has(candidate)) {
            const config = LABEL_TOKEN_MAP.get(candidate);
            return {
                config,
                isCham: config?.type === 'cham',
                length: len,
                rawLabel: rawSlice.join(' ')
            };
        }
    }

    // Nếu không match với BUCKET_CONFIG, thử match với pattern động
    for (let len = 1; len <= maxLen; len += 1) {
        const rawSlice = tokens.slice(index, index + len);
        const rawLabel = rawSlice.join(' ');
        const candidate = sanitizeLabelToken(rawLabel);

        if (candidate && /[a-z]/.test(candidate) && candidate.length >= 1 && !/^\d+$/.test(candidate)) {
            const firstToken = rawSlice[0];
            const lastChar = firstToken.trim().slice(-1);
            const endsWithLetter = LETTER_REGEX.test(lastChar);

            if (endsWithLetter) {
                const nextIndex = index + len;
                if (nextIndex >= tokens.length || /^\d+/.test(tokens[nextIndex])) {
                    const config = LABEL_TOKEN_MAP.get(candidate) || null;
                    return {
                        config,
                        isCham: config?.type === 'cham' || candidate === 'cham',
                        length: len,
                        rawLabel: rawLabel
                    };
                }
            }
        }
    }

    return null;
}

function extractNumbersFromToken(token = '') {
    const trimmed = token.trim();
    if (LETTER_REGEX.test(trimmed)) {
        return [];
    }

    const normalized = token
        .replace(/[^\d,]/g, ' ')
        .split(/[\s,]+/)
        .map(normalizeTwoDigit)
        .filter(Boolean)
        .filter(num => /^\d{2}$/.test(num));
    return normalized;
}

function extractChamDigits(token = '') {
    if (!token) return [];
    return token
        .replace(/[^0-9]/g, '')
        .split('')
        .filter(Boolean);
}

function normalizeChamDigits(digits = []) {
    const unique = new Set();
    digits.forEach(digit => {
        const trimmed = String(digit).trim();
        if (/^\d$/.test(trimmed)) {
            unique.add(trimmed);
        }
    });
    return Array.from(unique);
}

function getChamNumbersForDigit(digit) {
    if (!CHAM_NUMBER_CACHE.has(digit)) {
        const numbers = ALL_TWO_DIGIT_NUMBERS.filter(num => num.includes(digit));
        CHAM_NUMBER_CACHE.set(digit, numbers);
    }
    return CHAM_NUMBER_CACHE.get(digit);
}

function buildChamNumbersFromDigits(digits = []) {
    const resultSet = new Set();
    digits.forEach(digit => {
        const list = getChamNumbersForDigit(digit);
        list.forEach(num => resultSet.add(num));
    });
    return Array.from(resultSet).sort((a, b) => parseInt(a, 10) - parseInt(b, 10));
}

function determineLabelByCount(count) {
    if (!count || count < 1) {
        return '0X';
    }

    if (count === 1) return 'BTĐ';
    if (count === 2) return 'STĐ';
    if (count === 4) return 'TTĐ';

    if (count <= 9) return '0X';
    if (count <= 19) return '1X';
    if (count <= 29) return '2X';
    if (count <= 39) return '3X';
    if (count <= 49) return '4X';
    if (count <= 59) return '5X';
    if (count <= 69) return '6X';
    if (count <= 79) return '7X';
    if (count <= 89) return '8X';
    return '9X';
}

function sectionHasData(section) {
    if (!section) return false;
    if (section.isCham) {
        return Array.isArray(section.chamDigits) && section.chamDigits.length > 0;
    }
    return Array.isArray(section.numbers) && section.numbers.length > 0;
}

function buildSectionsFromTokens(tokens) {
    const sections = [];
    let current = null;
    let index = 0;

    while (index < tokens.length) {
        const labelMatch = matchLabelFromTokens(tokens, index);
        if (labelMatch) {
            if (sectionHasData(current)) {
                sections.push(current);
            }
            let cleanLabel = labelMatch.rawLabel.trim();
            cleanLabel = cleanLabel.replace(/\s*\d+\s*$/, '').trim();
            const isChamSection = Boolean(labelMatch.isCham || labelMatch.config?.type === 'cham');

            current = {
                rawLabel: cleanLabel || labelMatch.rawLabel,
                config: labelMatch.config,
                numbers: [],
                chamDigits: isChamSection ? [] : null,
                isCham: isChamSection
            };
            index += labelMatch.length;
            continue;
        }

        const token = tokens[index];
        if (current?.isCham) {
            const digits = extractChamDigits(token);
            if (digits.length) {
                current.chamDigits.push(...digits);
            }
        } else {
            const numbers = extractNumbersFromToken(token);
            if (numbers.length) {
                if (!current) {
                    current = { rawLabel: null, config: null, numbers: [], chamDigits: null, isCham: false };
                }
                current.numbers.push(...numbers);
            }
        }
        index += 1;
    }

    if (sectionHasData(current)) {
        sections.push(current);
    }

    return sections;
}

// Helper function để parse input dàn thành groups (tương tự logic telegram)
function parseDanInput(danInput = '') {
    if (!danInput || typeof danInput !== 'string') {
        return { numbers: [], groups: [] };
    }

    // Tách input thành các token (giống telegram)
    let tokens = danInput
        .trim()
        .split(/[\s,]+/)
        .map(t => t.trim())
        .filter(Boolean)
        .flatMap(token => token.split(':'))
        .map(token => token.trim())
        .filter(Boolean);

    if (!tokens.length) {
        return { numbers: [], groups: [] };
    }

    // Parse thành sections giống telegram
    const sections = buildSectionsFromTokens(tokens);
    if (!sections.length) {
        return { numbers: [], groups: [] };
    }

    // Convert sections thành groups
    const allNumbers = [];
    const groups = sections
        .map((section) => {
            if (section.isCham) {
                const chamDigits = normalizeChamDigits(section.chamDigits || []);
                if (!chamDigits.length) {
                    return null;
                }
                const chamNumbers = buildChamNumbersFromDigits(chamDigits);
                if (!chamNumbers.length) {
                    return null;
                }

                const digitsLabelText = chamDigits.join(',');
                const baseLabel = (section.rawLabel && section.rawLabel.trim()) || 'Chạm';
                const displayLabel = /\d/.test(baseLabel) ? baseLabel : `${baseLabel} ${digitsLabelText}`.trim();

                allNumbers.push(...chamNumbers);

                return {
                    label: displayLabel,
                    rawLabel: displayLabel,
                    count: chamNumbers.length,
                    numbers: chamNumbers,
                    chamDigits,
                    groupType: 'cham'
                };
            }

            const uniqueNums = uniqueNumbers(section.numbers || []);
            if (!uniqueNums.length) {
                return null;
            }

            // Xác định label dựa trên số lượng số
            const label = determineLabelByCount(uniqueNums.length);

            allNumbers.push(...uniqueNums);

            return {
                label,
                rawLabel: section.rawLabel || label,
                count: uniqueNums.length,
                numbers: uniqueNums,
                groupType: 'default',
                chamDigits: []
            };
        })
        .filter(Boolean);

    return {
        numbers: uniqueNumbers(allNumbers),
        groups
    };
}

// Get list of cao thủ (distinct names from database)
exports.getCaoThuList = async (req, res) => {
    try {
        const caoThuList = await ThongKeDan.distinct('tenCaoThu', { tenCaoThu: { $ne: null, $ne: '' } });
        const sortedList = caoThuList
            .filter(name => name && name.trim())
            .sort((a, b) => a.localeCompare(b, 'vi'));
        
        res.json({
            success: true,
            data: { caoThuList: sortedList }
        });
    } catch (error) {
        console.error('Get cao thủ list error:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi server',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Get all thống kê dàn
exports.getThongKeDan = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 50;
        const skip = (page - 1) * limit;
        const { tenCaoThu, ngay } = req.query;

        const query = {};
        if (tenCaoThu) {
            query.tenCaoThu = { $regex: tenCaoThu, $options: 'i' };
        }
        if (ngay) {
            const date = new Date(ngay);
            if (!isNaN(date.getTime())) {
                const startOfDay = new Date(date);
                startOfDay.setHours(0, 0, 0, 0);
                const endOfDay = new Date(date);
                endOfDay.setHours(23, 59, 59, 999);
                query.ngay = { $gte: startOfDay, $lte: endOfDay };
            }
        }

        // Nếu limit = 0 hoặc rất lớn, không giới hạn
        let data;
        let total;
        if (limit === 0 || limit > 10000) {
            data = await ThongKeDan.find(query)
                .sort({ ngay: -1, stt: 1 });
            total = data.length;
        } else {
            data = await ThongKeDan.find(query)
                .sort({ ngay: -1, stt: 1 })
                .skip(skip)
                .limit(limit);
            total = await ThongKeDan.countDocuments(query);
        }

        res.json({
            success: true,
            data: {
                rows: data,
                pagination: {
                    page,
                    limit: limit === 0 || limit > 10000 ? total : limit,
                    total,
                    pages: limit === 0 || limit > 10000 ? 1 : Math.ceil(total / limit)
                }
            }
        });
    } catch (error) {
        console.error('Get thống kê dàn error:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi server',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Create or update thống kê dàn
exports.saveThongKeDan = async (req, res) => {
    try {
        const { id, nhapDan, stt, ngay, tenCaoThu, diemSo, dan, ketQua } = req.body;

        if (!tenCaoThu || !ngay) {
            return res.status(400).json({
                success: false,
                message: 'Vui lòng nhập tên cao thủ và ngày'
            });
        }

        const date = new Date(ngay);
        if (isNaN(date.getTime())) {
            return res.status(400).json({
                success: false,
                message: 'Ngày không hợp lệ'
            });
        }

        // Parse dàn input thành groups
        const parsedDan = parseDanInput(nhapDan || dan);
        const danNumbers = parsedDan.numbers || [];
        const groups = parsedDan.groups || [];

        // Parse kết quả (nếu có)
        const ketQuaNumbers = [];
        if (ketQua && typeof ketQua === 'string') {
            const tokens = ketQua.trim().split(/[\s,]+/);
            tokens.forEach(token => {
                const num = normalizeTwoDigit(token);
                if (num && /^\d{2}$/.test(num)) {
                    ketQuaNumbers.push(num);
                }
            });
        }

        const data = {
            tenCaoThu: tenCaoThu.trim(),
            ngay: date,
            stt: 0, // Tự động tính khi lưu
            diemSo: 0, // Tự động tính khi chạy kết quả
            dan: uniqueNumbers(danNumbers),
            ketQua: [], // Tự động tính khi chạy kết quả
            groups,
            status: 'pending'
        };

        let result;
        if (id) {
            // Update existing
            result = await ThongKeDan.findByIdAndUpdate(
                id,
                data,
                { new: true, runValidators: true }
            );
            if (!result) {
                return res.status(404).json({
                    success: false,
                    message: 'Không tìm thấy bản ghi'
                });
            }
        } else {
            // Create new
            result = await ThongKeDan.create(data);
        }

        res.json({
            success: true,
            message: id ? 'Cập nhật thành công' : 'Tạo mới thành công',
            data: { row: result }
        });
    } catch (error) {
        console.error('Save thống kê dàn error:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi server',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Save multiple rows
exports.saveMultipleThongKeDan = async (req, res) => {
    try {
        const { rows } = req.body;

        if (!Array.isArray(rows) || rows.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Vui lòng cung cấp dữ liệu hợp lệ'
            });
        }

        const results = [];
        const errors = [];

        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            try {
                const { id, nhapDan, ngay, tenCaoThu } = row;

                if (!tenCaoThu || !ngay) {
                    errors.push({ index: i, message: 'Thiếu tên cao thủ hoặc ngày' });
                    continue;
                }

                const date = new Date(ngay);
                if (isNaN(date.getTime())) {
                    errors.push({ index: i, message: 'Ngày không hợp lệ' });
                    continue;
                }

                const parsedDan = parseDanInput(nhapDan || '');
                const danNumbers = parsedDan.numbers || [];
                const groups = parsedDan.groups || [];

                const data = {
                    tenCaoThu: tenCaoThu.trim(),
                    ngay: date,
                    stt: i + 1, // Tự động tính STT theo thứ tự
                    diemSo: 0, // Tự động tính khi chạy kết quả
                    dan: uniqueNumbers(danNumbers),
                    ketQua: [], // Tự động tính khi chạy kết quả
                    groups,
                    status: 'pending',
                    nhapDan: nhapDan || '' // Lưu raw input để phân biệt các dàn khác nhau
                };

                let result;
                
                // Nếu có dàn nhập vào (nhapDan không rỗng)
                if (nhapDan && nhapDan.trim() !== '') {
                    // Tìm record đã có của cùng cao thủ và cùng ngày để update
                    const existingRecord = await ThongKeDan.findOne({
                        tenCaoThu: tenCaoThu.trim(),
                        ngay: date
                    });
                    
                    if (existingRecord) {
                        // Update record hiện có
                        result = await ThongKeDan.findByIdAndUpdate(
                            existingRecord._id,
                            data,
                            { new: true, runValidators: true }
                        );
                    } else {
                        // Chưa có record, tạo mới
                        result = await ThongKeDan.create(data);
                    }
                } else if (id) {
                    // Không có dàn nhưng có id, update record hiện có
                    result = await ThongKeDan.findByIdAndUpdate(
                        id,
                        data,
                        { new: true, runValidators: true }
                    );
                    if (!result) {
                        // Nếu không tìm thấy với id này, tạo mới
                        result = await ThongKeDan.create(data);
                    }
                } else {
                    // Không có dàn và không có id, kiểm tra xem đã có record trống chưa
                    const existingEmpty = await ThongKeDan.findOne({
                        tenCaoThu: tenCaoThu.trim(),
                        ngay: date,
                        $or: [
                            { dan: { $size: 0 } },
                            { nhapDan: '' },
                            { nhapDan: { $exists: false } }
                        ]
                    });
                    
                    if (existingEmpty) {
                        // Update record trống hiện có
                        result = await ThongKeDan.findByIdAndUpdate(
                            existingEmpty._id,
                            data,
                            { new: true, runValidators: true }
                        );
                    } else {
                        // Tạo mới
                        result = await ThongKeDan.create(data);
                    }
                }

                results.push(result);
            } catch (error) {
                errors.push({ index: i, message: error.message });
            }
        }

        res.json({
            success: true,
            message: `Đã lưu ${results.length} bản ghi`,
            data: {
                saved: results.length,
                errors: errors.length,
                results,
                errors
            }
        });
    } catch (error) {
        console.error('Save multiple thống kê dàn error:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi server',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Delete thống kê dàn
exports.deleteThongKeDan = async (req, res) => {
    try {
        const { id } = req.params;

        const result = await ThongKeDan.findByIdAndDelete(id);

        if (!result) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy bản ghi'
            });
        }

        res.json({
            success: true,
            message: 'Xóa thành công'
        });
    } catch (error) {
        console.error('Delete thống kê dàn error:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi server',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

// Run result (tính toán kết quả) - Logic tương tự soicau ketqua
exports.runResult = async (req, res) => {
    try {
        const { ngay } = req.body; // Ngày được chọn từ frontend (optional)
        
        // Xây dựng query để lấy records
        let query = {};
        
        // Nếu có chọn ngày, chỉ lấy records của ngày đó
        if (ngay) {
            const selectedDate = new Date(ngay);
            selectedDate.setHours(0, 0, 0, 0);
            const endOfDay = new Date(selectedDate);
            endOfDay.setHours(23, 59, 59, 999);
            query.ngay = { $gte: selectedDate, $lte: endOfDay };
            console.log(`[runResult] Chỉ xử lý records của ngày: ${ngay}`);
        }
        
        // Lấy tất cả các bản ghi từ database có dàn nhập vào (có dữ liệu dàn)
        // Lấy tất cả records rồi filter trong code để đảm bảo chính xác
        const allRecords = await ThongKeDan.find(query).sort({ ngay: -1, stt: 1 });
        console.log(`[runResult] Tổng số records trong DB${ngay ? ` (ngày ${ngay})` : ''}: ${allRecords.length}`);
        
        // Lọc các records có dàn (dan không rỗng - array có ít nhất 1 phần tử)
        const records = allRecords.filter(record => {
            const dan = Array.isArray(record.dan) ? record.dan : [];
            const hasDan = dan.length > 0;
            if (!hasDan) {
                console.log(`[runResult] Bỏ qua record ${record._id} - cao thủ: ${record.tenCaoThu}, ngày: ${record.ngay}, dan length: ${dan.length}`);
            }
            return hasDan;
        });
        
        console.log(`[runResult] Số records có dàn${ngay ? ` (ngày ${ngay})` : ''}: ${records.length}`);

        if (!records.length) {
            return res.json({
                success: true,
                message: 'Không có dữ liệu để xử lý',
                data: { results: [], processed: 0 }
            });
        }

        const results = [];
        const errors = [];
        const processedDates = new Set();

        for (const record of records) {
            try {
                const normalizedDate = formatDateKey(record.ngay);
                if (!normalizedDate) {
                    errors.push({ id: record._id, message: 'Ngày không hợp lệ' });
                    continue;
                }

                // Lấy kết quả xổ số từ database (chỉ lấy 1 lần cho mỗi ngày)
                let doc = null;
                const dateObj = new Date(record.ngay);
                dateObj.setHours(0, 0, 0, 0);
                
                if (!processedDates.has(normalizedDate)) {
                    // Thử nhiều cách query để tìm kết quả
                    if (typeof XSMB.findByDate === 'function') {
                        doc = await XSMB.findByDate(dateObj);
                    }
                    
                    // Nếu không tìm thấy, thử query bằng drawDate
                    if (!doc) {
                        doc = await XSMB.findOne({ drawDate: dateObj });
                    }
                    
                    // Nếu vẫn không tìm thấy, thử query với date range (trong cùng ngày)
                    if (!doc) {
                        const startOfDay = new Date(dateObj);
                        startOfDay.setHours(0, 0, 0, 0);
                        const endOfDay = new Date(dateObj);
                        endOfDay.setHours(23, 59, 59, 999);
                        doc = await XSMB.findOne({ 
                            drawDate: { $gte: startOfDay, $lte: endOfDay } 
                        });
                    }
                    
                    processedDates.add(normalizedDate);
                } else {
                    // Nếu đã xử lý ngày này rồi, lấy lại doc từ cache
                    // (doc đã được lưu trong processedDates, nhưng chúng ta cần query lại)
                    if (typeof XSMB.findByDate === 'function') {
                        doc = await XSMB.findByDate(dateObj);
                    }
                    if (!doc) {
                        doc = await XSMB.findOne({ drawDate: dateObj });
                    }
                }

                // Lấy 2 số cuối giải đặc biệt
                const specialTarget = getSpecialLastTwo(doc);
                
                console.log(`[runResult] Ngày ${normalizedDate} (${record.ngay}), doc: ${doc ? 'found' : 'not found'}, specialPrize: ${doc?.specialPrize ? JSON.stringify(doc.specialPrize) : 'null'}, specialTarget: ${specialTarget || 'null'}, cao thủ: ${record.tenCaoThu}`);
                
                // Nếu không có kết quả xổ số cho ngày đó, để trống (không cập nhật)
                if (!specialTarget) {
                    // Không có kết quả xổ số, không cập nhật record này
                    // Giữ nguyên trạng thái hiện tại (pending hoặc completed)
                    // Xóa ghiChu cũ nếu có để không hiển thị "Trượt" nhầm
                    if (record.ghiChu && (record.ghiChu === 'Trượt' || record.ghiChu.startsWith('Trúng:'))) {
                        record.ghiChu = '';
                        await record.save();
                    }
                    console.log(`[runResult] Không có kết quả xổ số cho ngày ${normalizedDate} - record ${record._id}, cao thủ: ${record.tenCaoThu}`);
                    // Vẫn thêm vào results để thống kê
                    results.push(record);
                    continue;
                }

                // So sánh dàn với kết quả - Logic giống hệt telegram
                const danNumbers = Array.isArray(record.dan) ? record.dan : [];
                const groups = Array.isArray(record.groups) ? record.groups : [];
                
                // Sắp xếp groups theo priority (giống telegram)
                const orderedGroups = [...groups].sort((a, b) => {
                    const priorityA = getLabelPriority(a.label);
                    const priorityB = getLabelPriority(b.label);
                    return priorityA - priorityB;
                });

                let matchedNumbers = [];
                let status = 'miss';
                let matchedLabel = null;
                let totalScoreDelta = 0;
                let baseHitAwarded = false;
                const specialDigits = specialTarget ? specialTarget.split('') : [];
                const matchedChamLabels = [];

                // Kiểm tra từng group theo thứ tự ưu tiên (giống telegram)
                for (const group of orderedGroups) {
                    const numbers = Array.isArray(group.numbers) ? group.numbers : [];
                    const isChamGroup = group.groupType === 'cham';
                    
                    // Kiểm tra xem có số trùng với specialTarget không
                    if (numbers.includes(specialTarget)) {
                        matchedNumbers = [specialTarget];
                        if (!matchedLabel) {
                            status = 'hit';
                            matchedLabel = group.label || group.rawLabel || null;
                        }

                        if (isChamGroup) {
                            // Xử lý chạm - Logic giống telegram
                            const chamDigits = Array.isArray(group.chamDigits) && group.chamDigits.length
                                ? group.chamDigits
                                : [];
                            const matchedDigits = chamDigits.filter(digit => specialDigits.includes(digit));
                            if (matchedDigits.length) {
                                matchedDigits.forEach(digit => matchedChamLabels.push(`chạm ${digit}`));
                                const chamPoints = getChamPointsByDigitCount(matchedDigits.length);
                                if (chamPoints > 0) {
                                    totalScoreDelta += chamPoints;
                                }
                            }
                        } else if (!baseHitAwarded) {
                            // Tính điểm dựa trên label và count - Logic giống telegram
                            const count = group.count || numbers.length;
                            const basePoints = getPointsByLabelOrCount(group.label, count);
                            const baseLabel = group.label || group.rawLabel || null;
                            if (basePoints > 0) {
                                totalScoreDelta += basePoints;
                            }
                            baseHitAwarded = true;
                        }
                    }
                }

                // Nếu không trúng, tính điểm phạt - Logic giống telegram
                if (status === 'miss') {
                    const fallbackGroup = orderedGroups.length ? orderedGroups[orderedGroups.length - 1] : null;
                    const fallbackLabel = fallbackGroup?.label || null;
                    if (fallbackLabel) {
                        const fallbackCount = fallbackGroup?.count || (Array.isArray(fallbackGroup?.numbers) ? fallbackGroup.numbers.length : 0);
                        const penalty = getPointsByLabelOrCount(fallbackLabel, fallbackCount);
                        if (penalty > 0) {
                            const penaltyDelta = -penalty; // Trừ điểm
                            totalScoreDelta += penaltyDelta;
                        }
                    }
                }

                // Cập nhật kết quả
                record.ketQua = matchedNumbers.length > 0 ? matchedNumbers : [];
                record.status = matchedNumbers.length > 0 ? 'completed' : 'completed'; // Đánh dấu đã xử lý
                record.diemSo = totalScoreDelta;
                
                // Lưu matchedLabel vào ghiChu nếu cần
                if (matchedLabel) {
                    record.ghiChu = `Trúng: ${matchedLabel}`;
                } else if (status === 'miss') {
                    record.ghiChu = 'Trượt';
                }

                await record.save();
                results.push(record);
            } catch (error) {
                console.error(`Error processing record ${record._id}:`, error);
                errors.push({ id: record._id, message: error.message });
            }
        }

        console.log(`[runResult] Tổng kết: processed=${results.length}, errors=${errors.length}, totalRecords=${records.length}`);
        
        res.json({
            success: true,
            message: `Đã xử lý ${results.length} bản ghi`,
            data: {
                processed: results.length,
                errors: errors.length,
                totalRecords: records.length,
                results: results.map(r => ({
                    _id: r._id,
                    tenCaoThu: r.tenCaoThu,
                    ngay: r.ngay,
                    diemSo: r.diemSo,
                    dan: r.dan,
                    ketQua: r.ketQua,
                    status: r.status,
                    ghiChu: r.ghiChu
                })),
                errors
            }
        });
    } catch (error) {
        console.error('Run result error:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi server',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
};

