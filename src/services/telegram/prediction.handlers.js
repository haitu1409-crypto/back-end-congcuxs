const {
    savePrediction,
    listPredictions,
    evaluatePredictions,
    hasNotifiedResults,
    markResultsNotified,
    formatDateKey,
    uniqueNumbers,
    normalizeTwoDigit,
    determinePredictionDate,
    getSpecialLastTwo,
    getLabelPriority,
    getPointsByLabelOrCount
} = require('../prediction.service');
const { normalizeDateInput, formatDateForDisplay, parseDateRange } = require('./date.utils');
const PredictionScore = require('../../models/predictionScore.model');
const UserPrediction = require('../../models/userPrediction.model');
const TelegramCommandMessage = require('../../models/telegramCommandMessage.model');

const LETTER_REGEX = /[a-zA-ZÀ-ỹĐđ]/u;
const ALL_TWO_DIGIT_NUMBERS = Array.from({ length: 100 }, (_, index) =>
    index.toString().padStart(2, '0')
);
const CHAM_NUMBER_CACHE = new Map();
const RESULT_DOC_CACHE = new Map(); // Cache cho fetchResultDoc
const MAX_USER_SUGGESTIONS = 30;
const MAX_RESULT_DOC_CACHE_SIZE = 1000; // Giới hạn cache size để tránh memory leak
const MAX_CHAM_NUMBER_CACHE_SIZE = 100; // Giới hạn cache size (thực tế chỉ có 10 digits 0-9)
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
    // Các tiêu đề đặc biệt - hỗ trợ tất cả biến thể (hoa/thường, có/không dấu)
    // Hàm sanitizeLabelToken sẽ tự động chuẩn hóa tất cả biến thể về dạng không dấu lowercase
    {
        base: 'TTĐ', synonyms: [
            'ttđ', 'TTĐ', 'ttd', 'TTD',
            'TtĐ', 'TTđ', 'Ttđ', 'tTĐ', 'tTđ', 'Ttd', 'tTD',
            'ttĐ', 'TTd', 'Ttd', 'tTd', 'TtD', 'tTD',
            '4s', '4S', '4 s', '4 S'  // TTD === 4S (4 cặp số)
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

function buildHelpText() {
    return `<b>🎯 HƯỚNG DẪN SỬ DỤNG soicau</b>

<b>📝 Ghi nhận dự đoán:</b>
• <code>soicau 01 02 03 04 05 06 07 08 09 10 11 12 13 14 15</code> ➜ Ghi nhận cho <i>hôm nay</i>
• <code>soicau 25-11 01 02 03 04 05 06 07 08 09 10 11 12 13 14 15</code> ➜ Ghi nhận cho <i>ngày 25/11</i>
• <code>soicau 29/11-30/11 01,02,03,04,05,06,07,08,09,10,11,12,13,14,15</code> ➜ Ghi nhận cho <i>2 ngày liên tiếp (29/11 và 30/11)</i>
• <b>⚠️ Yêu cầu:</b> Tối thiểu <b>15 cặp số</b>, tối đa <b>400 cặp số</b>

<b>📋 Xem danh sách:</b>
• <code>soicau danhsachdangky</code> ➜ Xem dự đoán <i>hôm nay</i>
• <code>soicau danhsachdangky 25-11</code> ➜ Xem dự đoán <i>ngày 25/11</i>

<b>🏆 Xem kết quả:</b>
• <code>soicau ketqua</code> ➜ Xem kết quả <i>hôm nay</i>
• <code>soicau ketqua 25-11</code> ➜ Xem kết quả <i>ngày 25/11</i>

<b>👤 Xem chi tiết người dùng:</b>
• <code>soicau @username</code> ➜ Xem chi tiết dự đoán của @username cho <i>ngày hiện tại</i>
• <code>soicau 25-11 @username</code> ➜ Xem chi tiết dự đoán của @username cho ngày 25/11
• <code>soicau 25/11 @username</code> ➜ Xem chi tiết dự đoán của @username cho ngày 25/11

<b>📊 Xem thống kê người trúng:</b>
• <code>soicau thongke</code> ➜ Xem thống kê người trúng gần đây
• <code>soicau thongke @username</code> ➜ Xem thống kê người trúng cho @username

<b>⏰ Thời gian đăng ký:</b>
• <b>Trước 18:00</b> ➜ Đăng ký cho <i>hôm nay</i>
• <b>Sau 18:35</b> ➜ Đăng ký cho <i>ngày mai</i>
• <b>18:00 - 18:35</b> ➜ <u>Không thể đăng ký</u>

<i>💡 Mỗi người chỉ được thay đổi tối đa 2 lần/ngày</i>`;
}

function normalizedToDate(normalizedDate) {
    if (!normalizedDate) return null;
    const date = new Date(`${normalizedDate}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime())) {
        return null;
    }
    return date;
}

function sanitizeDateToken(token = '') {
    return token.replace(/^[\[\(\{]+/, '').replace(/[\]\)\}]+$/, '');
}

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

function normalizeIdentifier(value = '') {
    if (!value) return '';
    return normalizeVietnameseText(String(value))
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '');
}

function resolveNormalizedDate(arg) {
    if (!arg) {
        return formatDateKey(new Date());
    }
    const normalized = normalizeDateInput(sanitizeDateToken(arg));
    if (normalized) {
        return normalized;
    }
    return null;
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
    // Pattern: số + chữ cái (ví dụ: 66S, 54S, 9S) hoặc chỉ chữ cái (TTD, BTD)
    // Chỉ match với token đầu tiên (len = 1) để tránh match nhầm các số
    for (let len = 1; len <= maxLen; len += 1) {
        const rawSlice = tokens.slice(index, index + len);
        const rawLabel = rawSlice.join(' ');
        const candidate = sanitizeLabelToken(rawLabel);

        // Pattern: có chứa ít nhất 1 chữ cái và có thể có số
        // Ví dụ: 66S, 54S, 9S, TTD, BTD, 4S, etc.
        // Không phải là số thuần túy (phải có chữ cái)
        if (candidate && /[a-z]/.test(candidate) && candidate.length >= 1 && !/^\d+$/.test(candidate)) {
            // Kiểm tra: token hiện tại phải kết thúc bằng chữ cái (không phải số)
            // Ví dụ: "66S" ✓, "TTD" ✓, nhưng "66S00" ✗ (sẽ được tách thành "66S" và "00")
            const firstToken = rawSlice[0];
            const lastChar = firstToken.trim().slice(-1);
            const endsWithLetter = LETTER_REGEX.test(lastChar);

            if (endsWithLetter) {
                // Kiểm tra xem token tiếp theo có phải là số không
                // Nếu token tiếp theo là số hoặc không có token tiếp theo, thì đây là tiêu đề
                const nextIndex = index + len;
                if (nextIndex >= tokens.length || /^\d+/.test(tokens[nextIndex])) {
                    // Đây là tiêu đề động, không có trong BUCKET_CONFIG
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
    // Chỉ chấp nhận số 2 chữ số, cách nhau bởi dấu phẩy hoặc khoảng trống
    // normalizeTwoDigit đã đảm bảo trả về số 2 chữ số (pad với 0 nếu cần)
    // Bỏ qua token nếu chứa chữ cái (có thể là label)
    const trimmed = token.trim();
    // Nếu token chứa chữ cái, không extract số từ nó (có thể là label như "66S", "TTD")
    if (LETTER_REGEX.test(trimmed)) {
        return [];
    }

    const normalized = token
        .replace(/[^\d,]/g, ' ')
        .split(/[\s,]+/)
        .map(normalizeTwoDigit)
        .filter(Boolean) // normalizeTwoDigit đã đảm bảo chỉ trả về số 2 chữ số
        .filter(num => /^\d{2}$/.test(num)); // Đảm bảo chính xác 2 chữ số (không có ký tự khác)
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
        // Kiểm tra và xóa cache cũ nếu vượt quá giới hạn (LRU-like)
        if (CHAM_NUMBER_CACHE.size >= MAX_CHAM_NUMBER_CACHE_SIZE) {
            // Xóa entry đầu tiên (FIFO)
            const firstKey = CHAM_NUMBER_CACHE.keys().next().value;
            if (firstKey) {
                CHAM_NUMBER_CACHE.delete(firstKey);
            }
        }
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

function isChamLabel(label = '') {
    if (!label) return false;
    const normalized = normalizeVietnameseText(String(label)).toLowerCase();
    return normalized.startsWith('cham');
}

function formatLabelForDisplay(label = '') {
    if (!label) return 'N/A';
    return String(label);
}

function isChamGroup(group = null) {
    if (!group) return false;
    if (group.groupType === 'cham') return true;
    const raw = group.label || group.rawLabel || '';
    return isChamLabel(raw);
}

function buildChamDisplayLabel(group = null) {
    if (!group) return 'chạm';
    if (Array.isArray(group.chamDigits) && group.chamDigits.length) {
        return `chạm ${group.chamDigits.join(',')}`;
    }
    const label = group.label || group.rawLabel || '';
    const normalized = normalizeVietnameseText(label).toLowerCase();
    if (normalized.startsWith('cham')) {
        const suffix = label.replace(/^[^\d]*\s*/, '');
        if (suffix) {
            return `chạm ${suffix}`;
        }
        return label.toLowerCase().startsWith('chạm') ? label : `chạm ${label}`.trim();
    }
    return `chạm ${label}`.trim();
}

function formatChamRegistrationSummary(groups = []) {
    return (groups || [])
        .filter(isChamGroup)
        .map(group => {
            const label = buildChamDisplayLabel(group);
            return label;
        });
}

function formatChamResultSummary(groups = [], specialTarget = null, matchedChamLabels = []) {
    if (matchedChamLabels && matchedChamLabels.length && specialTarget) {
        const uniqueLabels = Array.from(new Set(matchedChamLabels));
        return uniqueLabels.map(label => `${label}: ${specialTarget}`);
    }
    if (!Array.isArray(groups) || !groups.length) {
        return [];
    }
    return groups
        .filter(isChamGroup)
        .map(group => {
            const label = buildChamDisplayLabel(group);
            const value = specialTarget ? specialTarget : 'đã trúng';
            return `${label}: ${value}`;
        });
}

function extractMatchedChamLabels(entry = {}) {
    const matchedNumbers = Array.isArray(entry.matchedNumbers) ? entry.matchedNumbers : [];
    const digitsInNumbers = new Set(
        matchedNumbers
            .join('')
            .split('')
            .filter(char => /\d/.test(char))
    );
    const rawLabels = Array.isArray(entry.chamLabels) ? entry.chamLabels : [];
    const extracted = [];

    rawLabels.forEach(label => {
        const digits = (label.match(/\d/g) || []).filter(Boolean);
        digits.forEach(digit => {
            if (digitsInNumbers.has(digit)) {
                extracted.push(`chạm ${digit}`);
            }
        });
    });

    if (!extracted.length) {
        return rawLabels;
    }

    return Array.from(new Set(extracted));
}

function getMatchedChamLabelsFromGroups(groups = [], specialTarget = null) {
    if (!specialTarget || !Array.isArray(groups) || !groups.length) {
        return [];
    }
    const digitsInTarget = specialTarget.split('');
    const matches = [];
    groups.forEach(group => {
        if (!isChamGroup(group)) {
            return;
        }
        let chamDigits = [];
        if (Array.isArray(group.chamDigits) && group.chamDigits.length) {
            chamDigits = group.chamDigits;
        } else if (group.label) {
            chamDigits = (group.label.match(/\d/g) || []);
        }
        chamDigits
            .filter(digit => digitsInTarget.includes(digit))
            .forEach(digit => matches.push(`chạm ${digit}`));
    });
    return Array.from(new Set(matches));
}

function removeEmptyLines(text = '') {
    return text
        .split('\n')
        .map(line => line.trimEnd())
        .filter(line => line.trim().length > 0)
        .join('\n');
}

function buildUserCommandIdentifier(record = {}) {
    if (record.username) {
        return String(record.username).replace(/^@/, '');
    }
    const slug = normalizeIdentifier(record.displayName || '');
    if (slug) {
        return slug;
    }
    if (record.userId) {
        return String(record.userId);
    }
    return null;
}

async function findUserPredictionByIdentifier({ chatId, normalizedDate = null, identifier, searchLimit = 500 }) {
    if (!chatId || !identifier) {
        return null;
    }

    const rawIdentifierNoAt = identifier.replace(/^@/, '');
    const normalizedIdentifier = normalizeIdentifier(identifier);

    // Tối ưu: Nếu identifier là số (có thể là userId), query trực tiếp với userId
    const isNumericId = /^\d+$/.test(rawIdentifierNoAt);
    if (isNumericId) {
        const query = {
            chatId: String(chatId),
            userId: String(rawIdentifierNoAt)
        };
        if (normalizedDate) {
            query.normalizedDate = normalizedDate;
        }
        const directMatch = await UserPrediction.findOne(query)
            .sort({ updatedAt: -1 })
            .lean();
        if (directMatch) {
            return directMatch;
        }
    }

    // Fallback: query và filter trong memory (cho username/displayName)
    const query = { chatId: String(chatId) };
    if (normalizedDate) {
        query.normalizedDate = normalizedDate;
    }
    const limit = normalizedDate ? Math.min(searchLimit, 200) : Math.min(searchLimit, 100); // Giảm limit để tối ưu

    const candidates = await UserPrediction.find(query)
        .sort({ updatedAt: -1 })
        .limit(limit)
        .lean();

    return candidates.find(candidate => {
        const normalizedUsername = normalizeIdentifier(candidate.username);
        const normalizedDisplayName = normalizeIdentifier(candidate.displayName);
        const candidateUserId = candidate.userId ? String(candidate.userId) : '';
        return (
            (normalizedUsername && normalizedUsername === normalizedIdentifier) ||
            (normalizedDisplayName && normalizedDisplayName === normalizedIdentifier) ||
            (candidateUserId && candidateUserId === rawIdentifierNoAt) ||
            (candidateUserId && candidateUserId === normalizedIdentifier)
        );
    }) || null;
}

function determineLabelByCount(count) {
    if (!count || count < 1) {
        return '0X';
    }

    // Ưu tiên các tiêu đề đặc biệt
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
            // Đảm bảo rawLabel chỉ chứa label, không chứa số
            // Nếu rawLabel chứa số ở cuối, loại bỏ phần số đó
            let cleanLabel = labelMatch.rawLabel.trim();
            // Loại bỏ các số ở cuối label (ví dụ: "66S00" -> "66S")
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

function parseSubmissionArgs(args, allowManualDate = false) {
    if (!args.length) {
        throw new Error('SAI CÚ PHÁP: Vui lòng nhập ít nhất 1 con số dự đoán.');
    }

    let tokens = args
        .map(token => token.trim())
        .filter(Boolean)
        .flatMap(token => token.split(':'))
        .map(token => token.trim())
        .filter(Boolean);
    if (!tokens.length) {
        throw new Error('SAI CÚ PHÁP: Vui lòng nhập danh sách số (ví dụ: 53 35).');
    }

    let normalizedDates = null; // Mảng các ngày (để hỗ trợ khoảng ngày như 29/11-30/11)
    if (allowManualDate) {
        // Ưu tiên kiểm tra khoảng ngày (29/11-30/11) trước
        for (let i = 0; i < tokens.length; i++) {
            const token = sanitizeDateToken(tokens[i]);
            // Thử parse khoảng ngày trước (29/11-30/11)
            const dateRange = parseDateRange(token);
            if (dateRange && dateRange.length === 2) {
                normalizedDates = dateRange;
                // Xóa token ngày và các token trước nó
                tokens = tokens.slice(i + 1);
                break;
            }
        }

        // Nếu chưa tìm thấy khoảng ngày, thử tìm một ngày đơn lẻ
        if (!normalizedDates) {
            for (let i = 0; i < tokens.length; i++) {
                const token = sanitizeDateToken(tokens[i]);
                const normalizedDate = normalizeDateInput(token);
                if (normalizedDate) {
                    normalizedDates = [normalizedDate];
                    // Xóa token ngày và các token trước nó (có thể là "Bát", "chốt", etc.)
                    tokens = tokens.slice(i + 1);
                    break;
                }
            }
        }

        if (normalizedDates && normalizedDates.length > 0) {
            // Kiểm tra nếu ngày đầu tiên là hôm nay, vẫn phải kiểm tra giờ
            const today = formatDateKey(new Date());
            if (normalizedDates[0] === today) {
                const dateInfo = determinePredictionDate();
                if (!dateInfo) {
                    throw new Error('SAI THỜI GIAN: Hiện tại không thể đăng ký dự đoán cho hôm nay.\nThời gian đăng ký: Trước 18:00 hoặc sau 18:35.');
                }
            }
        }
    }

    if (!normalizedDates || normalizedDates.length === 0) {
        // Nếu không có ngày thủ công, sử dụng logic tự động dựa trên giờ
        const dateInfo = determinePredictionDate();
        if (!dateInfo) {
            throw new Error('SAI THỜI GIAN: Hiện tại không thể đăng ký dự đoán.\nThời gian đăng ký: Trước 18:00 hoặc sau 18:35.');
        }
        normalizedDates = [dateInfo.normalizedDate];
    }

    if (!tokens.length) {
        throw new Error('SAI CÚ PHÁP: Vui lòng nhập danh sách số (ví dụ: 53 35).');
    }

    const sections = buildSectionsFromTokens(tokens);
    if (!sections.length) {
        throw new Error('SAI CÚ PHÁP: Không tìm thấy số hợp lệ. Vui lòng kiểm tra lại định dạng.');
    }

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

            // Luôn xác định label dựa trên số lượng số đã nhập
            const label = determineLabelByCount(uniqueNums.length);

            return {
                label: label,
                rawLabel: section.rawLabel || label,
                count: uniqueNums.length,
                numbers: uniqueNums,
                groupType: 'default'
            };
        })
        .filter(Boolean);

    if (!groups.length) {
        throw new Error('SAI CÚ PHÁP: Không tìm thấy số hợp lệ. Vui lòng kiểm tra lại định dạng.');
    }

    const numbers = uniqueNumbers(
        groups.flatMap(group => group.numbers)
    );

    if (!numbers.length) {
        throw new Error('SAI CÚ PHÁP: Các số không hợp lệ.\nVui lòng nhập dạng 2 chữ số (ví dụ: 53, 35).');
    }

    // Kiểm tra tối thiểu 15 cặp số
    if (numbers.length < 15) {
        throw new Error('CHƯA ĐỦ SỐ: Vui lòng đăng ký tối thiểu 15 cặp số.\nVí dụ: soicau 01 02 03 04 05 06 07 08 09 10 11 12 13 14 15');
    }

    // Kiểm tra tối đa 400 cặp số
    if (numbers.length > 400) {
        throw new Error('VƯỢT QUÁ GIỚI HẠN: Vui lòng không gửi quá 400 số trong một lần.');
    }

    // Convert normalizedDates thành drawDates
    const drawDates = normalizedDates.map(nd => normalizedToDate(nd)).filter(Boolean);
    if (drawDates.length === 0) {
        throw new Error('SAI CÚ PHÁP: Ngày dự đoán không hợp lệ. Vui lòng kiểm tra lại.');
    }

    return { normalizedDates, drawDates, numbers, groups };
}

function getDisplayName(ctx) {
    const user = ctx.from || {};
    return user.username || user.first_name || user.last_name || `user_${user.id}`;
}

function getUserIdentifiers(ctx) {
    const user = ctx.from || {};
    const username = user.username ? user.username.replace(/^@/, '') : null;
    const nameParts = [user.first_name, user.last_name].filter(Boolean).map(part => String(part).trim());
    const displayNameRaw = nameParts.join(' ').trim();
    const displayName = displayNameRaw || username || (user.id ? `user_${user.id}` : 'Ẩn danh');
    return { username, displayName };
}

function getPredictionDisplayName(pred) {
    return pred.displayName || pred.username || pred.userId || 'Ẩn danh';
}

function formatUserMention(record) {
    if (!record) return 'Ẩn danh';
    const rawUsername = record.username || record.userUsername;
    const sanitizedUsername = rawUsername ? String(rawUsername).replace(/^@/, '') : null;
    const displayName = record.displayName || record.fullName || null;
    const fallbackName = displayName || (sanitizedUsername ? `@${sanitizedUsername}` : (record.userId ? `user_${record.userId}` : 'Ẩn danh'));

    if (record.userId) {
        const safeName = fallbackName;
        return `<a href="tg://user?id=${record.userId}">${safeName}</a>`;
    }

    if (sanitizedUsername) {
        return `@${sanitizedUsername}`;
    }

    return fallbackName || 'Ẩn danh';
}

function buildListMessage(predictions, normalizedDate) {
    const displayDate = formatDateForDisplay(normalizedDate);
    const totalPredictions = predictions.length;

    let message = `<b>📋 DANH SÁCH DỰ ĐOÁN</b>\n`;
    message += `<i>📅 Ngày:</i> <b>${displayDate}</b>\n`;
    message += `<i>👥 Tổng số người tham gia:</i> <b>${totalPredictions}</b>\n\n`;

    predictions.forEach((prediction, index) => {
        const userMention = formatUserMention(prediction);

        message += `<b>${index + 1}.</b> ${userMention}\n`;

        // Chỉ hiển thị danh sách các dàn (0X, 1X, 2X, ...)
        if (prediction.groups && prediction.groups.length) {
            const danLabels = prediction.groups
                .map(group => group.label || 'N/A')
                .filter(Boolean)
                .join(', ');
            message += `   <i>Dàn:</i> <b>${danLabels}</b>`;
        }

        // Thêm dòng trống sau mỗi mục (trừ mục cuối cùng)
        if (index < predictions.length - 1) {
            message += `\n`;
        }
    });

    return message.trim();
}

async function buildResultMessage(summary, normalizedDate, chatId, oldScoresMap = null, waitingUserIds = null) {
    const waitingSet = waitingUserIds instanceof Set
        ? waitingUserIds
        : new Set(Array.isArray(waitingUserIds) ? waitingUserIds.map(String) : []);
    const displayDate = formatDateForDisplay(normalizedDate);

    let message = `<b>🏆 KẾT QUẢ DỰ ĐOÁN</b>\n`;
    message += `<i>📅 Ngày:</i> <b>${displayDate}</b>\n`;
    message += `<i>👥 Tổng tham gia:</i> <b>${summary.total}</b> người\n`;

    if (!summary.total) {
        message += `\n<i>ℹ️ Chưa có ai gửi dự đoán cho ngày này.</i>`;
        return message;
    }

    if (summary.specialTarget) {
        message += `\n<b>🎯 2 số cuối giải ĐB:</b> <code>${summary.specialTarget}</code>\n`;
    }

    // Không return sớm nữa, sẽ hiển thị cả danh sách không trúng

    // Tạo Set để kiểm tra nhanh những người trúng
    const hitUserIds = new Set();
    summary.hits.forEach(hit => {
        if (hit.userId) {
            hitUserIds.add(String(hit.userId));
        }
    });

    // Phân loại người trúng, chờ khung 2 ngày, và không trúng
    const hits = summary.hits || [];
    const allMisses = (summary.predictions || []).filter(pred => {
        if (!pred.userId) return false;
        return !hitUserIds.has(String(pred.userId));
    });

    // Tách những người chờ khung 2 ngày
    const waitingForTwoDay = [];
    const misses = [];

    allMisses.forEach(miss => {
        const userIdStr = miss.userId ? String(miss.userId) : null;
        const isWaitingTwoDay = userIdStr && waitingSet.has(userIdStr);
        if (isWaitingTwoDay) {
            waitingForTwoDay.push(miss);
        } else {
            misses.push(miss);
        }
    });

    // Hiển thị danh sách trúng số
    if (hits.length > 0) {
        message += `\n<b>🎉 DANH SÁCH TRÚNG SỐ</b>\n`;
        message += `<i>──────────────</i>\n`;

        hits.forEach((hit, index) => {
            const mention = formatUserMention(hit);
            const label = hit.matchedLabel ? ` <i>(${hit.matchedLabel})</i>` : '';
            message += `<b>${index + 1}. ${mention}</b>${label}`;

            // Format chạm đơn giản: chỉ hiển thị "chạm 3" hoặc "chạm 3, chạm 4" (không có số)
            if (hit.matchedChamLabels && Array.isArray(hit.matchedChamLabels) && hit.matchedChamLabels.length > 0) {
                const chamLabels = Array.from(new Set(hit.matchedChamLabels));
                // matchedChamLabels có format như "chạm 3", "chạm 4" - chỉ cần join lại
                message += `\n   ${chamLabels.join(', ')}`;
            }

            // Thêm dòng trống sau mỗi mục (trừ mục cuối cùng)
            const hasMoreSections = waitingForTwoDay.length > 0 || misses.length > 0;
            if (index < hits.length - 1 || hasMoreSections) {
                message += `\n`;
            }
        });
    } else if (waitingForTwoDay.length === 0 && misses.length === 0) {
        // Nếu không có ai trúng và không có ai không trúng, hiển thị thông báo
        message += `\n<i>😔 Chưa có ai trúng trong kỳ này.</i>\n`;
    }

    // Hiển thị danh sách chờ khung 2 ngày
    if (waitingForTwoDay.length > 0) {
        if (hits.length > 0) {
            message += `\n`;
        }
        message += `<b>⏳ DANH SÁCH CHỜ KHUNG 2 NGÀY</b>\n`;
        message += `<i>──────────────</i>\n`;

        waitingForTwoDay.forEach((waiting, index) => {
            const mention = formatUserMention(waiting);
            const groups = Array.isArray(waiting.groups) ? waiting.groups : [];

            // Lấy tất cả các labels từ groups (tương tự buildListMessage)
            let label = '';
            if (groups.length > 0) {
                const danLabels = groups
                    .filter(group => group.groupType !== 'cham')
                    .map(group => group.label || 'N/A')
                    .filter(Boolean);

                const chamGroups = groups.filter(group => group.groupType === 'cham');
                const chamLabels = [];
                chamGroups.forEach(group => {
                    if (Array.isArray(group.chamDigits) && group.chamDigits.length > 0) {
                        chamLabels.push(`Chạm ${group.chamDigits.join(',')}`);
                    }
                });

                const allLabels = [...danLabels, ...chamLabels];
                if (allLabels.length > 0) {
                    label = ` <i>(${allLabels.join(', ')})</i>`;
                }
            }

            message += `<b>${hits.length + index + 1}. ${mention}</b>${label}`;

            // Thêm dòng trống sau mỗi mục (trừ mục cuối cùng)
            if (index < waitingForTwoDay.length - 1 || misses.length > 0) {
                message += `\n`;
            }
        });
    }

    // Hiển thị danh sách người không trúng
    if (misses.length > 0) {
        if (hits.length > 0 || waitingForTwoDay.length > 0) {
            message += `\n`;
        }
        message += `<b>😔 DANH SÁCH KHÔNG TRÚNG</b>\n`;
        message += `<i>──────────────</i>\n`;

        misses.forEach((miss, index) => {
            const mention = formatUserMention(miss);
            const groups = Array.isArray(miss.groups) ? miss.groups : [];

            // Lấy tất cả các labels từ groups (tương tự buildListMessage)
            let label = '';
            if (groups.length > 0) {
                const danLabels = groups
                    .filter(group => group.groupType !== 'cham')
                    .map(group => group.label || 'N/A')
                    .filter(Boolean);

                const chamGroups = groups.filter(group => group.groupType === 'cham');
                const chamLabels = [];
                chamGroups.forEach(group => {
                    if (Array.isArray(group.chamDigits) && group.chamDigits.length > 0) {
                        chamLabels.push(`Chạm ${group.chamDigits.join(',')}`);
                    }
                });

                const allLabels = [...danLabels, ...chamLabels];
                if (allLabels.length > 0) {
                    label = ` <i>(${allLabels.join(', ')})</i>`;
                }
            }

            message += `<b>${hits.length + waitingForTwoDay.length + index + 1}. ${mention}</b>${label}`;

            // Thêm dòng trống sau mỗi mục (trừ mục cuối cùng)
            if (index < misses.length - 1) {
                message += `\n`;
            }
        });
    }

    if (summary.scoreChanges?.length) {
        message += `\n\n<b>📈 CẬP NHẬT ĐIỂM</b>\n`;
        message += `<i>──────────────</i>\n`;

        for (const change of summary.scoreChanges) {
            const mention = formatUserMention(change);
            const deltaText = change.delta > 0 ? `<b>+${change.delta}</b>` : `<i>${change.delta}</i>`;

            // Tính điểm mới từ điểm cũ + delta (chính xác hơn query lại)
            const oldScore = oldScoresMap ? (oldScoresMap.get(String(change.userId)) || 0) : 0;
            const totalScore = oldScore + change.delta;

            message += `\n<b>${mention}</b>\n`;
            const trượtText = change.delta < 0 ? ' trượt' : '';
            message += `   ${deltaText} điểm <i>(${change.label || 'N/A'})</i>${trượtText} - <b>Tổng: ${totalScore} điểm</b>`;
        }
    }

    return message;
}

const MAX_STATS_USERS = 15;
const MAX_HISTORY_PER_USER = 30;
const HISTORY_WINDOW_DAYS = 30;

/**
 * Helper function để log errors với context đầy đủ
 * @param {string} context - Context của lỗi (ví dụ: 'handleCommand', 'sendStatsMessages')
 * @param {Error} error - Error object
 * @param {object} additionalInfo - Thông tin bổ sung (chatId, userId, normalizedDate, etc.)
 */
function logPredictionError(context, error, additionalInfo = {}) {
    const errorInfo = {
        context,
        message: error?.message || 'Unknown error',
        stack: error?.stack,
        ...additionalInfo,
        timestamp: new Date().toISOString()
    };
    console.error(`[Prediction] ❌ ${context}:`, errorInfo);
    return errorInfo;
}

async function buildScoreMap(chatId, userIds = []) {
    const map = new Map();
    if (!chatId) return map;

    const query = { chatId: String(chatId) };
    if (Array.isArray(userIds) && userIds.length > 0) {
        query.userId = { $in: userIds.map(String) };
    }

    const scores = await PredictionScore.find(query).lean();
    scores.forEach((score) => {
        map.set(String(score.userId), score.points || 0);
    });

    return map;
}

/**
 * Helper function để build oldScoresMap trước khi evaluate predictions
 * Tránh duplicate code ở nhiều nơi
 */
async function buildOldScoresMap(chatId, normalizedDate) {
    const oldScoresMap = new Map();
    if (!chatId || !normalizedDate) {
        return oldScoresMap;
    }

    try {
        // Sử dụng aggregation để lấy distinct userIds hiệu quả hơn
        const userIdsBeforeEval = await UserPrediction.aggregate([
            { $match: { chatId: String(chatId), normalizedDate } },
            { $group: { _id: '$userId' } },
            { $project: { _id: 0, userId: '$_id' } }
        ]).allowDiskUse(true);

        if (userIdsBeforeEval.length > 0) {
            const userIdStrings = userIdsBeforeEval.map(item => String(item.userId));
            
            // Giới hạn số lượng userIds để tránh query quá lớn
            const limitedUserIds = userIdStrings.slice(0, 1000);
            
            const oldScores = await PredictionScore.find({
                chatId: String(chatId),
                userId: { $in: limitedUserIds }
            })
            .select('userId points')
            .lean();

            oldScores.forEach(score => {
                oldScoresMap.set(String(score.userId), score.points || 0);
            });
        }
    } catch (error) {
        console.error('[Prediction] Lỗi khi build oldScoresMap:', error);
    }

    return oldScoresMap;
}

async function collectUserHitStats({ chatId, userIds = null, perUserLimit = MAX_HISTORY_PER_USER, maxUsers = MAX_STATS_USERS }) {
    if (!chatId) {
        return [];
    }

    const query = {
        chatId: String(chatId),
        status: 'hit'
    };

    const cutoffDate = new Date();
    cutoffDate.setHours(0, 0, 0, 0);
    cutoffDate.setDate(cutoffDate.getDate() - (HISTORY_WINDOW_DAYS - 1));
    const cutoffKey = formatDateKey(cutoffDate);
    if (cutoffKey) {
        query.normalizedDate = { $gte: cutoffKey };
    }

    let filteredUserIds = null;
    if (Array.isArray(userIds) && userIds.length > 0) {
        filteredUserIds = userIds
            .map(id => (id ? String(id) : null))
            .filter(Boolean);
        if (!filteredUserIds.length) {
            return [];
        }
        query.userId = { $in: filteredUserIds };
    }

    // Giới hạn số lượng documents để tránh hết bộ nhớ
    // Tính toán limit dựa trên maxUsers và perUserLimit
    const maxDocuments = filteredUserIds 
        ? filteredUserIds.length * perUserLimit 
        : (maxUsers || MAX_STATS_USERS) * perUserLimit * 2; // *2 để đảm bảo có đủ dữ liệu
    
    const hits = await UserPrediction.find(query)
        .sort({ normalizedDate: -1, updatedAt: -1 })
        .select(['userId', 'username', 'displayName', 'normalizedDate', 'matchedLabel', 'matchedChamLabels', 'matchedNumbers'])
        .limit(Math.min(maxDocuments, 10000)) // Giới hạn tối đa 10000 documents
        .lean();

    if (!hits.length) {
        return [];
    }

    const grouped = new Map();
    hits.forEach((hit) => {
        const userId = hit.userId ? String(hit.userId) : null;
        if (!userId) return;

        if (!grouped.has(userId)) {
            grouped.set(userId, {
                userId,
                username: hit.username,
                displayName: hit.displayName,
                entries: []
            });
        }

        const bucket = grouped.get(userId);
        if (bucket.entries.length < perUserLimit) {
            bucket.entries.push({
                normalizedDate: hit.normalizedDate,
                label: hit.matchedLabel,
                chamLabels: Array.isArray(hit.matchedChamLabels) ? hit.matchedChamLabels : [],
                matchedNumbers: Array.isArray(hit.matchedNumbers) ? hit.matchedNumbers : []
            });
        }
    });

    let stats = Array.from(grouped.values()).filter(item => item.entries.length > 0);

    if (filteredUserIds) {
        const orderMap = new Map(filteredUserIds.map((id, index) => [id, index]));
        stats.sort((a, b) => {
            const idxA = orderMap.has(a.userId) ? orderMap.get(a.userId) : Number.MAX_SAFE_INTEGER;
            const idxB = orderMap.has(b.userId) ? orderMap.get(b.userId) : Number.MAX_SAFE_INTEGER;
            if (idxA !== idxB) return idxA - idxB;
            const dateA = a.entries[0]?.normalizedDate || '';
            const dateB = b.entries[0]?.normalizedDate || '';
            return dateB.localeCompare(dateA);
        });
    } else {
        stats.sort((a, b) => {
            const dateA = a.entries[0]?.normalizedDate || '';
            const dateB = b.entries[0]?.normalizedDate || '';
            return dateB.localeCompare(dateA);
        });
        if (typeof maxUsers === 'number') {
            stats = stats.slice(0, maxUsers);
        }
    }

    return stats;
}

async function getAllUserPredictions({ chatId, userId, limit = MAX_HISTORY_PER_USER }) {
    if (!chatId || !userId) {
        return [];
    }

    const cutoffDate = new Date();
    cutoffDate.setHours(0, 0, 0, 0);
    cutoffDate.setDate(cutoffDate.getDate() - (HISTORY_WINDOW_DAYS - 1));
    const cutoffKey = formatDateKey(cutoffDate);

    const query = {
        chatId: String(chatId),
        userId: String(userId)
    };

    if (cutoffKey) {
        query.normalizedDate = { $gte: cutoffKey };
    }

    const predictions = await UserPrediction.find(query)
        .sort({ normalizedDate: -1, updatedAt: -1 })
        .select(['normalizedDate', 'matchedLabel', 'matchedChamLabels', 'matchedNumbers', 'status', 'numbers'])
        .limit(limit)
        .lean();

    return predictions.map(pred => ({
        normalizedDate: pred.normalizedDate,
        label: pred.matchedLabel || null,
        status: pred.status || 'miss',
        chamLabels: Array.isArray(pred.matchedChamLabels) ? pred.matchedChamLabels : [],
        matchedNumbers: Array.isArray(pred.matchedNumbers) ? pred.matchedNumbers : [],
        numbers: Array.isArray(pred.numbers) ? pred.numbers : []
    }));
}

/**
 * Batch fetch predictions cho nhiều users cùng lúc (tối ưu N+1 query)
 */
async function batchGetAllUserPredictions({ chatId, userIds, limit = MAX_HISTORY_PER_USER }) {
    if (!chatId || !Array.isArray(userIds) || userIds.length === 0) {
        return new Map();
    }

    const cutoffDate = new Date();
    cutoffDate.setHours(0, 0, 0, 0);
    cutoffDate.setDate(cutoffDate.getDate() - (HISTORY_WINDOW_DAYS - 1));
    const cutoffKey = formatDateKey(cutoffDate);

    const query = {
        chatId: String(chatId),
        userId: { $in: userIds.map(String) }
    };

    if (cutoffKey) {
        query.normalizedDate = { $gte: cutoffKey };
    }

    const predictions = await UserPrediction.find(query)
        .sort({ userId: 1, normalizedDate: -1, updatedAt: -1 })
        .select(['userId', 'normalizedDate', 'matchedLabel', 'matchedChamLabels', 'matchedNumbers', 'status', 'numbers'])
        .lean();

    // Group predictions by userId
    const predictionsByUser = new Map();
    for (const pred of predictions) {
        const userId = String(pred.userId);
        if (!predictionsByUser.has(userId)) {
            predictionsByUser.set(userId, []);
        }
        const userPreds = predictionsByUser.get(userId);
        if (userPreds.length < limit) {
            userPreds.push({
                normalizedDate: pred.normalizedDate,
                label: pred.matchedLabel || null,
                status: pred.status || 'miss',
                chamLabels: Array.isArray(pred.matchedChamLabels) ? pred.matchedChamLabels : [],
                matchedNumbers: Array.isArray(pred.matchedNumbers) ? pred.matchedNumbers : [],
                numbers: Array.isArray(pred.numbers) ? pred.numbers : []
            });
        }
    }

    return predictionsByUser;
}


function buildTwoColumnHistory(entries = []) {
    if (!entries.length) {
        return `<i>Chưa có dữ liệu.</i>`;
    }

    const limited = entries.slice(0, MAX_HISTORY_PER_USER);
    const lines = [];
    for (let i = 0; i < limited.length; i += 2) {
        const left = formatHistoryEntry(limited[i]);
        const right = limited[i + 1] ? formatHistoryEntry(limited[i + 1]) : '';
        lines.push(right ? `${left}    ${right}` : left);
    }

    return `<blockquote>${lines.join('\n')}</blockquote>`;
}

function formatHistoryEntry(entry) {
    const dateLabel = formatDateForDisplay(entry.normalizedDate);
    const label = formatLabelForDisplay(entry.label);
    const chamLabels = extractMatchedChamLabels(entry);
    const chamSuffix = chamLabels && chamLabels.length
        ? `, ${chamLabels.join(', ')}`
        : '';
    return `<b>${dateLabel} (${label}${chamSuffix})</b>`;
}

function formatHistoryEntryWithMiss(entry) {
    const dateLabel = formatDateForDisplay(entry.normalizedDate);
    if (entry.isHit && entry.label) {
        const chamLabels = extractMatchedChamLabels(entry);
        const chamSuffix = chamLabels && chamLabels.length
            ? `, ${chamLabels.join(', ')}`
            : '';
        return `<b>${dateLabel} (${formatLabelForDisplay(entry.label)}${chamSuffix})</b>`;
    } else {
        // Kiểm tra nếu đang chờ khung 2 ngày
        if (entry.waitingForTwoDayRange) {
            return `<b>${dateLabel} (chờ khung 2 ngày)</b>`;
        }
        // Nếu chưa có kết quả (ngày hiện tại hoặc tương lai) → "đang chờ"
        // Nếu đã có kết quả nhưng không trúng → "trượt"
        if (!entry.hasResult) {
            return `<b>${dateLabel} (đang chờ)</b>`;
        } else {
            return `<b>${dateLabel} (trượt)</b>`;
        }
    }
}

function buildTwoColumnHistoryWithMiss(entries = []) {
    if (!entries.length) {
        return `<i>Chưa có dữ liệu.</i>`;
    }

    const limited = entries.slice(0, MAX_HISTORY_PER_USER);
    const lines = [];
    for (let i = 0; i < limited.length; i += 2) {
        const left = formatHistoryEntryWithMiss(limited[i]);
        const right = limited[i + 1] ? formatHistoryEntryWithMiss(limited[i + 1]) : '';
        lines.push(right ? `${left}    ${right}` : left);
    }

    return `<blockquote>${lines.join('\n')}</blockquote>`;
}

// Map để lưu message_ids theo từng loại lệnh và chatId cho prediction handlers
const predictionCommandMessageIds = new Map();

/**
 * Xóa các tin nhắn cũ của cùng một loại lệnh và lưu tin nhắn mới
 */
async function deleteOldPredictionCommandMessages(chatId, commandType, newMessageId, telegram) {
    const key = `${chatId}:${commandType}`;

    // Lấy message IDs từ database (ưu tiên) hoặc từ Map (cache)
    let oldMessageIds = predictionCommandMessageIds.get(key);
    if (!oldMessageIds || oldMessageIds.length === 0) {
        // Nếu không có trong Map, lấy từ database
        try {
            oldMessageIds = await TelegramCommandMessage.getMessageIds(String(chatId), commandType);
            // Cache vào Map để lần sau không cần query database
            if (oldMessageIds.length > 0) {
                predictionCommandMessageIds.set(key, oldMessageIds);
            }
        } catch (error) {
            console.error(`[Prediction] Lỗi khi lấy message IDs từ database:`, error);
            oldMessageIds = [];
        }
    }

    // Xóa TẤT CẢ các tin nhắn cũ của lệnh này
    const successfullyDeleted = [];
    const failedToDelete = [];

    for (const oldMessageId of oldMessageIds) {
        try {
            await telegram.deleteMessage(chatId, oldMessageId);
            successfullyDeleted.push(oldMessageId);
        } catch (error) {
            // Kiểm tra các lỗi cụ thể từ Telegram API
            const errorMessage = error.message || error.description || '';
            const errorCode = error.response?.error_code || error.code;

            // Các lỗi cho biết tin nhắn không thể xóa được (quá cũ, đã bị xóa, không có quyền)
            // 400: Bad Request - message can't be deleted
            // 403: Forbidden - no rights to delete
            // 404: Not Found - message not found
            if (errorCode === 400 || errorCode === 403 || errorCode === 404 ||
                errorMessage.includes("can't be deleted") ||
                errorMessage.includes("message not found") ||
                errorMessage.includes("not found") ||
                errorMessage.includes("no rights")) {
                // Tin nhắn không thể xóa được (quá cũ > 48h), loại bỏ khỏi danh sách
                failedToDelete.push(oldMessageId);
                console.log(`[Prediction] Không thể xóa message ID ${oldMessageId} (quá cũ hoặc đã bị xóa): ${errorMessage}`);
            } else {
                // Lỗi khác (network error, timeout, etc.) - vẫn cố gắng xóa, nhưng không giữ lại message ID
                console.log(`[Prediction] Không thể xóa tin nhắn cũ ${oldMessageId} (lỗi tạm thời): ${errorMessage}`);
            }
        }
    }

    // CHỈ lưu message_id mới - không giữ lại bất kỳ message IDs cũ nào
    const newMessageIds = [newMessageId];
    predictionCommandMessageIds.set(key, newMessageIds);

    // Lưu vào database để persist qua server restart
    try {
        await TelegramCommandMessage.saveMessageIds(String(chatId), commandType, newMessageIds);
    } catch (error) {
        console.error(`[Prediction] Lỗi khi lưu message IDs vào database:`, error);
    }

    if (successfullyDeleted.length > 0) {
        console.log(`[Prediction] Đã xóa ${successfullyDeleted.length} tin nhắn cũ của lệnh ${commandType}`);
    }
    if (failedToDelete.length > 0) {
        console.log(`[Prediction] ${failedToDelete.length} tin nhắn cũ không thể xóa được (quá cũ > 48h) cho ${commandType}`);
    }
}

/**
 * Kiểm tra xem tin nhắn có phải là lệnh không (để tránh xóa nhầm tin nhắn thường)
 */
function isPredictionCommandMessage(text) {
    if (!text || typeof text !== 'string') {
        return false;
    }

    const trimmed = text.trim();

    // Kiểm tra nếu bắt đầu bằng dấu / (command)
    if (trimmed.startsWith('/')) {
        return true;
    }

    // Kiểm tra các từ khóa lệnh (không có dấu /)
    const commandKeywords = [
        /^(soicau|goiy)(\s|$)/i
    ];

    // Lấy dòng đầu tiên để kiểm tra (bỏ qua mention nếu có)
    const firstLine = trimmed.split('\n')[0].replace(/@\w+/g, '').trim();

    return commandKeywords.some(pattern => pattern.test(firstLine));
}

/**
 * Xóa tin nhắn của người dùng nếu đó là lệnh (chỉ xóa khi bot có quyền admin)
 */
async function deleteUserPredictionCommandMessage(ctx) {
    // Chỉ xóa trong group/supergroup, không xóa trong private chat
    if (!ctx.chat || ctx.chat.type === 'private') {
        return false;
    }

    // Chỉ xóa nếu tin nhắn là lệnh
    const messageText = ctx.message?.text || '';
    if (!isPredictionCommandMessage(messageText)) {
        return false;
    }

    // Chỉ xóa nếu có message_id
    const messageId = ctx.message?.message_id;
    if (!messageId) {
        return false;
    }

    try {
        await ctx.telegram.deleteMessage(ctx.chat.id, messageId);
        console.log(`[Prediction] Đã xóa tin nhắn lệnh của người dùng. Chat ID: ${ctx.chat.id}, Message ID: ${messageId}`);
        return true;
    } catch (error) {
        const errorMessage = error.message || error.description || '';
        const errorCode = error.response?.error_code || error.code;

        // Các lỗi cho biết không thể xóa (không có quyền, tin nhắn quá cũ, etc.)
        if (errorCode === 400 || errorCode === 403 || errorCode === 404 ||
            errorMessage.includes("can't be deleted") ||
            errorMessage.includes("message not found") ||
            errorMessage.includes("not found") ||
            errorMessage.includes("no rights")) {
            // Không log lỗi này vì có thể bot chưa có quyền admin hoặc tin nhắn quá cũ
            console.log(`[Prediction] Không thể xóa tin nhắn của người dùng (có thể bot chưa có quyền admin hoặc tin nhắn quá cũ): ${errorMessage}`);
        } else {
            console.log(`[Prediction] Lỗi khi xóa tin nhắn của người dùng: ${errorMessage}`);
        }
        return false;
    }
}

/**
 * Helper function để lên lịch xóa tin nhắn sau một khoảng thời gian
 * @param {number} chatId - Chat ID
 * @param {number} messageId - Message ID cần xóa
 * @param {object} telegram - Telegram bot instance
 * @param {number} delayMs - Thời gian chờ trước khi xóa (mặc định 3 phút = 180000ms)
 */
function scheduleMessageDeletion(chatId, messageId, telegram, delayMs = 180000) {
    if (!chatId || !messageId || !telegram) {
        return;
    }

    setTimeout(async () => {
        try {
            await telegram.deleteMessage(chatId, messageId);
            console.log(`[Prediction] Đã xóa tin nhắn sau ${delayMs / 1000 / 60} phút. Chat ID: ${chatId}, Message ID: ${messageId}`);
        } catch (error) {
            const errorMessage = error.message || error.description || '';
            const errorCode = error.response?.error_code || error.code;

            // Các lỗi cho biết tin nhắn không thể xóa được (quá cũ > 48h, đã bị xóa, không có quyền)
            if (errorCode === 400 || errorCode === 403 || errorCode === 404 ||
                errorMessage.includes("can't be deleted") ||
                errorMessage.includes("message not found") ||
                errorMessage.includes("not found") ||
                errorMessage.includes("no rights")) {
                // Không log lỗi này vì tin nhắn có thể đã quá cũ hoặc đã bị xóa
                console.log(`[Prediction] Không thể xóa tin nhắn sau ${delayMs / 1000 / 60} phút (có thể đã quá cũ > 48h hoặc đã bị xóa): ${errorMessage}`);
            } else {
                console.log(`[Prediction] Lỗi khi xóa tin nhắn sau ${delayMs / 1000 / 60} phút: ${errorMessage}`);
            }
        }
    }, delayMs);
}

/**
 * Helper function để reply và tự động xóa tin nhắn cũ
 */
async function replyAndCleanOldPrediction(ctx, commandType, text, options = {}) {
    const chatId = ctx.chat?.id;
    if (!chatId) {
        return ctx.reply(text, options);
    }

    const sentMessage = await ctx.reply(text, options);

    if (sentMessage && sentMessage.message_id) {
        await deleteOldPredictionCommandMessages(chatId, commandType, sentMessage.message_id, ctx.telegram);
    }

    return sentMessage;
}

/**
 * Helper function để reply lỗi và tự động xóa tin nhắn lệnh của người dùng (nếu là lệnh)
 * Đồng thời xóa thông báo lỗi cũ của bot trước khi gửi thông báo mới
 * Thêm tag người dùng vào đầu thông báo cho các lỗi cần thiết
 */
async function replyErrorAndDeleteUserPredictionMessage(ctx, errorText, options = {}) {
    const chatId = ctx.chat?.id;
    if (!chatId) {
        return ctx.reply(errorText, options);
    }

    // Xác định commandType dựa trên loại lỗi
    let commandType = 'soicau_error';
    let shouldTagUser = false;

    if (errorText.includes('CHƯA ĐỦ SỐ')) {
        commandType = 'soicau_error_chua_du_so';
        shouldTagUser = true;
    } else if (errorText.includes('Bạn đã thay đổi dự đoán') || (errorText.includes('thay đổi dự đoán') && errorText.includes('lần cho ngày này'))) {
        commandType = 'soicau_error_thay_doi_qua_2_lan';
        shouldTagUser = true;
        // Đảm bảo có prefix VƯỢT QUÁ GIỚI HẠN thay vì LỖI HỆ THỐNG
        if (errorText.includes('LỖI HỆ THỐNG:') && errorText.includes('Bạn đã thay đổi dự đoán')) {
            errorText = errorText.replace('LỖI HỆ THỐNG:', 'VƯỢT QUÁ GIỚI HẠN:');
        }
    } else if (errorText.includes('SAI CÚ PHÁP')) {
        commandType = 'soicau_error_sai_cu_phap';
        shouldTagUser = true;
    } else if (errorText.includes('SAI THỜI GIAN')) {
        commandType = 'soicau_error_sai_thoi_gian';
        shouldTagUser = true;
    } else if (errorText.includes('VƯỢT QUÁ GIỚI HẠN')) {
        commandType = 'soicau_error_vuot_qua_gioi_han';
        shouldTagUser = true;
    } else {
        commandType = 'soicau_error_he_thong';
    }

    // Thêm tag người dùng vào đầu thông báo nếu cần
    let finalErrorText = errorText;
    if (shouldTagUser && ctx.from) {
        const userMention = formatUserMention({
            userId: ctx.from.id,
            username: ctx.from.username,
            displayName: ctx.from.first_name || ctx.from.last_name || ctx.from.username
        });
        // Thêm tag người dùng vào đầu thông báo
        finalErrorText = `${userMention}, ${finalErrorText}`;
    }

    // Xóa tin nhắn của người dùng nếu đó là lệnh
    await deleteUserPredictionCommandMessage(ctx);

    // Xóa thông báo lỗi cũ và gửi thông báo lỗi mới
    return await replyAndCleanOldPrediction(ctx, commandType, finalErrorText, options);
}

function createPredictionHandlers({ xsmbModel }) {
    async function handleCommand(ctx) {
        try {
            const chatId = ctx.chat?.id;
            if (!chatId) {
                return ctx.reply(
                    `<b>LỖI HỆ THỐNG: Không xác định được chat.</b>`,
                    { parse_mode: 'HTML' }
                );
            }

            const messageText = ctx.message?.text || '';
            console.log('[Prediction] handleCommand - Message text:', messageText);
            const args = messageText.trim().split(/\s+/).slice(1) || [];
            console.log('[Prediction] handleCommand - Parsed args:', args);
            if (!args.length) {
                const helpMessage = await replyAndCleanOldPrediction(ctx, 'soicau_help', buildHelpText(), { parse_mode: 'HTML' });
                // Lên lịch xóa tin nhắn help text sau 3 phút
                if (helpMessage && helpMessage.message_id && ctx.chat?.id) {
                    scheduleMessageDeletion(ctx.chat.id, helpMessage.message_id, ctx.telegram, 180000);
                }
                return helpMessage;
            }

            // Kiểm tra format: ngày + @username (ví dụ: 27-11 @username hoặc 27/11 @username)
            // Hoặc chỉ @username (xem ngày hiện tại)
            // Hỗ trợ cả format: subCommand + ngày + @username (ví dụ: thongke 25-11 @username)
            let normalizedDate = null;
            let username = null;
            let userId = null;
            let usernameTokenValue = null;

            // Tìm ngày và username trong args
            // Trước tiên, tìm tất cả các token có thể là date
            const possibleDates = [];
            for (let i = 0; i < args.length; i++) {
                const token = args[i];
                // Bỏ qua subCommand (thongke, ketqua, etc.)
                const subCommand = args[0]?.toLowerCase();
                if (i === 0 && (subCommand === 'thongke' || subCommand === 'stats' ||
                    subCommand === 'ketqua' || subCommand === 'result' ||
                    subCommand === 'danhsachdangky' || subCommand === 'list' ||
                    subCommand === 'hotro' || subCommand === 'help')) {
                    continue;
                }
                const dateToken = sanitizeDateToken(token);
                const parsedDate = normalizeDateInput(dateToken);
                if (parsedDate) {
                    possibleDates.push({ index: i, date: parsedDate });
                }
            }

            // Tìm username trong args
            for (let i = 0; i < args.length; i++) {
                const token = args[i];
                // Kiểm tra nếu là username (bắt đầu bằng @)
                if (token.startsWith('@')) {
                    const usernameParts = [token.substring(1)];
                    let nextIndex = i + 1;
                    while (nextIndex < args.length) {
                        const lookahead = args[nextIndex];
                        const lookaheadDate = normalizeDateInput(sanitizeDateToken(lookahead));
                        if (lookahead.startsWith('@') || lookaheadDate) {
                            break;
                        }
                        usernameParts.push(lookahead);
                        nextIndex += 1;
                    }
                    usernameTokenValue = usernameParts.join(' ').trim();
                    username = normalizeIdentifier(usernameTokenValue);

                    // Tìm ngày gần nhất trước @username
                    // Ưu tiên ngày gần nhất trước @username
                    for (let j = possibleDates.length - 1; j >= 0; j--) {
                        if (possibleDates[j].index < i) {
                            normalizedDate = possibleDates[j].date;
                            break;
                        }
                    }

                    i = nextIndex - 1;
                    break;
                }
            }

            const subCommand = args[0].toLowerCase();
            // Hỗ trợ cả tên mới và tên cũ để tương thích ngược
            if (subCommand === 'hotro' || subCommand === 'help') {
                const helpMessage = await ctx.reply(buildHelpText(), { parse_mode: 'HTML' });
                // Lên lịch xóa tin nhắn help text sau 3 phút
                if (helpMessage && helpMessage.message_id && ctx.chat?.id) {
                    scheduleMessageDeletion(ctx.chat.id, helpMessage.message_id, ctx.telegram, 180000);
                }
                return helpMessage;
            }

            if (subCommand === 'danhsachdangky' || subCommand === 'list') {
                return await handleList(ctx, args.slice(1));
            }

            if (subCommand === 'ketqua' || subCommand === 'result') {
                return await handleResult(ctx, args.slice(1));
            }

            if (subCommand === 'thongke' || subCommand === 'stats') {
                // Hỗ trợ format: soicau thongke @username hoặc soicau thongke 25-11 @username
                if (usernameTokenValue !== null) {
                    // Nếu có username, tìm user prediction để lấy userId
                    // normalizedDate không cần thiết cho thống kê (hiển thị lịch sử)
                    return await handleStats(ctx, 'soicau_thongke', usernameTokenValue.trim());
                }
                return await handleStats(ctx, 'soicau_thongke');
            }

            // Nếu user chỉ nhập soicau @ (không có tên) -> gợi ý danh sách người dùng
            if (usernameTokenValue !== null && !usernameTokenValue.trim().length) {
                if (!normalizedDate) {
                    normalizedDate = formatDateKey(new Date());
                }
                return await handleUserSuggestionList(ctx, normalizedDate);
            }

            // Nếu tìm thấy username
            if (username) {
                // Nếu không có ngày, sử dụng ngày hiện tại
                if (!normalizedDate) {
                    normalizedDate = formatDateKey(new Date());
                }
                return await handleUserDetail(ctx, normalizedDate, usernameTokenValue || username);
            }

            return await handleSubmission(ctx, args);
        } catch (error) {
            const chatId = ctx.chat?.id;
            logPredictionError('handleCommand', error, { chatId, messageText: ctx.message?.text });
            // Nếu lỗi chưa được xử lý bởi các hàm con, trả về message lỗi chung
            if (ctx && ctx.reply) {
                let errorMsg = error.message || 'Có lỗi xảy ra khi xử lý lệnh.';
                // Nếu error message đã có prefix (SAI CÚ PHÁP, SAI THỜI GIAN, etc.), giữ nguyên
                // Nếu chưa có, thêm prefix mặc định
                if (!errorMsg.includes('SAI CÚ PHÁP') && !errorMsg.includes('SAI THỜI GIAN') &&
                    !errorMsg.includes('VƯỢT QUÁ GIỚI HẠN') && !errorMsg.includes('CHƯA ĐỦ SỐ') &&
                    !errorMsg.includes('LỖI HỆ THỐNG')) {
                    errorMsg = `LỖI HỆ THỐNG: ${errorMsg}`;
                }
                return replyErrorAndDeleteUserPredictionMessage(ctx, `<b>${errorMsg}</b>`, { parse_mode: 'HTML' });
            }
            throw error;
        }
    }

    async function handleSubmission(ctx, args) {
        const chatId = ctx.chat?.id;
        const userId = ctx.from?.id;
        
        // Log để debug chatId
        console.log(`[handleSubmission] ctx.chat:`, {
            id: ctx.chat?.id,
            type: ctx.chat?.type,
            title: ctx.chat?.title,
            username: ctx.chat?.username
        });
        
        if (!chatId) {
            console.error('[handleSubmission] ❌ Không xác định được chatId từ ctx.chat');
            return replyErrorAndDeleteUserPredictionMessage(ctx, '<b>LỖI HỆ THỐNG: Không xác định được nhóm chat.</b>', { parse_mode: 'HTML' });
        }
        
        if (!userId) {
            return replyErrorAndDeleteUserPredictionMessage(ctx, '<b>LỖI HỆ THỐNG: Không xác định được người dùng.</b>', { parse_mode: 'HTML' });
        }

        try {
            // Kiểm tra xem có ngày thủ công trong args không
            // Tìm ngày trong các token, bỏ qua các từ không phải ngày (như "Bát", "chốt")
            let hasManualDate = false;
            for (let i = 0; i < args.length; i++) {
                const token = sanitizeDateToken(args[i]);
                if (normalizeDateInput(token)) {
                    hasManualDate = true;
                    break;
                }
            }

            // Nếu không có ngày thủ công, kiểm tra giờ hiện tại để tự động xác định ngày
            if (!hasManualDate) {
                const dateInfo = determinePredictionDate();
                if (!dateInfo) {
                    return ctx.reply(
                        `<b>⏰ KHÔNG THỂ ĐĂNG KÝ</b>\n\n` +
                        `<i>Hiện tại không thể đăng ký dự đoán.</i>\n\n` +
                        `<b>📋 Thời gian đăng ký:</b>\n` +
                        `• <b>Trước 18:00</b> ➜ Đăng ký cho <i>hôm nay</i>\n` +
                        `• <b>Sau 18:35</b> ➜ Đăng ký cho <i>ngày mai</i>\n` +
                        `• <b>18:00 - 18:35</b> ➜ <u>Không thể đăng ký</u>`,
                        { parse_mode: 'HTML' }
                    );
                }
            }

            const { normalizedDates, drawDates, numbers, groups } = parseSubmissionArgs(args, hasManualDate);
            const { username, displayName } = getUserIdentifiers(ctx);

            // Lưu dự đoán cho tất cả các ngày trong khoảng
            const chatIdString = String(chatId);
            const userIdString = String(userId);
            
            console.log(`[handleSubmission] Đang lưu dự đoán với chatId=${chatIdString} (original: ${chatId}, type: ${typeof chatId}), userId=${userIdString}`);
            
            for (let i = 0; i < normalizedDates.length; i++) {
                const normalizedDate = normalizedDates[i];
                const drawDate = drawDates[i];

                try {
                    const savedPrediction = await savePrediction({
                        chatId: chatIdString,
                        userId: userIdString,
                        username,
                        displayName,
                        drawDate,
                        numbers,
                        groups
                    });

                    // Kiểm tra xem dữ liệu đã được lưu thành công chưa
                    if (!savedPrediction) {
                        console.error(`[Prediction] Lỗi: savePrediction trả về null/undefined cho chatId=${chatIdString}, userId=${userIdString}, normalizedDate=${normalizedDate}`);
                        throw new Error('LỖI HỆ THỐNG: Không thể lưu dự đoán vào database.');
                    }

                    // Verify: Kiểm tra lại xem dữ liệu có thực sự trong database không
                    const verifyPrediction = await UserPrediction.findOne({ 
                        chatId: chatIdString, 
                        userId: userIdString, 
                        normalizedDate 
                    }).lean();
                    
                    if (!verifyPrediction) {
                        console.error(`[Prediction] ❌ CẢNH BÁO: Dữ liệu không tìm thấy sau khi lưu! chatId=${chatIdString}, userId=${userIdString}, normalizedDate=${normalizedDate}`);
                    } else {
                        // Kiểm tra xem chatId được lưu có khớp với chatId hiện tại không
                        const savedChatId = String(verifyPrediction.chatId);
                        if (savedChatId !== chatIdString) {
                            console.error(`[Prediction] ⚠️ CẢNH BÁO: chatId được lưu (${savedChatId}) không khớp với chatId hiện tại (${chatIdString})!`);
                        }
                        console.log(`[Prediction] ✅ Đã lưu và verify thành công: chatId=${chatIdString}, userId=${userIdString}, normalizedDate=${normalizedDate}, _id=${savedPrediction._id}, saved_chatId=${verifyPrediction.chatId}`);
                    }
                } catch (saveError) {
                    console.error(`[Prediction] ❌ Lỗi khi lưu dự đoán vào database:`, saveError);
                    // Re-throw để được xử lý bởi catch block bên ngoài
                    throw saveError;
                }
            }

            const userMention = formatUserMention({
                userId: String(userId),
                username,
                displayName
            });

            // Lấy danh sách các dàn đã đăng ký
            const danLabels = groups.map(g => g.label || 'N/A').filter(Boolean);
            const danList = danLabels.length > 0
                ? danLabels.join(', ')
                : 'N/A';

            // Hiển thị ngày (nếu nhiều ngày thì hiển thị khoảng)
            let dateDisplay;
            if (normalizedDates.length === 2) {
                const date1 = formatDateForDisplay(normalizedDates[0]);
                const date2 = formatDateForDisplay(normalizedDates[1]);
                dateDisplay = `${date1} - ${date2}`;
            } else {
                dateDisplay = formatDateForDisplay(normalizedDates[0]);
            }

            // Xóa tin nhắn "✅ THÀNH CÔNG" cũ của cùng user này trước khi gửi tin nhắn mới
            const submissionCommandType = `soicau_submission_${userId}`;
            const submissionKey = `${chatId}:${submissionCommandType}`;

            // Lấy message IDs cũ từ database hoặc Map
            let oldMessageIds = predictionCommandMessageIds.get(submissionKey);
            if (!oldMessageIds || oldMessageIds.length === 0) {
                try {
                    oldMessageIds = await TelegramCommandMessage.getMessageIds(String(chatId), submissionCommandType);
                    if (oldMessageIds.length > 0) {
                        predictionCommandMessageIds.set(submissionKey, oldMessageIds);
                    }
                } catch (error) {
                    console.error(`[Prediction] Lỗi khi lấy message IDs từ database:`, error);
                    oldMessageIds = [];
                }
            }

            // Xóa các tin nhắn cũ
            if (oldMessageIds.length > 0) {
                console.log(`[Prediction] Xóa ${oldMessageIds.length} tin nhắn đăng ký cũ của user ${userId}`);
                for (const oldMessageId of oldMessageIds) {
                    try {
                        await ctx.telegram.deleteMessage(chatId, oldMessageId);
                    } catch (error) {
                        const errorMessage = error.message || error.description || '';
                        const errorCode = error.response?.error_code || error.code;
                        if (errorCode === 400 || errorCode === 403 || errorCode === 404 ||
                            errorMessage.includes("can't be deleted") ||
                            errorMessage.includes("message not found") ||
                            errorMessage.includes("not found") ||
                            errorMessage.includes("no rights")) {
                            // Tin nhắn không thể xóa được (quá cũ > 48h)
                            console.log(`[Prediction] Không thể xóa message ID ${oldMessageId} (quá cũ): ${errorMessage}`);
                        } else {
                            console.log(`[Prediction] Lỗi tạm thời khi xóa message ID ${oldMessageId}: ${errorMessage}`);
                        }
                    }
                }
            }

            // Gửi tin nhắn "✅ THÀNH CÔNG" mới
            const successMessage = await ctx.reply(
                `<b>✅ THÀNH CÔNG</b>\n\n` +
                `<b>👤 Người đăng ký:</b> ${userMention}\n\n` +
                `<i>Đã ghi nhận dàn:</i> <b>${danList}</b>\n` +
                `<i>📅 Ngày:</i> <b>${dateDisplay}</b>`,
                { parse_mode: 'HTML' }
            );

            // Lưu message ID của tin nhắn mới
            if (successMessage && successMessage.message_id) {
                const newMessageIds = [successMessage.message_id];
                predictionCommandMessageIds.set(submissionKey, newMessageIds);
                // Lưu vào database để persist qua server restart
                try {
                    await TelegramCommandMessage.saveMessageIds(String(chatId), submissionCommandType, newMessageIds);
                } catch (error) {
                    console.error(`[Prediction] Lỗi khi lưu message IDs vào database:`, error);
                }

                // Lên lịch xóa tin nhắn "✅ THÀNH CÔNG" sau 3 phút
                scheduleMessageDeletion(chatId, successMessage.message_id, ctx.telegram, 180000);
            }

            // Gửi thống kê trúng số của người dùng sau khi đăng ký thành công
            try {
                await sendStatsMessages(ctx, {
                    userIds: [String(userId)],
                    silentIfEmpty: true
                });
            } catch (statsError) {
                console.error('[Prediction] Lỗi khi gửi thống kê sau đăng ký:', statsError);
                // Không throw error để không ảnh hưởng đến việc đăng ký thành công
            }
        } catch (error) {
            console.error('[Prediction] Lỗi ghi nhận dự đoán:', error);
            try {
                let errorMessage = error.message || 'Không thể ghi nhận dự đoán.';
                // Nếu error message đã có prefix, giữ nguyên; nếu chưa có, thêm prefix
                if (!errorMessage.includes('SAI CÚ PHÁP') && !errorMessage.includes('SAI THỜI GIAN') &&
                    !errorMessage.includes('VƯỢT QUÁ GIỚI HẠN') && !errorMessage.includes('CHƯA ĐỦ SỐ') &&
                    !errorMessage.includes('LỖI HỆ THỐNG')) {
                    errorMessage = `LỖI HỆ THỐNG: ${errorMessage}`;
                }
                await replyErrorAndDeleteUserPredictionMessage(ctx,
                    `<b>${errorMessage}</b>`,
                    { parse_mode: 'HTML' }
                );
            } catch (replyError) {
                console.error('[Prediction] Lỗi khi gửi message lỗi:', replyError);
            }
            return; // Đảm bảo không throw lỗi ra ngoài
        }
    }

    async function handleList(ctx, args) {
        const chatId = ctx.chat?.id;
        const normalizedDate = resolveNormalizedDate(args[0]);
        
        if (!chatId) {
            console.error('[handleList] ❌ Không xác định được chatId từ ctx.chat');
            return ctx.reply(
                `<b>LỖI HỆ THỐNG: Không xác định được nhóm chat.</b>`,
                { parse_mode: 'HTML' }
            );
        }
        
        if (!normalizedDate) {
            return ctx.reply(
                `<b>SAI CÚ PHÁP: Không xác định được ngày cần xem.</b>`,
                { parse_mode: 'HTML' }
            );
        }
        
        const chatIdString = String(chatId);
        console.log(`[handleList] Query với chatId=${chatIdString} (original: ${chatId}, type: ${typeof chatId}), normalizedDate=${normalizedDate}`);
        
        // Lấy danh sách các group được phép từ environment variable
        const allowedChatIdsEnv = process.env.TELEGRAM_ALLOWED_CHAT_IDS;
        const allowedChatIds = allowedChatIdsEnv 
            ? allowedChatIdsEnv.split(',').map(id => String(id.trim())).filter(id => id.length > 0)
            : null;
        
        try {
            const predictions = await listPredictions({ 
                chatId: chatIdString, 
                normalizedDate,
                allowedChatIds 
            });
            if (!predictions.length) {
                return ctx.reply(
                    `<b>ℹ️ THÔNG BÁO</b>\n\n<i>Chưa có dự đoán nào cho ngày này.</i>`,
                    { parse_mode: 'HTML' }
                );
            }
            return await replyAndCleanOldPrediction(ctx, 'soicau_danhsachdangky', buildListMessage(predictions, normalizedDate), { parse_mode: 'HTML' });
        } catch (error) {
            console.error('[Prediction] Lỗi lấy danh sách dự đoán:', error);
            return ctx.reply(
                `<b>LỖI HỆ THỐNG: Không thể lấy danh sách dự đoán.</b>`,
                { parse_mode: 'HTML' }
            );
        }
    }

    async function fetchResultDoc(normalizedDate) {
        if (!xsmbModel || !normalizedDate) return null;

        // Kiểm tra cache trước
        const cacheKey = normalizedDate;
        if (RESULT_DOC_CACHE.has(cacheKey)) {
            return RESULT_DOC_CACHE.get(cacheKey);
        }

        const dateObj = normalizedToDate(normalizedDate);
        if (!dateObj) return null;

        let doc = null;
        if (typeof xsmbModel.findByDate === 'function') {
            doc = await xsmbModel.findByDate(dateObj);
        } else {
            doc = await xsmbModel.findOne({ drawDate: dateObj });
        }

        // Cache kết quả (chỉ cache nếu có doc)
        if (doc) {
            // Kiểm tra và xóa cache cũ nếu vượt quá giới hạn (LRU-like)
            if (RESULT_DOC_CACHE.size >= MAX_RESULT_DOC_CACHE_SIZE) {
                // Xóa entry đầu tiên (FIFO)
                const firstKey = RESULT_DOC_CACHE.keys().next().value;
                if (firstKey) {
                    RESULT_DOC_CACHE.delete(firstKey);
                }
            }
            RESULT_DOC_CACHE.set(cacheKey, doc);
            // Xóa cache sau 1 giờ để tránh memory leak
            setTimeout(() => {
                RESULT_DOC_CACHE.delete(cacheKey);
            }, 3600000);
        }

        return doc;
    }

    async function buildUserStatsMessage(stat, scoreMap, allPredictions = [], xsmbModel = null) {
        const points = scoreMap.get(stat.userId) ?? 0;
        const mention = formatUserMention(stat);

        let message = `<b>📊 THỐNG KÊ TRÚNG SỐ</b>\n`;
        message += `<b>${mention}</b>\n`;
        message += `<i>Điểm hiện tại:</i> <b>${points}</b>\n`;
        message += `<b>LỊCH SỬ TRÚNG (tối đa 30 kỳ)</b>\n`;

        // Tạo map cho các ngày trúng từ stat.entries
        const hitDatesMap = new Map();
        stat.entries.forEach(entry => {
            hitDatesMap.set(entry.normalizedDate, entry.label);
        });

        // Lấy ngày hiện tại để so sánh
        const today = formatDateKey(new Date());

        // Helper function để lấy ngày tiếp theo
        const getNextDate = (normalizedDate) => {
            const date = new Date(`${normalizedDate}T00:00:00.000Z`);
            date.setUTCDate(date.getUTCDate() + 1);
            return formatDateKey(date);
        };

        // Batch fetch tất cả xsmb docs cần thiết cùng lúc (tối ưu N+1 query)
        // Cần kiểm tra tất cả các ngày trong predictions để xử lý logic khung 2 ngày
        const datesToCheck = new Set();
        allPredictions.forEach(pred => {
            if (pred.normalizedDate) {
                datesToCheck.add(pred.normalizedDate);
                // Cũng kiểm tra ngày tiếp theo để xử lý logic khung 2 ngày
                const nextDate = getNextDate(pred.normalizedDate);
                if (nextDate) {
                    datesToCheck.add(nextDate);
                }
            }
        });

        const resultDocsMap = new Map();
        if (datesToCheck.size > 0 && xsmbModel) {
            // Batch fetch tất cả docs cùng lúc (sử dụng fetchResultDoc có cache)
            const normalizedDatesArray = Array.from(datesToCheck);
            const docs = await Promise.all(
                normalizedDatesArray.map(normalizedDate => fetchResultDoc(normalizedDate))
            );

            // Map docs về normalizedDate
            docs.forEach((doc, index) => {
                if (doc) {
                    const normalizedDate = normalizedDatesArray[index];
                    resultDocsMap.set(normalizedDate, doc);
                }
            });
        }

        // Tạo Map để dễ dàng tìm prediction theo ngày
        const predictionsByDate = new Map();
        allPredictions.forEach(pred => {
            predictionsByDate.set(pred.normalizedDate, pred);
        });

        // Helper function để so sánh 2 mảng numbers có giống nhau không
        const areNumbersEqual = (nums1, nums2) => {
            if (!Array.isArray(nums1) || !Array.isArray(nums2)) return false;
            if (nums1.length !== nums2.length) return false;
            const sorted1 = [...nums1].sort();
            const sorted2 = [...nums2].sort();
            return sorted1.every((num, idx) => num === sorted2[idx]);
        };

        // Kiểm tra từng ngày xem đã có kết quả xổ số chưa (sử dụng kết quả đã fetch)
        const allEntriesWithStatus = allPredictions.map((pred) => {
            const isHit = pred.status === 'hit' || !!pred.label || hitDatesMap.has(pred.normalizedDate);
            const isToday = pred.normalizedDate === today;
            const hasResult = resultDocsMap.has(pred.normalizedDate);

            // Kiểm tra xem có đăng ký cho ngày tiếp theo với cùng numbers không (khung 2 ngày)
            let waitingForTwoDayRange = false;
            // Chỉ kiểm tra nếu ngày hiện tại không trúng và có numbers
            if (!isHit && Array.isArray(pred.numbers) && pred.numbers.length > 0) {
                const nextDate = getNextDate(pred.normalizedDate);
                const nextPrediction = predictionsByDate.get(nextDate);
                if (nextPrediction && Array.isArray(nextPrediction.numbers) && nextPrediction.numbers.length > 0) {
                    // Kiểm tra xem có cùng numbers không
                    if (areNumbersEqual(pred.numbers, nextPrediction.numbers)) {
                        // Kiểm tra xem ngày hiện tại đã có kết quả chưa và ngày tiếp theo chưa có kết quả
                        const nextDateHasResult = resultDocsMap.has(nextDate);
                        if (hasResult && !nextDateHasResult) {
                            // Ngày hiện tại trượt (có kết quả), nhưng ngày tiếp theo chưa có kết quả → chờ khung 2 ngày
                            waitingForTwoDayRange = true;
                        }
                    }
                }
            }

            return {
                normalizedDate: pred.normalizedDate,
                label: pred.label || (hitDatesMap.get(pred.normalizedDate) || null),
                isHit,
                isToday,
                hasResult,
                waitingForTwoDayRange,
                chamLabels: Array.isArray(pred.chamLabels) ? pred.chamLabels : [],
                matchedNumbers: Array.isArray(pred.matchedNumbers) ? pred.matchedNumbers : []
            };
        });

        if (!allEntriesWithStatus.length && !stat.entries.length) {
            message += `<i>Chưa có dữ liệu trúng số.</i>`;
            return message;
        }

        message += buildTwoColumnHistoryWithMiss(allEntriesWithStatus);

        return message.trim();
    }

    async function evaluatePendingPredictionsForChat(chatId, normalizedDates = null) {
        if (!xsmbModel || !chatId) return;
        const query = {
            chatId: String(chatId),
            status: 'pending'
        };

        if (Array.isArray(normalizedDates) && normalizedDates.length) {
            const sanitizedDates = normalizedDates.filter(Boolean);
            if (sanitizedDates.length) {
                query.normalizedDate = { $in: sanitizedDates };
            }
        }

        const pendingPredictions = await UserPrediction.find(query)
            .select(['normalizedDate'])
            .lean();
        if (!pendingPredictions.length) {
            return;
        }

        // Collect unique dates
        const uniqueDates = new Set();
        for (const prediction of pendingPredictions) {
            const normalizedDate = prediction.normalizedDate;
            if (normalizedDate) {
                uniqueDates.add(normalizedDate);
            }
        }

        if (uniqueDates.size === 0) {
            return;
        }

        // Batch fetch tất cả docs cùng lúc (tối ưu N+1 query)
        const dateArray = Array.from(uniqueDates);
        const docPromises = dateArray.map(normalizedDate => fetchResultDoc(normalizedDate));
        const docs = await Promise.all(docPromises);

        // Parallel evaluate tất cả predictions (tối ưu sequential processing)
        const evaluatePromises = [];
        for (let i = 0; i < dateArray.length; i++) {
            const normalizedDate = dateArray[i];
            const doc = docs[i];
            if (doc) {
                evaluatePromises.push(
                    evaluatePredictions({ chatId: String(chatId), doc })
                        .catch(error => {
                            logPredictionError('evaluatePendingPredictionsForChat', error, { chatId, normalizedDate });
                            return null;
                        })
                );
            }
        }

        // Chờ tất cả evaluations hoàn thành
        await Promise.all(evaluatePromises);
    }

    async function handleResult(ctx, args) {
        const chatId = ctx.chat.id;
        const normalizedDate = resolveNormalizedDate(args[0]);
        if (!normalizedDate) {
            return await replyAndCleanOldPrediction(ctx, 'soicau_ketqua',
                `<b>SAI CÚ PHÁP: Không xác định được ngày cần tổng hợp.</b>`,
                { parse_mode: 'HTML' }
            );
        }

        // Kiểm tra nếu là ngày hiện tại và trước 18h32
        const today = formatDateKey(new Date());
        if (normalizedDate === today) {
            const now = new Date();
            const currentHour = now.getHours();
            const currentMinute = now.getMinutes();
            const currentTime = currentHour * 60 + currentMinute; // Tổng số phút trong ngày
            const cutoffTime = 18 * 60 + 32; // 18h32 = 1112 phút

            if (currentTime < cutoffTime) {
                return await replyAndCleanOldPrediction(ctx, 'soicau_ketqua',
                    `<b>ℹ️ THÔNG BÁO</b>\n\n<i>Chưa có kết quả ngày hôm nay.</i>\n\n<b>⏰ Kết quả sẽ có sau 18:32</b>`,
                    { parse_mode: 'HTML' }
                );
            }
        }

        try {
            const doc = await fetchResultDoc(normalizedDate);
            if (!doc) {
                return await replyAndCleanOldPrediction(ctx, 'soicau_ketqua',
                    `<b>ℹ️ THÔNG BÁO</b>\n\n<i>Chưa có dữ liệu kết quả cho ngày này.</i>`,
                    { parse_mode: 'HTML' }
                );
            }

            // Query điểm cũ TRƯỚC KHI evaluatePredictions để tính điểm mới chính xác
            const oldScoresMap = await buildOldScoresMap(chatId, normalizedDate);

            const summary = await evaluatePredictions({ chatId: String(chatId), doc });
            if (!summary) {
                return await replyAndCleanOldPrediction(ctx, 'soicau_ketqua',
                    `<b>ℹ️ THÔNG BÁO</b>\n\n<i>Chưa có ai gửi dự đoán để tổng hợp.</i>`,
                    { parse_mode: 'HTML' }
                );
            }

            // Xác định những người đang chờ khung 2 ngày
            const waitingTwoDayUserIds = new Set();
            const hitUserIds = new Set((summary.hits || []).map(h => h.userId ? String(h.userId) : null).filter(Boolean));

            // Lấy tất cả predictions không trúng cho ngày hiện tại
            const misses = (summary.predictions || []).filter(pred => {
                if (!pred.userId) return false;
                return !hitUserIds.has(String(pred.userId));
            });

            // Helper function để so sánh 2 mảng numbers
            const areNumbersEqual = (nums1, nums2) => {
                if (!Array.isArray(nums1) || !Array.isArray(nums2)) return false;
                if (nums1.length !== nums2.length) return false;
                const sorted1 = [...nums1].sort();
                const sorted2 = [...nums2].sort();
                return sorted1.every((num, idx) => num === sorted2[idx]);
            };

            // Helper function để lấy ngày tiếp theo
            const getNextDate = (nd) => {
                const date = new Date(`${nd}T00:00:00.000Z`);
                date.setUTCDate(date.getUTCDate() + 1);
                return formatDateKey(date);
            };

            // Kiểm tra từng prediction không trúng
            for (const miss of misses) {
                if (!miss.userId || !Array.isArray(miss.numbers) || miss.numbers.length === 0) continue;

                const userId = String(miss.userId);
                const nextDate = getNextDate(normalizedDate);

                // Kiểm tra xem ngày tiếp theo đã có kết quả chưa
                const nextDateDoc = await fetchResultDoc(nextDate);
                if (nextDateDoc) {
                    // Ngày tiếp theo đã có kết quả, không phải chờ khung 2 ngày
                    continue;
                }

                // Kiểm tra xem có đăng ký cho ngày tiếp theo với cùng numbers không
                const nextDatePrediction = await UserPrediction.findOne({
                    chatId: String(chatId),
                    userId: userId,
                    normalizedDate: nextDate
                }).lean();

                if (nextDatePrediction && Array.isArray(nextDatePrediction.numbers) && nextDatePrediction.numbers.length > 0) {
                    // So sánh numbers
                    if (areNumbersEqual(miss.numbers, nextDatePrediction.numbers)) {
                        // Cùng numbers, và ngày tiếp theo chưa có kết quả → chờ khung 2 ngày
                        waitingTwoDayUserIds.add(userId);
                    }
                }
            }

            return await replyAndCleanOldPrediction(ctx, 'soicau_ketqua', await buildResultMessage(summary, normalizedDate, chatId, oldScoresMap, waitingTwoDayUserIds), { parse_mode: 'HTML' });
        } catch (error) {
            logPredictionError('handleResult', error, { chatId, normalizedDate });
            return await replyAndCleanOldPrediction(ctx, 'soicau_ketqua',
                `<b>LỖI HỆ THỐNG: Không thể tổng hợp kết quả dự đoán.</b>`,
                { parse_mode: 'HTML' }
            );
        }
    }

    async function sendStatsMessages(ctx, { userIds = null, silentIfEmpty = false, commandType = 'soicau_thongke' } = {}) {
        const chatId = ctx.chat?.id;
        if (!chatId) {
            return;
        }

        // Xóa các tin nhắn cũ của lệnh này (chỉ khi là lệnh thống kê chính, không phải từ đăng ký)
        const key = commandType === 'soicau_thongke' ? `${chatId}:${commandType}` : null;
        if (key) {
            // Lấy message IDs từ database (ưu tiên) hoặc từ Map (cache)
            let oldMessageIds = predictionCommandMessageIds.get(key);
            if (!oldMessageIds || oldMessageIds.length === 0) {
                // Nếu không có trong Map, lấy từ database
                try {
                    oldMessageIds = await TelegramCommandMessage.getMessageIds(String(chatId), commandType);
                    // Cache vào Map để lần sau không cần query database
                    if (oldMessageIds.length > 0) {
                        predictionCommandMessageIds.set(key, oldMessageIds);
                    }
                } catch (error) {
                    console.error(`[Prediction] Lỗi khi lấy message IDs từ database:`, error);
                    oldMessageIds = [];
                }
            }
            console.log(`[Prediction] sendStatsMessages - Tìm thấy ${oldMessageIds.length} tin nhắn cũ cần xóa cho ${commandType}:`, oldMessageIds);

            const successfullyDeleted = [];
            const failedToDelete = [];

            for (const oldMessageId of oldMessageIds) {
                try {
                    await ctx.telegram.deleteMessage(chatId, oldMessageId);
                    successfullyDeleted.push(oldMessageId);
                    console.log(`[Prediction] Đã xóa thành công message ID ${oldMessageId}`);
                } catch (error) {
                    const errorMessage = error.message || error.description || '';
                    const errorCode = error.response?.error_code || error.code;

                    // Các lỗi cho biết tin nhắn không thể xóa được
                    if (errorCode === 400 || errorCode === 403 || errorCode === 404 ||
                        errorMessage.includes("can't be deleted") ||
                        errorMessage.includes("message not found") ||
                        errorMessage.includes("not found") ||
                        errorMessage.includes("no rights")) {
                        failedToDelete.push(oldMessageId);
                        console.log(`[Prediction] Không thể xóa message ID ${oldMessageId} (quá cũ hoặc đã bị xóa): ${errorMessage}`);
                    } else {
                        console.log(`[Prediction] Lỗi tạm thời khi xóa message ID ${oldMessageId}: ${errorMessage}`);
                    }
                }
            }

            if (successfullyDeleted.length > 0) {
                console.log(`[Prediction] Đã xóa ${successfullyDeleted.length} tin nhắn cũ thành công cho ${commandType}`);
            }
            if (failedToDelete.length > 0) {
                console.log(`[Prediction] ${failedToDelete.length} tin nhắn cũ không thể xóa được (quá cũ > 48h) cho ${commandType}`);
            }
        }

        try {
            await evaluatePendingPredictionsForChat(chatId);

            const stats = await collectUserHitStats({
                chatId: String(chatId),
                userIds: userIds && userIds.length ? userIds : null
            });

            if (!stats.length) {
                if (silentIfEmpty) {
                    return;
                }
                const emptyMsg = await ctx.reply(
                    `<b>ℹ️ THÔNG BÁO</b>\n\n<i>Chưa có ai trúng để thống kê.</i>`,
                    { parse_mode: 'HTML' }
                );
                if (commandType === 'soicau_thongke' && emptyMsg && emptyMsg.message_id) {
                    const key = `${chatId}:${commandType}`;
                    const messageIds = [emptyMsg.message_id];
                    predictionCommandMessageIds.set(key, messageIds);
                    // Lưu vào database để persist qua server restart
                    try {
                        await TelegramCommandMessage.saveMessageIds(String(chatId), commandType, messageIds);
                    } catch (error) {
                        console.error(`[Prediction] Lỗi khi lưu message IDs vào database:`, error);
                    }
                }
                return;
            }

            const statsUserIds = stats.map(stat => stat.userId);
            const scoreMap = await buildScoreMap(chatId, statsUserIds);

            // Batch fetch tất cả predictions cho tất cả users cùng lúc (tối ưu N+1 query)
            const predictionsByUser = await batchGetAllUserPredictions({
                chatId: String(chatId),
                userIds: statsUserIds
            });

            const messageIds = [];

            for (const stat of stats) {
                // Lấy predictions từ batch result
                const allPredictions = predictionsByUser.get(String(stat.userId)) || [];
                const message = await buildUserStatsMessage(stat, scoreMap, allPredictions, xsmbModel);
                const sentMsg = await ctx.reply(message, { parse_mode: 'HTML' });
                if (sentMsg && sentMsg.message_id) {
                    messageIds.push(sentMsg.message_id);
                }
            }

            // Lưu tất cả message_ids
            if (commandType === 'soicau_thongke' && messageIds.length > 0) {
                const key = `${chatId}:${commandType}`;
                predictionCommandMessageIds.set(key, messageIds);
                // Lưu vào database để persist qua server restart
                try {
                    await TelegramCommandMessage.saveMessageIds(String(chatId), commandType, messageIds);
                } catch (error) {
                    console.error(`[Prediction] Lỗi khi lưu message IDs vào database:`, error);
                }
                console.log(`[Prediction] Đã lưu ${messageIds.length} message ID(s) mới cho ${commandType}:`, messageIds);
            } else if (commandType === 'soicau_thongke') {
                console.log(`[Prediction] Cảnh báo: Không có message IDs nào được lưu cho ${commandType} (messageIds.length = ${messageIds.length})`);
            }
        } catch (error) {
            logPredictionError('sendStatsMessages', error, { chatId, userIds, commandType });
            if (!silentIfEmpty) {
                const errorMsg = await ctx.reply(
                    `<b>LỖI HỆ THỐNG: Không thể lấy thống kê người trúng.</b>`,
                    { parse_mode: 'HTML' }
                );
                // Lưu error message ID để lần sau có thể xóa được
                if (key && errorMsg && errorMsg.message_id) {
                    const messageIds = [errorMsg.message_id];
                    predictionCommandMessageIds.set(key, messageIds);
                    // Lưu vào database để persist qua server restart
                    try {
                        await TelegramCommandMessage.saveMessageIds(String(chatId), commandType, messageIds);
                    } catch (error) {
                        console.error(`[Prediction] Lỗi khi lưu message IDs vào database:`, error);
                    }
                    console.log(`[Prediction] Đã lưu error message ID ${errorMsg.message_id} cho ${commandType}`);
                }
            }
        }
    }

    async function handleStats(ctx, commandType = 'soicau_thongke', targetIdentifier = null) {
        const chatId = ctx.chat?.id;
        if (!chatId) {
            return ctx.reply(
                `<b>LỖI HỆ THỐNG: Không xác định được chat.</b>`,
                { parse_mode: 'HTML' }
            );
        }

        if (targetIdentifier) {
            const prediction = await findUserPredictionByIdentifier({
                chatId: String(chatId),
                identifier: targetIdentifier
            });

            if (!prediction || !prediction.userId) {
                const notFoundMessage = await ctx.reply(
                    `<b>ℹ️ THÔNG BÁO</b>\n\n<i>Không tìm thấy người dùng "${targetIdentifier}".</i>`,
                    { parse_mode: 'HTML' }
                );
                // Lên lịch xóa tin nhắn sau 3 phút
                if (notFoundMessage && notFoundMessage.message_id) {
                    scheduleMessageDeletion(chatId, notFoundMessage.message_id, ctx.telegram, 180000);
                }
                return notFoundMessage;
            }

            return await sendStatsMessages(ctx, {
                userIds: [String(prediction.userId)],
                commandType
            });
        }

        await sendStatsMessages(ctx, { commandType });
    }

    async function handleUserSuggestionList(ctx, normalizedDate, searchTerm = '') {
        const chatId = ctx.chat?.id;
        if (!chatId) {
            return ctx.reply(
                `<b>LỖI HỆ THỐNG: Không xác định được chat.</b>`,
                { parse_mode: 'HTML' }
            );
        }

        try {
            const predictions = await listPredictions({ chatId: String(chatId), normalizedDate });
            const displayDate = formatDateForDisplay(normalizedDate);
            const normalizedSearch = normalizeIdentifier(searchTerm);

            if (!predictions.length) {
                return await replyAndCleanOldPrediction(ctx, 'soicau_user_suggestion',
                    `<b>ℹ️ THÔNG BÁO</b>\n\n<i>Chưa có người dùng nào đăng ký cho ngày ${displayDate}.</i>`,
                    { parse_mode: 'HTML' }
                );
            }

            const seenKeys = new Set();
            const users = [];
            predictions.forEach((prediction, idx) => {
                const userId = prediction.userId ? String(prediction.userId) : null;
                const username = prediction.username ? String(prediction.username).replace(/^@/, '') : null;
                const displayName = prediction.displayName || prediction.fullName || prediction.username || (userId ? `user_${userId}` : 'Ẩn danh');
                const dedupKey = userId || username || normalizeIdentifier(displayName) || `unknown_${idx}`;

                if (seenKeys.has(dedupKey)) {
                    return;
                }
                seenKeys.add(dedupKey);

                users.push({
                    userId,
                    username,
                    displayName
                });
            });

            if (!users.length) {
                return await replyAndCleanOldPrediction(ctx, 'soicau_user_suggestion',
                    `<b>ℹ️ THÔNG BÁO</b>\n\n<i>Chưa có người dùng hợp lệ cho ngày ${displayDate}.</i>`,
                    { parse_mode: 'HTML' }
                );
            }

            const filteredUsers = normalizedSearch
                ? users.filter(user => {
                    const identifier = buildUserCommandIdentifier(user) || '';
                    const normalizedDisplay = normalizeIdentifier(user.displayName || '');
                    return (
                        (identifier && identifier.startsWith(normalizedSearch)) ||
                        (normalizedDisplay && normalizedDisplay.includes(normalizedSearch))
                    );
                })
                : users;

            if (!filteredUsers.length) {
                const notFoundMessage = await ctx.reply(
                    `<b>ℹ️ THÔNG BÁO</b>\n\n<i>Không tìm thấy người dùng nào phù hợp với "${searchTerm || ''}" cho ngày ${displayDate}.</i>`,
                    { parse_mode: 'HTML' }
                );
                // Lên lịch xóa tin nhắn sau 3 phút
                if (notFoundMessage && notFoundMessage.message_id) {
                    scheduleMessageDeletion(chatId, notFoundMessage.message_id, ctx.telegram, 180000);
                }
                return notFoundMessage;
            }

            const limitedUsers = filteredUsers.slice(0, MAX_USER_SUGGESTIONS);
            let message = `<b>👥 DANH SÁCH NGƯỜI DÙNG</b>\n`;
            message += `<i>📅 Ngày:</i> <b>${displayDate}</b>\n`;
            if (searchTerm) {
                message += `<i>Từ khóa:</i> <b>${searchTerm}</b>\n`;
            }
            message += `<i>Gõ lệnh theo gợi ý để xem chi tiết:</i>\n\n`;

            limitedUsers.forEach((user, index) => {
                const mention = formatUserMention(user);
                const identifier = buildUserCommandIdentifier(user);
                message += `<b>${index + 1}.</b> ${mention}\n`;
                if (identifier) {
                    message += `   <code>soicau @${identifier}</code>\n`;
                }
                message += `\n`;
            });

            if (filteredUsers.length > limitedUsers.length) {
                message += `<i>... và ${filteredUsers.length - limitedUsers.length} người khác.</i>\n`;
            }

            return await replyAndCleanOldPrediction(ctx, 'soicau_user_suggestion', removeEmptyLines(message), { parse_mode: 'HTML' });
        } catch (error) {
            console.error('[Prediction] Lỗi gợi ý người dùng:', error);
            return ctx.reply(
                `<b>LỖI HỆ THỐNG: Không thể lấy danh sách người dùng.</b>`,
                { parse_mode: 'HTML' }
            );
        }
    }

    async function handleUserDetail(ctx, normalizedDate, username) {
        const chatId = ctx.chat?.id;
        if (!chatId) {
            return ctx.reply(
                `<b>LỖI HỆ THỐNG: Không xác định được chat.</b>`,
                { parse_mode: 'HTML' }
            );
        }

        // Xác định commandType dựa trên việc có ngày hay không
        const today = formatDateKey(new Date());
        const commandType = normalizedDate === today ? 'soicau_userdetail_today' : 'soicau_userdetail_date';

        try {
            await evaluatePendingPredictionsForChat(chatId, [normalizedDate]);

            const prediction = await findUserPredictionByIdentifier({
                chatId: String(chatId),
                normalizedDate,
                identifier: username
            });

            if (!prediction) {
                return await handleUserSuggestionList(ctx, normalizedDate, username);
            }

            // Lấy kết quả xsmb nếu có
            const doc = await fetchResultDoc(normalizedDate);
            let evaluationResult = null;
            if (doc) {
                // Evaluate prediction này
                const specialTarget = getSpecialLastTwo(doc);
                if (specialTarget) {
                    const groups = Array.isArray(prediction.groups) ? prediction.groups : [];
                    const orderedGroups = [...groups].sort((a, b) => {
                        const priorityA = getLabelPriority(a.label);
                        const priorityB = getLabelPriority(b.label);
                        return priorityA - priorityB;
                    });

                    let matchedNumbers = [];
                    let status = 'miss';
                    let matchedLabel = null;
                    let scoreDelta = 0;

                    for (const group of orderedGroups) {
                        const numbers = Array.isArray(group.numbers) ? group.numbers : [];
                        if (numbers.includes(specialTarget)) {
                            matchedNumbers = [specialTarget];
                            status = 'hit';
                            matchedLabel = group.label || group.rawLabel || null;
                            const count = group.count || numbers.length;
                            scoreDelta = getPointsByLabelOrCount(group.label, count);
                            break;
                        }
                    }

                    const matchedChamLabels = getMatchedChamLabelsFromGroups(groups, specialTarget);

                    evaluationResult = {
                        matchedNumbers,
                        status,
                        matchedLabel,
                        scoreDelta,
                        specialTarget,
                        matchedChamLabels
                    };
                }
            }

            // Build message chi tiết
            const displayDate = formatDateForDisplay(normalizedDate);
            const userMention = formatUserMention(prediction);
            const displayName = prediction.displayName || userMention;
            const numbers = Array.isArray(prediction.numbers) ? prediction.numbers : [];
            const groups = Array.isArray(prediction.groups) ? prediction.groups : [];

            let message = `<b>📋 CHI TIẾT DỰ ĐOÁN</b>\n\n`;
            message += `<b>👤 Người soi cầu MB:</b> ${displayName}\n`;
            message += `<b>📅 Ngày:</b> ${displayDate}\n\n`;

            // Hiển thị các dàn và số theo từng dàn
            if (groups.length > 0) {
                message += `<b>📊 Các dàn đã soi cầu MB:</b>\n`;
                groups.forEach((group, index) => {
                    const label = group.label || group.rawLabel || 'N/A';
                    const groupNumbers = Array.isArray(group.numbers) ? group.numbers : [];
                    const count = groupNumbers.length;
                    if (group.groupType === 'cham' && Array.isArray(group.chamDigits) && group.chamDigits.length) {
                        message += `${index + 1}. <b>Chạm ${group.chamDigits.join(', ')}</b> - ${count} số\n`;
                    } else {
                        message += `${index + 1}. <b>${label}</b> - ${count} số\n`;
                    }
                });
                message += `\n`;

                const chamSummaries = formatChamRegistrationSummary(groups);
                if (chamSummaries.length) {
                    chamSummaries.forEach(line => {
                        message += `${line}\n`;
                    });
                    message += `\n`;
                }
            }

            // Hiển thị số theo từng dàn như người dùng đã soi cầu MB
            if (groups.length > 0) {
                const groupLines = groups
                    .filter(group => group.groupType !== 'cham')
                    .map((group) => {
                        const label = group.label || group.rawLabel || 'N/A';
                        const groupNumbers = Array.isArray(group.numbers) ? group.numbers : [];

                        if (groupNumbers.length > 0) {
                            const numbersPerLine = 15;
                            const lines = [];
                            for (let i = 0; i < groupNumbers.length; i += numbersPerLine) {
                                const lineNumbers = groupNumbers.slice(i, i + numbersPerLine);
                                lines.push(lineNumbers.join(' '));
                            }
                            return `<b>${label}</b>\n${lines.join('\n')}`;
                        }
                        return '';
                    })
                    .filter(Boolean);
                if (groupLines.length) {
                    message += `${groupLines.join('\n\n')}\n\n`;
                }
            } else if (numbers.length > 0) {
                // Nếu không có groups, hiển thị tất cả số
                message += `<i>Danh sách số:</i>\n`;
                const numbersPerLine = 15;
                const lines = [];
                for (let i = 0; i < numbers.length; i += numbersPerLine) {
                    const lineNumbers = numbers.slice(i, i + numbersPerLine);
                    lines.push(lineNumbers.join(' '));
                }
                message += lines.join('\n') + '\n';
            }

            // Hiển thị kết quả nếu có
            if (evaluationResult) {
                message += `\n<b>🎯 KẾT QUẢ:</b>\n`;
                message += `<b>2 số cuối giải ĐB:</b> <code>${evaluationResult.specialTarget}</code>\n`;

                if (evaluationResult.status === 'hit') {
                    message += `\n<b>🎉 TRÚNG SỐ!</b>\n`;
                    message += `<b>Số trúng:</b> <code>${evaluationResult.matchedNumbers.join(', ')}</code>\n`;
                    message += `<b>Dàn trúng:</b> <b>${evaluationResult.matchedLabel || 'N/A'}</b>\n`;
                    message += `<b>Điểm nhận được:</b> <b>+${evaluationResult.scoreDelta}</b> điểm\n`;
                    if (evaluationResult.matchedChamLabels?.length) {
                        message += `<b>Trúng chạm:</b> ${evaluationResult.matchedChamLabels.join(', ')}\n`;
                    }
                } else {
                    message += `\n<i>😔 Chưa trúng số trong kỳ này.</i>\n`;
                }
            } else {
                message += `\n<i>ℹ️ Chưa có kết quả xổ số cho ngày này.</i>\n`;
            }

            const finalMessage = removeEmptyLines(message);
            return await replyAndCleanOldPrediction(ctx, commandType, finalMessage, { parse_mode: 'HTML' });
        } catch (error) {
            console.error('[Prediction] Lỗi xem chi tiết dự đoán:', error);
            return ctx.reply(
                `<b>LỖI HỆ THỐNG: Không thể lấy chi tiết dự đoán.</b>`,
                { parse_mode: 'HTML' }
            );
        }
    }

    async function maybeAnnounceResult(ctx, doc) {
        const chatId = ctx.chat?.id;
        if (!chatId || !doc?.drawDate) {
            console.log('[Prediction] maybeAnnounceResult: Không có chatId hoặc drawDate');
            return;
        }

        const normalizedDate = formatDateKey(doc.drawDate);
        if (!normalizedDate) {
            console.log('[Prediction] maybeAnnounceResult: Không thể format ngày');
            return;
        }

        const alreadyNotified = await hasNotifiedResults(String(chatId), normalizedDate);
        if (alreadyNotified) {
            console.log(`[Prediction] maybeAnnounceResult: Đã thông báo kết quả cho ngày ${normalizedDate} rồi, bỏ qua`);
            return;
        }

        // Query điểm cũ TRƯỚC KHI evaluatePredictions để tính điểm mới chính xác
        const oldScoresMap = await buildOldScoresMap(chatId, normalizedDate);

        const summary = await evaluatePredictions({ chatId: String(chatId), doc });
        if (!summary) {
            console.log(`[Prediction] maybeAnnounceResult: Không có dự đoán để tổng hợp cho ngày ${normalizedDate}`);
            return;
        }

        try {
            const message = await buildResultMessage(summary, normalizedDate, chatId, oldScoresMap);
            const sentMessage = await replyAndCleanOldPrediction(ctx, 'soicau_ketqua', message, { parse_mode: 'HTML' });
            if (sentMessage && sentMessage.message_id) {
                await markResultsNotified(String(chatId), normalizedDate);
                console.log(`[Prediction] ✅ Đã gửi thông báo kết quả dự đoán cho chat ${chatId}, ngày ${normalizedDate}, message ID: ${sentMessage.message_id}`);
            }
        } catch (error) {
            console.error(`[Prediction] ❌ Lỗi khi gửi thông báo kết quả dự đoán:`, error);
            throw error;
        }
    }

    async function announcePredictionList(ctx, normalizedDate) {
        const chatId = ctx.chat?.id;
        if (!chatId) {
            return;
        }
        try {
            const predictions = await listPredictions({ chatId: String(chatId), normalizedDate });
            if (!predictions.length) {
                return; // Không gửi nếu chưa có dự đoán
            }
            await ctx.reply(buildListMessage(predictions, normalizedDate), { parse_mode: 'HTML' });
        } catch (error) {
            console.error('[Prediction] Lỗi gửi danh sách dự đoán tự động:', error);
        }
    }

    async function forceAnnounceResult(ctx, doc) {
        const chatId = ctx.chat?.id;
        if (!chatId || !doc?.drawDate) {
            console.log('[Prediction] forceAnnounceResult: Không có chatId hoặc drawDate');
            return null;
        }

        const normalizedDate = formatDateKey(doc.drawDate);
        if (!normalizedDate) {
            console.log('[Prediction] forceAnnounceResult: Không thể format ngày');
            return null;
        }

        // Query điểm cũ TRƯỚC KHI evaluatePredictions để tính điểm mới chính xác
        const oldScoresMap = await buildOldScoresMap(chatId, normalizedDate);

        const summary = await evaluatePredictions({ chatId: String(chatId), doc });
        if (!summary) {
            console.log(`[Prediction] forceAnnounceResult: Không có dự đoán để tổng hợp cho ngày ${normalizedDate}`);
            return null;
        }

        try {
            const message = await buildResultMessage(summary, normalizedDate, chatId, oldScoresMap);
            const sentMessage = await replyAndCleanOldPrediction(ctx, 'soicau_ketqua', message, { parse_mode: 'HTML' });
            if (sentMessage && sentMessage.message_id) {
                // Đánh dấu đã thông báo sau khi gửi thành công
                await markResultsNotified(String(chatId), normalizedDate);
                console.log(`[Prediction] ✅ Đã force gửi thông báo kết quả dự đoán cho chat ${chatId}, ngày ${normalizedDate}, message ID: ${sentMessage.message_id}`);
            }
            return summary;
        } catch (error) {
            console.error(`[Prediction] ❌ Lỗi khi force gửi thông báo kết quả dự đoán:`, error);
            throw error;
        }
    }

    async function announcePredictionStats(ctx, summary) {
        if (!ctx || !summary || !Array.isArray(summary.hits) || !summary.hits.length) {
            return;
        }

        const userIds = summary.hits
            .map(hit => (hit.userId ? String(hit.userId) : null))
            .filter(Boolean);

        if (!userIds.length) {
            console.log('[Prediction] announcePredictionStats: Không có userId hợp lệ để gửi thống kê.');
            return;
        }

        await sendStatsMessages(ctx, { userIds, silentIfEmpty: true });
    }

    async function announceGlobalStats(ctx) {
        await sendStatsMessages(ctx, { silentIfEmpty: true });
    }

    return {
        handleCommand,
        maybeAnnounceResult,
        announcePredictionList,
        forceAnnounceResult,
        announcePredictionStats,
        announceGlobalStats,
        buildHelpText
    };
}

module.exports = createPredictionHandlers;

