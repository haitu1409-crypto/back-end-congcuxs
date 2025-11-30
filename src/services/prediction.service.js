const Prediction = require('../models/userPrediction.model');
const { applyScoreChange } = require('./predictionScore.service');

// Thứ tự ưu tiên đối chiếu kết quả: BTD > STĐ > TTĐ > 0X > 1X > ... > 9X
const LABEL_ORDER = ['BTĐ', 'BTD', 'STĐ', 'STD', 'TTĐ', 'TTD', '0X', '1X', '2X', '3X', '4X', '5X', '6X', '7X', '8X', '9X'];
const LABEL_POINTS = {
    '0X': 100,
    '1X': 90,
    '2X': 80,
    '3X': 70,
    '4X': 60,
    '5X': 50,
    '6X': 40,
    '7X': 30,
    '8X': 20,
    '9X': 10,
    // Các tiêu đề đặc biệt với điểm số cao hơn
    'TTĐ': 110,  // 4 cặp số
    'TTD': 110,  // Alias
    'STĐ': 120,  // 2 cặp số
    'STD': 120,  // Alias
    'BTĐ': 150,  // 1 cặp số
    'BTD': 150   // Alias
};

const LABEL_PRIORITY = LABEL_ORDER.reduce((acc, label, index) => {
    acc[label] = index;
    return acc;
}, {});

function getChamPointsByDigitCount(count = 1) {
    if (!count || count < 1) return 0;
    if (count === 1) return 50;
    if (count === 2) return 100;
    return 150;
}

function normalizeTwoDigit(num) {
    if (num === undefined || num === null) return null;
    const str = String(num).trim();
    if (!str.length) return null;
    const digits = str.replace(/\D/g, '');
    if (digits.length < 2) return null;
    return digits.slice(-2).padStart(2, '0');
}

function uniqueNumbers(numbers = []) {
    const normalized = numbers
        .map(normalizeTwoDigit)
        .filter(Boolean);
    return Array.from(new Set(normalized));
}

function sanitizeChamDigits(digits = []) {
    return Array.from(new Set(
        (digits || [])
            .map(digit => String(digit).trim())
            .filter(digit => /^\d$/.test(digit))
    ));
}

function getLabelPoints(label) {
    if (!label) return 0;
    return LABEL_POINTS[label.toUpperCase()] || 0;
}

/**
 * Tính điểm dựa trên số lượng số (count)
 * Áp dụng cho các tiêu đề 0X-9X, 8S-95S, và các tiêu đề động
 * Logic: count <= 9 → 100, <= 19 → 90, <= 29 → 80, <= 39 → 70, ...
 * @param {number} count - Số lượng số
 * @returns {number} Điểm số tương ứng
 */
function getPointsByCount(count) {
    if (!count || count < 1) return 0;
    
    // 1 số: 150 điểm (BTĐ)
    if (count === 1) return 150;
    // 2 số: 130 điểm
    if (count === 2) return 130;
    // 3 số: 120 điểm
    if (count === 3) return 120;
    // 4 số: 110 điểm (TTĐ)
    if (count === 4) return 110;
    // 5-9 số: 100 điểm (0X)
    if (count >= 5 && count <= 9) return 100;
    // 10-19 số: 90 điểm (1X)
    if (count >= 10 && count <= 19) return 90;
    // 20-29 số: 80 điểm (2X)
    if (count >= 20 && count <= 29) return 80;
    // 30-39 số: 70 điểm (3X)
    if (count >= 30 && count <= 39) return 70;
    // 40-49 số: 60 điểm (4X)
    if (count >= 40 && count <= 49) return 60;
    // 50-59 số: 50 điểm (5X)
    if (count >= 50 && count <= 59) return 50;
    // 60-69 số: 40 điểm (6X)
    if (count >= 60 && count <= 69) return 40;
    // 70-79 số: 30 điểm (7X)
    if (count >= 70 && count <= 79) return 30;
    // 80-89 số: 20 điểm (8X)
    if (count >= 80 && count <= 89) return 20;
    // 90-99 số: 10 điểm (9X)
    if (count >= 90 && count <= 99) return 10;
    
    // Nếu nhiều hơn 99 số, trả về 10 điểm (giữ nguyên logic)
    return 10;
}

/**
 * Tính điểm dựa trên label hoặc count
 * Ưu tiên sử dụng điểm từ LABEL_POINTS nếu có (cho các tiêu đề đặc biệt)
 * Nếu không có, tính điểm dựa trên count (cho các tiêu đề 0X-9X, 8S-95S)
 * @param {string} label - Label của tiêu đề
 * @param {number} count - Số lượng cặp số
 * @returns {number} Điểm số tương ứng
 */
function getPointsByLabelOrCount(label, count) {
    if (!label) return getPointsByCount(count);
    
    const upperLabel = label.toUpperCase();
    // Nếu có điểm cố định trong LABEL_POINTS (tiêu đề đặc biệt), sử dụng điểm đó
    if (LABEL_POINTS[upperLabel]) {
        return LABEL_POINTS[upperLabel];
    }
    
    // Tất cả các tiêu đề khác (0X-9X, 8S-95S, và các tiêu đề động như 66S, 54S, etc.)
    // đều tính điểm dựa trên số lượng cặp số (count)
    return getPointsByCount(count);
}

function getLabelPriority(label) {
    if (!label) return LABEL_ORDER.length;
    const upperLabel = label.toUpperCase();
    // Kiểm tra trong LABEL_PRIORITY trước
    if (LABEL_PRIORITY[upperLabel] !== undefined) {
        return LABEL_PRIORITY[upperLabel];
    }
    const normalized = upperLabel.replace(/[^A-Z0-9]/g, '');
    if (normalized.startsWith('CHAM')) {
        return LABEL_PRIORITY['0X'];
    }
    // Nếu không có trong LABEL_PRIORITY, trả về priority thấp nhất (sau 9X)
    return LABEL_ORDER.length;
}

function formatDateKey(input) {
    if (!input) return null;
    const date = input instanceof Date ? input : new Date(input);
    if (Number.isNaN(date.getTime())) return null;
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function getSpecialLastTwo(doc) {
    if (!doc) return null;
    const candidate = Array.isArray(doc.specialPrize)
        ? doc.specialPrize[0]
        : doc.specialPrize;
    return normalizeTwoDigit(candidate);
}

/**
 * Parse thời gian từ string (hỗ trợ HH:MM, HHhMM, hoặc chỉ HH)
 * - "18:36" hoặc "18h36" → { hour: 18, minute: 36 }
 * - "18" → { hour: 18, minute: 0 }
 */
function parseTimeFromString(timeStr = '') {
    const trimmed = timeStr.trim();
    
    // Thử parse format HH:MM hoặc HHhMM
    let match = /^(\d{1,2})[:h](\d{2})$/.exec(trimmed);
    if (match) {
        const hour = Number(match[1]);
        const minute = Number(match[2]);
        if (!Number.isNaN(hour) && !Number.isNaN(minute)) {
            if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
                return { hour, minute };
            }
        }
    }
    
    // Thử parse format chỉ có giờ (HH)
    match = /^(\d{1,2})$/.exec(trimmed);
    if (match) {
        const hour = Number(match[1]);
        if (!Number.isNaN(hour)) {
            if (hour >= 0 && hour <= 23) {
                return { hour, minute: 0 }; // Mặc định phút = 0
            }
        }
    }
    
    return null;
}

/**
 * Lấy thời gian đóng đăng ký từ biến môi trường
 * Sử dụng TELEGRAM_AUTO_SCHEDULE_TIME_SINGUP để xác định thời gian đóng đăng ký
 * Mặc định: 18:00
 */
function getSignupCutoffTime() {
    const signupTimeStr = process.env.TELEGRAM_AUTO_SCHEDULE_TIME_SINGUP || '18:00';
    const parsed = parseTimeFromString(signupTimeStr);
    return parsed || { hour: 18, minute: 0 }; // Fallback về 18:00
}

/**
 * Xác định ngày dự đoán dựa trên giờ hiện tại
 * Logic:
 * - Trước thời gian đóng (từ TELEGRAM_AUTO_SCHEDULE_TIME_SINGUP): đăng ký dự đoán cho hôm nay
 * - Từ thời gian đóng đến thời gian đóng + 35 phút: không cho đăng ký
 * - Sau thời gian đóng + 35 phút: đăng ký dự đoán cho ngày mai
 * 
 * Sử dụng biến môi trường:
 * - TELEGRAM_AUTO_SCHEDULE_TIME_SINGUP: thời gian đóng đăng ký (mặc định: 18:00)
 * 
 * Ví dụ với TELEGRAM_AUTO_SCHEDULE_TIME_SINGUP=18:00:
 * - Trước 18:00: đăng ký cho hôm nay
 * - Từ 18:00-18:35: không cho đăng ký
 * - Sau 18:35: đăng ký cho ngày mai
 * 
 * Ví dụ với TELEGRAM_AUTO_SCHEDULE_TIME_SINGUP=18:30:
 * - Trước 18:30: đăng ký cho hôm nay
 * - Từ 18:30-19:05: không cho đăng ký
 * - Sau 19:05: đăng ký cho ngày mai
 * 
 * @param {Date} now - Thời gian hiện tại (mặc định là new Date())
 * @returns {Object|null} { date: Date, normalizedDate: string } hoặc null nếu không được phép đăng ký
 */
function determinePredictionDate(now = new Date()) {
    const signupTime = getSignupCutoffTime();
    const hour = now.getHours();
    const minute = now.getMinutes();
    const currentTime = hour * 60 + minute; // Tổng số phút trong ngày
    
    // Thời gian đóng đăng ký (từ biến môi trường, ví dụ: 18:00 = 1080 phút)
    const cutoffTimeMinutes = signupTime.hour * 60 + signupTime.minute;
    // Thời gian mở lại đăng ký cho ngày mai = thời gian đóng + 35 phút (ví dụ: 18:35 = 1115 phút)
    const reopenTimeMinutes = cutoffTimeMinutes + 35;

    let targetDate = new Date(now);
    
    if (currentTime < cutoffTimeMinutes) {
        // Trước thời gian đóng - đăng ký cho hôm nay
        targetDate.setHours(0, 0, 0, 0);
    } else if (currentTime >= reopenTimeMinutes) {
        // Sau thời gian đóng + 35 phút - đăng ký cho ngày mai
        targetDate.setDate(targetDate.getDate() + 1);
        targetDate.setHours(0, 0, 0, 0);
    } else {
        // Từ thời gian đóng đến thời gian đóng + 35 phút - không cho đăng ký
        return null;
    }

    const normalizedDate = formatDateKey(targetDate);
    return { date: targetDate, normalizedDate };
}

/**
 * Kiểm tra xem user có thể đăng ký/thay đổi dự đoán không
 * @param {string} chatId 
 * @param {string} userId 
 * @param {string} normalizedDate 
 * @returns {Promise<{allowed: boolean, reason?: string, currentCount?: number}>}
 */
async function checkPredictionAllowed(chatId, userId, normalizedDate) {
    // Đảm bảo chatId và userId luôn là string
    const chatIdString = String(chatId);
    const userIdString = String(userId);
    
    const existing = await Prediction.findOne({ chatId: chatIdString, userId: userIdString, normalizedDate }).lean();
    
    if (!existing) {
        // Chưa có dự đoán, cho phép tạo mới
        return { allowed: true, currentCount: 0 };
    }

    const updateCount = existing.updateCount || 0;
    if (updateCount >= 2) {
        return {
            allowed: false,
            reason: `VƯỢT QUÁ GIỚI HẠN: Bạn đã thay đổi dự đoán ${updateCount} lần cho ngày này. Mỗi người chỉ được thay đổi tối đa 2 lần/ngày.`,
            currentCount: updateCount
        };
    }

    return { allowed: true, currentCount: updateCount };
}

async function savePrediction({ chatId, userId, username, displayName, drawDate, numbers, groups = [], skipTimeCheck = false, skipUpdateCountCheck = false }) {
    // Đảm bảo chatId và userId luôn là string để consistency với database
    const chatIdString = String(chatId);
    const userIdString = String(userId);
    
    const normalizedDate = formatDateKey(drawDate);
    if (!normalizedDate) {
        throw new Error('Không xác định được ngày quay để lưu dự đoán.');
    }

    const safeNumbers = uniqueNumbers(numbers);
    if (!safeNumbers.length) {
        throw new Error('Vui lòng cung cấp ít nhất một con số hợp lệ.');
    }

    const safeDisplayName = displayName || username || (userId ? `user_${userId}` : 'Ẩn danh');

    const safeGroups = Array.isArray(groups)
        ? groups
            .map((group) => {
                if (!group) {
                    return null;
                }
                const groupNumbers = uniqueNumbers(group.numbers || []);
                if (!groupNumbers.length) {
                    return null;
                }
                const groupType = group.groupType === 'cham' ? 'cham' : 'default';
                const chamDigits = groupType === 'cham'
                    ? sanitizeChamDigits(group.chamDigits || [])
                    : [];

                return {
                    label: group.label || null,
                    rawLabel: group.rawLabel || group.label || null,
                    count: Number.isFinite(Number(group.count)) ? Number(group.count) : groupNumbers.length,
                    numbers: groupNumbers,
                    groupType,
                    chamDigits
                };
            })
            .filter(Boolean)
        : [];

    // Kiểm tra số lần thay đổi (nếu không skip)
    if (!skipUpdateCountCheck) {
        const checkResult = await checkPredictionAllowed(chatIdString, userIdString, normalizedDate);
        if (!checkResult.allowed) {
            throw new Error(checkResult.reason);
        }
    }

    // Tìm dự đoán hiện tại để lấy updateCount
    const existing = await Prediction.findOne({ chatId: chatIdString, userId: userIdString, normalizedDate }).lean();
    const currentUpdateCount = existing?.updateCount || 0;
    const isNewPrediction = !existing;

    // Tăng updateCount nếu đã có dự đoán trước đó (không phải lần đầu tạo)
    const newUpdateCount = isNewPrediction ? 0 : currentUpdateCount + 1;

    const updateData = {
        chatId: chatIdString,
        userId: userIdString,
        username,
        displayName: safeDisplayName,
        drawDate,
        normalizedDate,
        numbers: safeNumbers,
        groups: safeGroups,
        matchedNumbers: [],
        status: 'pending',
        resultNotified: false,
        updateCount: newUpdateCount
    };

    console.log(`[savePrediction] Đang lưu dự đoán: chatId=${chatIdString} (original: ${chatId}, type: ${typeof chatId}), userId=${userIdString}, normalizedDate=${normalizedDate}, isNew=${isNewPrediction}, updateCount=${newUpdateCount}`);

    try {
        const result = await Prediction.findOneAndUpdate(
            { chatId: chatIdString, userId: userIdString, normalizedDate },
            updateData,
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );

        if (!result) {
            console.error(`[savePrediction] ❌ Lỗi: findOneAndUpdate trả về null cho chatId=${chatIdString}, userId=${userIdString}, normalizedDate=${normalizedDate}`);
            throw new Error('Không thể lưu dự đoán vào database: findOneAndUpdate trả về null');
        }

        console.log(`[savePrediction] ✅ Đã lưu thành công: _id=${result._id}, chatId=${chatIdString}, userId=${userIdString}, normalizedDate=${normalizedDate}`);
        return result;
    } catch (error) {
        console.error(`[savePrediction] ❌ Lỗi database khi lưu dự đoán:`, error);
        throw error;
    }
}

async function listPredictions({ chatId, normalizedDate, allowedChatIds = null }) {
    try {
        // Đảm bảo chatId luôn là string để match với dữ liệu đã lưu
        const chatIdString = String(chatId);
        
        console.log(`[listPredictions] Query: chatId=${chatIdString} (original type: ${typeof chatId}), normalizedDate=${normalizedDate}`);
        
        // Kiểm tra input
        if (!chatIdString || !normalizedDate) {
            console.error(`[listPredictions] ❌ Lỗi: chatId hoặc normalizedDate không hợp lệ. chatId=${chatIdString}, normalizedDate=${normalizedDate}`);
            return [];
        }
        
        // Query với chatId đã normalize
        const query = { chatId: chatIdString, normalizedDate };
        let predictions = await Prediction.find(query)
            .sort({ createdAt: 1 })
            .lean();
        
        console.log(`[listPredictions] Tìm thấy ${predictions.length} dự đoán cho chatId=${chatIdString}, normalizedDate=${normalizedDate}`);
        
        // Nếu tìm thấy dữ liệu từ group hiện tại, trả về ngay
        if (predictions.length > 0) {
            console.log(`[listPredictions] ✅ Trả về ${predictions.length} dự đoán từ group hiện tại: ${chatIdString}`);
            return predictions;
        }
        
        // Nếu không tìm thấy, thử query với format khác (backward compatibility)
        // Thử query với chatId dạng number (nếu chatId là string số)
        const chatIdNumber = Number(chatId);
        if (!isNaN(chatIdNumber) && String(chatIdNumber) !== chatIdString) {
            console.log(`[listPredictions] Thử query với chatId dạng number: ${chatIdNumber}`);
            const altQuery = { chatId: String(chatIdNumber), normalizedDate };
            const altPredictions = await Prediction.find(altQuery)
                .sort({ createdAt: 1 })
                .lean();
            if (altPredictions.length > 0) {
                console.log(`[listPredictions] ✅ Tìm thấy ${altPredictions.length} dự đoán với format thay thế`);
                return altPredictions;
            }
        }
        
        // Nếu vẫn không tìm thấy, chỉ trả về mảng rỗng
        // KHÔNG query từ các group khác để tránh hiển thị dữ liệu từ group khác
        console.log(`[listPredictions] ⚠️ Không tìm thấy dự đoán nào cho chatId=${chatIdString}, normalizedDate=${normalizedDate}`);
        
        // Debug: Kiểm tra xem có dữ liệu nào trong database không (chỉ để log, không trả về)
        try {
            const allCount = await Prediction.countDocuments({ normalizedDate });
            if (allCount > 0) {
                const allPredictions = await Prediction.find({ normalizedDate }).select('chatId userId displayName').lean();
                const uniqueChatIds = [...new Set(allPredictions.map(p => p.chatId))];
                console.log(`[listPredictions] DEBUG: Tổng số dự đoán trong database cho ngày ${normalizedDate}: ${allCount}`);
                console.log(`[listPredictions] DEBUG: Tất cả chatId có dữ liệu cho ngày ${normalizedDate}:`, uniqueChatIds);
                console.log(`[listPredictions] DEBUG: Query chatId: "${chatIdString}" (type: ${typeof chatIdString})`);
                
                if (!uniqueChatIds.includes(chatIdString)) {
                    console.log(`[listPredictions] ⚠️ CẢNH BÁO: Group hiện tại (${chatIdString}) không có dữ liệu, nhưng có dữ liệu từ các group khác: ${uniqueChatIds.join(', ')}`);
                    console.log(`[listPredictions] ⚠️ Chỉ trả về dữ liệu từ group hiện tại, không trả về dữ liệu từ group khác.`);
                }
            }
        } catch (debugError) {
            console.error(`[listPredictions] ❌ Lỗi khi debug:`, debugError);
            // Không throw, chỉ log lỗi
        }
        
        // Trả về mảng rỗng vì không tìm thấy dữ liệu từ group hiện tại
        return [];
    } catch (error) {
        console.error(`[listPredictions] ❌ Lỗi khi query dự đoán:`, error);
        console.error(`[listPredictions] ❌ Stack trace:`, error.stack);
        // Trả về mảng rỗng thay vì throw error để không làm crash server
        return [];
    }
}

async function listResults({ chatId, normalizedDate }) {
    // Đảm bảo chatId luôn là string để match với dữ liệu đã lưu
    const chatIdString = String(chatId);
    return Prediction.find({ chatId: chatIdString, normalizedDate })
        .sort({ createdAt: 1 })
        .lean();
}

async function evaluatePredictions({ chatId, doc }) {
    // Đảm bảo chatId luôn là string
    const chatIdString = String(chatId);
    
    const normalizedDate = formatDateKey(doc?.drawDate);
    if (!normalizedDate) {
        return null;
    }

    const specialTarget = getSpecialLastTwo(doc);
    if (!specialTarget) {
        return null;
    }

    const predictions = await Prediction.find({ chatId: chatIdString, normalizedDate }).lean();
    if (!predictions.length) {
        return null;
    }

    const specialDigits = specialTarget ? specialTarget.split('') : [];

    const updates = [];
    const scoreChanges = [];
    const enriched = await Promise.all(
        predictions.map(async (prediction) => {
            // Kiểm tra xem prediction đã được chấm điểm chưa
            // Nếu status !== 'pending' thì đã được chấm rồi, không chấm lại
            if (prediction.status && prediction.status !== 'pending') {
                // Đã được chấm rồi, trả về kết quả hiện tại
                return {
                    ...prediction,
                    matchedNumbers: Array.isArray(prediction.matchedNumbers) ? prediction.matchedNumbers : [],
                    status: prediction.status,
                    matchedLabel: prediction.matchedLabel || null,
                    scoreDelta: prediction.scoreDelta || 0,
                    matchedChamLabels: Array.isArray(prediction.matchedChamLabels) ? prediction.matchedChamLabels : []
                };
            }

            const groups = Array.isArray(prediction.groups) ? prediction.groups : [];
            const orderedGroups = [...groups].sort((a, b) => getLabelPriority(a.label) - getLabelPriority(b.label));

            let matchedNumbers = [];
            let status = 'miss';
            let matchedLabel = null;
            let totalScoreDelta = 0;
            let baseHitAwarded = false;
            const matchedChamLabels = [];

            for (const group of orderedGroups) {
                const numbers = Array.isArray(group.numbers) ? group.numbers : [];
                const isChamGroup = group.groupType === 'cham';
                if (numbers.includes(specialTarget)) {
                    matchedNumbers = [specialTarget];
                    if (!matchedLabel) {
                        status = 'hit';
                        matchedLabel = group.label || group.rawLabel || null;

                    }
                    if (isChamGroup) {
                        const chamDigits = Array.isArray(group.chamDigits) && group.chamDigits.length
                            ? group.chamDigits
                            : [];
                        const matchedDigits = chamDigits.filter(digit => specialDigits.includes(digit));
                        if (matchedDigits.length) {
                            matchedDigits.forEach(digit => matchedChamLabels.push(`chạm ${digit}`));
                            const chamPoints = getChamPointsByDigitCount(matchedDigits.length);
                            const chamLabel = matchedDigits.length === 1
                                ? `chạm ${matchedDigits[0]}`
                                : `chạm ${matchedDigits.join(',')}`;
                            if (chamPoints > 0) {
                                totalScoreDelta += chamPoints;
                                await applyScoreChange({
                                    chatId,
                                    userId: prediction.userId,
                                    username: prediction.username,
                                    displayName: prediction.displayName,
                                    delta: chamPoints,
                                    reason: `Trúng ${chamLabel}`,
                                    label: chamLabel,
                                    normalizedDate
                                });
                                scoreChanges.push({
                                    userId: prediction.userId,
                                    username: prediction.username,
                                    displayName: prediction.displayName,
                                    delta: chamPoints,
                                    label: chamLabel,
                                    type: 'hit'
                                });
                            }
                        }
                    } else if (!baseHitAwarded) {
                        const count = group.count || numbers.length;
                        const basePoints = getPointsByLabelOrCount(group.label, count);
                        const baseLabel = group.label || group.rawLabel || null;
                        if (basePoints > 0) {
                            totalScoreDelta += basePoints;
                            await applyScoreChange({
                                chatId,
                                userId: prediction.userId,
                                username: prediction.username,
                                displayName: prediction.displayName,
                                delta: basePoints,
                                reason: `Trúng ${baseLabel || 'n/a'}`,
                                label: baseLabel,
                                normalizedDate
                            });
                            scoreChanges.push({
                                userId: prediction.userId,
                                username: prediction.username,
                                displayName: prediction.displayName,
                                delta: basePoints,
                                label: baseLabel,
                                type: 'hit'
                            });
                        }
                        baseHitAwarded = true;
                    }
                }
            }

            if (status === 'miss') {
                const fallbackGroup = orderedGroups.length ? orderedGroups[orderedGroups.length - 1] : null;
                const fallbackLabel = fallbackGroup?.label || null;
                if (fallbackLabel) {
                    const fallbackCount = fallbackGroup?.count || (Array.isArray(fallbackGroup?.numbers) ? fallbackGroup.numbers.length : 0);
                    const penalty = getPointsByLabelOrCount(fallbackLabel, fallbackCount);
                    if (penalty > 0) {
                        const penaltyDelta = -penalty;
                        totalScoreDelta += penaltyDelta;
                        await applyScoreChange({
                            chatId,
                            userId: prediction.userId,
                            username: prediction.username,
                            displayName: prediction.displayName,
                            delta: penaltyDelta,
                            reason: `Trượt ${fallbackLabel}`,
                            label: fallbackLabel,
                            normalizedDate
                        });
                        scoreChanges.push({
                            userId: prediction.userId,
                            username: prediction.username,
                            displayName: prediction.displayName,
                            delta: penaltyDelta,
                            label: fallbackLabel,
                            type: 'miss'
                        });
                    }
                }
            }

            updates.push(
                Prediction.updateOne(
                    { _id: prediction._id },
                    {
                        $set: {
                            matchedNumbers,
                            status,
                            matchedLabel,
                            scoreDelta: totalScoreDelta,
                            matchedChamLabels
                        }
                    }
                )
            );

            return { ...prediction, matchedNumbers, status, matchedLabel, scoreDelta: totalScoreDelta, matchedChamLabels };
        })
    );

    await Promise.all(updates);

    return {
        normalizedDate,
        total: enriched.length,
        hits: enriched.filter(item => item.matchedNumbers.length > 0),
        predictions: enriched,
        scoreChanges,
        specialTarget
    };
}

async function hasNotifiedResults(chatId, normalizedDate) {
    const chatIdString = String(chatId);
    return Prediction.exists({ chatId: chatIdString, normalizedDate, resultNotified: true });
}

async function markResultsNotified(chatId, normalizedDate) {
    const chatIdString = String(chatId);
    await Prediction.updateMany(
        { chatId: chatIdString, normalizedDate },
        { $set: { resultNotified: true } }
    );
}

module.exports = {
    savePrediction,
    listPredictions,
    listResults,
    evaluatePredictions,
    hasNotifiedResults,
    markResultsNotified,
    formatDateKey,
    uniqueNumbers,
    normalizeTwoDigit,
    determinePredictionDate,
    checkPredictionAllowed,
    getSpecialLastTwo,
    getLabelPriority,
    getLabelPoints,
    getPointsByCount,
    getPointsByLabelOrCount
};

