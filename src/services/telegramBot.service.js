const { Telegraf, Markup } = require('telegraf');
const cron = require('node-cron');
const XSMB = require('../models/xsmb.model');
const LoGanStats = require('../models/stats/loganStats.model');
const TanSuatLotoStats = require('../models/stats/tanSuatLotoStats.model');
const GiaiDacBietStats = require('../models/stats/giaiDacBietStats.model');
const xsmbImageGenerator = require('./xsmbImageGenerator.service');
const thongKeStatsImageGenerator = require('./thongKeStatsImageGenerator.service');
const thongKeDacBietImageGenerator = require('./thongKeDacBietImageGenerator.service');
const thongKeBoImageGenerator = require('./thongKeBoImageGenerator.service');
const thongKeDauDuoiImageGenerator = require('./thongKeDauDuoiImageGenerator.service');
const { formatResult, formatResultSimple } = require('./telegram/formatter');
const { normalizeDateInput } = require('./telegram/date.utils');
const createPredictionHandlers = require('./telegram/prediction.handlers');
const TelegramCommandMessage = require('../models/telegramCommandMessage.model');
const {
    recordInteraction,
    findInactiveMembers,
    findDailyInactiveMembers,
    markMembersReminded,
    getActivitiesForUsers,
    findInactiveInMinutes
} = require('./groupMemberActivity.service');
const {
    upsertMembers,
    markMemberStatus,
    listActiveMembers
} = require('./telegramGroupMember.service');
const telegramLotterySocketClient = require('./telegramLotterySocketClient');

let predictionHandlersInstance = null;

function parseChatList(raw) {
    if (!raw) return [];
    return raw
        .split(',')
        .map(id => id.trim())
        .filter(id => id.length > 0);
}

function parseAllowedChats() {
    return parseChatList(process.env.TELEGRAM_ALLOWED_CHAT_IDS);
}

const allowedChats = parseAllowedChats();
const controlChats = parseChatList(process.env.TELEGRAM_CONTROL_CHAT_IDS || '8317947476');
const DEFAULT_SCHEDULE_TIMEZONE = process.env.TELEGRAM_TIMEZONE || 'Asia/Ho_Chi_Minh';
const DEFAULT_AUTO_SCHEDULE_TIME = process.env.TELEGRAM_AUTO_SCHEDULE_TIME || '18:36';
// Danh sách các khung giờ để tự động render XSMB (kiểm tra lần lượt, render 1 lần duy nhất)
// Format: "18:31,18:32,18:33" hoặc "18:33" (chỉ 1 giờ)
const DEFAULT_AUTO_SCHEDULE_TIMES = process.env.TELEGRAM_AUTO_SCHEDULE_TIMES || '18:31,18:32,18:33';
const DEFAULT_AUTO_SCHEDULE_TIME_NOTIFICATION_RESULT = process.env.TELEGRAM_AUTO_SCHEDULE_TIME_NOTIFICATION_RESULT || '18:37';
const DEFAULT_AUTO_SCHEDULE_TIME_SINGUP_FORECAST = process.env.TELEGRAM_AUTO_SCHEDULE_TIME_SINGUP_FORECAST || '18:01';
const DEFAULT_AUTO_SCHEDULE_TIME_STATISTICAL_RESULT = process.env.TELEGRAM_AUTO_SCHEDULE_TIME_STATISTICAL_RESULT || '18:35';
const DEFAULT_AUTO_SCHEDULE_TIME_SINGUP = process.env.TELEGRAM_AUTO_SCHEDULE_TIME_SINGUP || '18:00';
const DEFAULT_AUTO_SCHEDULE_TIME_CHUNGMUNG = process.env.TELEGRAM_AUTO_SCHEDULE_TIME_CHUNGMUNG || '16:00,17:30';
const DEFAULT_INACTIVE_REMINDER_TIME = process.env.TELEGRAM_INACTIVE_REMINDER_TIME || '09:00';
const INACTIVE_THRESHOLD_HOURS = Number(process.env.TELEGRAM_INACTIVE_THRESHOLD_HOURS) || 48;
const INACTIVE_REMINDER_COOLDOWN_HOURS = Number(process.env.TELEGRAM_INACTIVE_REMINDER_COOLDOWN_HOURS) || 24;
const INACTIVE_REMINDER_BATCH_LIMIT = Number(process.env.TELEGRAM_INACTIVE_REMINDER_BATCH_LIMIT) || 20;
const autoScheduleChatsEnv = parseChatList(process.env.TELEGRAM_AUTO_SCHEDULE_CHAT_IDS);
const autoScheduleChats = autoScheduleChatsEnv.length ? autoScheduleChatsEnv : allowedChats;
const SUPPORTED_SCHEDULE_TYPES = ['xsmb', 'prediction_result', 'prediction_list', 'prediction_signup_close', 'prediction_stats', 'inactive_reminder', 'chuc_mung'];
const scheduledJobs = new Map();

// Map để lưu message_ids theo từng loại lệnh và chatId
// Key: `${chatId}:${commandType}`, Value: Array of message_ids
const commandMessageIds = new Map();

// Map để lưu chat_id migration (old chat_id -> new supergroup chat_id)
// Key: oldChatId, Value: newChatId
// Global để dùng chung cho tất cả các hàm
const globalChatIdMigration = new Map();

/**
 * Helper function để xử lý migrate chat_id
 * @param {string|number} chatId - Chat ID cũ
 * @returns {string} - Chat ID mới (nếu đã migrate) hoặc chat ID cũ
 */
function getMigratedChatId(chatId) {
    const chatIdStr = String(chatId);
    if (globalChatIdMigration.has(chatIdStr)) {
        return globalChatIdMigration.get(chatIdStr);
    }
    return chatIdStr;
}

/**
 * Helper function để xử lý lỗi migrate và cập nhật mapping
 * @param {Error} error - Telegram error
 * @param {string|number} oldChatId - Chat ID cũ
 * @returns {string|null} - Chat ID mới nếu có migration, null nếu không
 */
function handleChatMigration(error, oldChatId) {
    if (error.response && 
        error.response.error_code === 400 && 
        error.response.description && 
        error.response.description.includes('upgraded to a supergroup chat') &&
        error.response.parameters && 
        error.response.parameters.migrate_to_chat_id) {
        
        const newChatId = String(error.response.parameters.migrate_to_chat_id);
        const oldChatIdStr = String(oldChatId);
        
        console.log(`[TelegramBot] 🔄 Chat ${oldChatIdStr} đã được upgrade lên supergroup: ${newChatId}`);
        
        // Lưu migration mapping
        globalChatIdMigration.set(oldChatIdStr, newChatId);
        
        // Cập nhật autoScheduleChats nếu có
        const chatIndex = autoScheduleChats.indexOf(oldChatIdStr);
        if (chatIndex >= 0) {
            autoScheduleChats[chatIndex] = newChatId;
            console.log(`[TelegramBot] ✅ Đã cập nhật chat_id trong autoScheduleChats: ${oldChatIdStr} -> ${newChatId}`);
        }
        
        return newChatId;
    }
    return null;
}

// Set để track các ngày đã render XSMB (tránh render trùng lặp)
// Key: `${chatId}:${normalizedDate}`
const xsmbRenderedDates = new Set();

/**
 * Helper function để log errors với context đầy đủ
 * @param {string} context - Context của lỗi (ví dụ: 'sendQuickThongKe', 'handleCommand')
 * @param {Error} error - Error object
 * @param {object} additionalInfo - Thông tin bổ sung (chatId, userId, etc.)
 */
function logError(context, error, additionalInfo = {}) {
    console.error(`[TelegramBot] Lỗi trong ${context}:`, error?.message || error);
    if (error?.stack) {
        console.error(`[TelegramBot] Stack trace:`, error.stack);
    }
    if (Object.keys(additionalInfo).length > 0) {
        console.error(`[TelegramBot] Thông tin thêm:`, additionalInfo);
    }
}

// Alias cho logTelegramError để tương thích
const logTelegramError = logError;

/**
 * Kiểm tra xem tin nhắn có phải là lệnh không (để tránh xóa nhầm tin nhắn thường)
 * @param {string} text - Nội dung tin nhắn
 * @returns {boolean} - true nếu là lệnh, false nếu không phải
 */
function isCommandMessage(text) {
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
        /^soicau(\s|$)/i,
        /^goiy(\s|$)/i,
        /^xsmb(\s|$)/i,
        /^wukong$/i,
        /^(tk|thongke)(\s|$)/i,
        /^schedule(\s|$)/i,
        /^(broadcast|announce)(\s|$)/i,
        /^inactive_/i,
        /^member_count$/i
    ];

    // Lấy dòng đầu tiên để kiểm tra (bỏ qua mention nếu có)
    const firstLine = trimmed.split('\n')[0].replace(/@\w+/g, '').trim();

    return commandKeywords.some(pattern => pattern.test(firstLine));
}

/**
 * Xóa tin nhắn của người dùng nếu đó là lệnh (chỉ xóa khi bot có quyền admin)
 * @param {object} ctx - Telegram context
 * @returns {Promise<boolean>} - true nếu đã xóa thành công, false nếu không
 */
async function deleteUserCommandMessage(ctx) {
    // Chỉ xóa trong group/supergroup, không xóa trong private chat
    if (!ctx.chat || ctx.chat.type === 'private') {
        return false;
    }

    // Chỉ xóa nếu tin nhắn là lệnh
    const messageText = ctx.message?.text || '';
    if (!isCommandMessage(messageText)) {
        return false;
    }

    // Chỉ xóa nếu có message_id
    const messageId = ctx.message?.message_id;
    if (!messageId) {
        return false;
    }

    try {
        await ctx.telegram.deleteMessage(ctx.chat.id, messageId);
        console.log(`[TelegramBot] Đã xóa tin nhắn lệnh của người dùng. Chat ID: ${ctx.chat.id}, Message ID: ${messageId}`);
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
            console.log(`[TelegramBot] Không thể xóa tin nhắn của người dùng (có thể bot chưa có quyền admin hoặc tin nhắn quá cũ): ${errorMessage}`);
        } else {
            console.log(`[TelegramBot] Lỗi khi xóa tin nhắn của người dùng: ${errorMessage}`);
        }
        return false;
    }
}

/**
 * Extract và đếm số lượng cặp số 2 chữ số trong text
 * @param {string} text - Nội dung tin nhắn
 * @returns {number} - Số lượng cặp số 2 chữ số tìm thấy (đếm tất cả, không chỉ unique)
 */
function countTwoDigitNumbers(text) {
    if (!text || typeof text !== 'string') {
        return 0;
    }

    // Tìm tất cả các số 2 chữ số (00-99) trong text
    // Hỗ trợ các format: "01,02,03", "01 02 03", "01, 02, 03", "01,02 03", etc.
    // Sử dụng \b để đảm bảo chỉ match số 2 chữ số độc lập (không phải phần của số lớn hơn)
    const twoDigitPattern = /\b\d{2}\b/g;
    const matches = text.match(twoDigitPattern);

    if (!matches) {
        return 0;
    }

    // Đếm tất cả các số 2 chữ số (bao gồm cả số trùng lặp)
    return matches.length;
}

/**
 * Kiểm tra user có phải admin không
 * @param {string|number} userId - User ID cần kiểm tra
 * @returns {boolean} - true nếu là admin, false nếu không
 */
function isAdmin(userId) {
    if (!userId) return false;
    const adminIds = process.env.TELEGRAM_ADMIN_ID;
    if (!adminIds) return false;
    
    // Parse danh sách admin IDs (có thể là "8551427685, 6570193875" hoặc "8551427685,6570193875")
    const adminIdList = adminIds
        .split(',')
        .map(id => id.trim())
        .filter(Boolean);
    
    return adminIdList.includes(String(userId));
}

/**
 * Kiểm tra và xóa tin nhắn chứa nhiều cặp số 2 chữ số (từ 15 cặp trở lên)
 * @param {object} ctx - Telegram context
 * @returns {Promise<boolean>} - true nếu đã xóa tin nhắn, false nếu không
 */
async function checkAndDeleteNumberSpamMessage(ctx) {
    // Chỉ xử lý trong group/supergroup, không xử lý trong private chat
    if (!ctx.chat || ctx.chat.type === 'private') {
        return false;
    }

    // Chỉ xử lý tin nhắn text
    const messageText = ctx.message?.text || '';
    if (!messageText) {
        return false;
    }

    // Bỏ qua nếu là lệnh (đã có xử lý riêng)
    if (isCommandMessage(messageText)) {
        return false;
    }

    // Đếm số lượng cặp số 2 chữ số
    const numberCount = countTwoDigitNumbers(messageText);
    
    // Đếm số unique để kiểm tra cho admin (cho phép một số số trùng lặp)
    const uniqueNumbers = new Set();
    const twoDigitPattern = /\b\d{2}\b/g;
    let match;
    while ((match = twoDigitPattern.exec(messageText)) !== null) {
        uniqueNumbers.add(match[0]);
    }
    const uniqueCount = uniqueNumbers.size;

    // Bỏ qua nếu là admin và số lượng unique <= 20 (cho phép admin gửi tin nhắn số như tin nhắn thông thường)
    // Cho phép một số số trùng lặp nhưng tổng số unique không quá 20
    const userId = ctx.from?.id;
    if (userId && isAdmin(userId) && uniqueCount > 0 && uniqueCount <= 20) {
        return false;
    }

    // Nếu có từ 15 cặp số trở lên, xóa tin nhắn và thông báo
    if (numberCount >= 15) {
        const messageId = ctx.message?.message_id;
        if (!messageId) {
            return false;
        }

        try {
            // Xóa tin nhắn
            await ctx.telegram.deleteMessage(ctx.chat.id, messageId);
            console.log(`[TelegramBot] Đã xóa tin nhắn chứa ${numberCount} cặp số. Chat ID: ${ctx.chat.id}, Message ID: ${messageId}`);

            // Thông báo cho người dùng
            const userMention = ctx.from?.id
                ? `<a href="tg://user?id=${ctx.from.id}">${ctx.from.first_name || 'Bạn'}</a>`
                : 'Bạn';

            const warningMessage = await ctx.reply(
                `${userMention}, bạn phải đăng ký dự đoán bằng lệnh:\n\n` +
                `<code>soicau [số] [số] ...</code>\n\n` +
                `Ví dụ: <code>soicau 01 02 03 04 05</code>\n\n` +
                `Hoặc: <code>soicau 01,02,03,04,05</code>`,
                { parse_mode: 'HTML' }
            );

            // Lên lịch xóa tin nhắn sau 3 phút
            if (warningMessage && warningMessage.message_id) {
                scheduleMessageDeletion(ctx.chat.id, warningMessage.message_id, ctx.telegram, 180000);
            }

            return true;
        } catch (error) {
            const errorMessage = error.message || error.description || '';
            const errorCode = error.response?.error_code || error.code;

            // Các lỗi cho biết không thể xóa
            if (errorCode === 400 || errorCode === 403 || errorCode === 404 ||
                errorMessage.includes("can't be deleted") ||
                errorMessage.includes("message not found") ||
                errorMessage.includes("not found") ||
                errorMessage.includes("no rights")) {
                console.log(`[TelegramBot] Không thể xóa tin nhắn spam số (có thể bot chưa có quyền admin hoặc tin nhắn quá cũ): ${errorMessage}`);
            } else {
                console.log(`[TelegramBot] Lỗi khi xóa tin nhắn spam số: ${errorMessage}`);
            }
            return false;
        }
    }

    return false;
}

/**
 * Xóa các tin nhắn cũ của cùng một loại lệnh và lưu tin nhắn mới
 * @param {number} chatId - Chat ID
 * @param {string} commandType - Loại lệnh (ví dụ: 'member_count', 'inactive_today', 'soicau_thongke')
 * @param {number} newMessageId - Message ID của tin nhắn mới
 * @param {object} telegram - Telegram bot instance
 */
async function deleteOldCommandMessages(chatId, commandType, newMessageId, telegram) {
    const key = `${chatId}:${commandType}`;

    // Lấy message IDs từ database (ưu tiên) hoặc từ Map (cache)
    let oldMessageIds = commandMessageIds.get(key);
    if (!oldMessageIds || oldMessageIds.length === 0) {
        // Nếu không có trong Map, lấy từ database
        try {
            oldMessageIds = await TelegramCommandMessage.getMessageIds(String(chatId), commandType);
            // Cache vào Map để lần sau không cần query database
            if (oldMessageIds.length > 0) {
                commandMessageIds.set(key, oldMessageIds);
            }
        } catch (error) {
            console.error(`[TelegramBot] Lỗi khi lấy message IDs từ database:`, error);
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
                console.log(`[TelegramBot] Không thể xóa message ID ${oldMessageId} (quá cũ hoặc đã bị xóa): ${errorMessage}`);
            } else {
                // Lỗi khác (network error, timeout, etc.) - vẫn cố gắng xóa, nhưng không giữ lại message ID
                console.log(`[TelegramBot] Không thể xóa tin nhắn cũ ${oldMessageId} (lỗi tạm thời): ${errorMessage}`);
            }
        }
    }

    // CHỈ lưu message_id mới - không giữ lại bất kỳ message IDs cũ nào
    const newMessageIds = [newMessageId];
    commandMessageIds.set(key, newMessageIds);

    // Lưu vào database để persist qua server restart
    try {
        await TelegramCommandMessage.saveMessageIds(String(chatId), commandType, newMessageIds);
    } catch (error) {
        console.error(`[TelegramBot] Lỗi khi lưu message IDs vào database:`, error);
    }

    if (successfullyDeleted.length > 0) {
        console.log(`[TelegramBot] Đã xóa ${successfullyDeleted.length} tin nhắn cũ của lệnh ${commandType}`);
    }
    if (failedToDelete.length > 0) {
        console.log(`[TelegramBot] ${failedToDelete.length} tin nhắn cũ không thể xóa được (quá cũ > 48h) cho ${commandType}`);
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
            console.log(`[TelegramBot] Đã xóa tin nhắn sau ${delayMs / 1000 / 60} phút. Chat ID: ${chatId}, Message ID: ${messageId}`);
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
                console.log(`[TelegramBot] Không thể xóa tin nhắn sau ${delayMs / 1000 / 60} phút (có thể đã quá cũ > 48h hoặc đã bị xóa): ${errorMessage}`);
            } else {
                console.log(`[TelegramBot] Lỗi khi xóa tin nhắn sau ${delayMs / 1000 / 60} phút: ${errorMessage}`);
            }
        }
    }, delayMs);
}

/**
 * Helper function để reply và tự động xóa tin nhắn cũ
 * @param {object} ctx - Telegram context
 * @param {string} commandType - Loại lệnh
 * @param {string} text - Nội dung tin nhắn
 * @param {object} options - Options cho reply (parse_mode, reply_markup, etc.)
 * @returns {Promise} - Sent message
 */
async function replyAndCleanOld(ctx, commandType, text, options = {}) {
    const chatId = ctx.chat?.id;
    if (!chatId) {
        return ctx.reply(text, options);
    }

    // Xóa tin nhắn cũ và gửi tin nhắn mới
    const sentMessage = await ctx.reply(text, options);

    if (sentMessage && sentMessage.message_id) {
        await deleteOldCommandMessages(chatId, commandType, sentMessage.message_id, ctx.telegram);
    }

    return sentMessage;
}

/**
 * Helper function để reply lỗi và tự động xóa tin nhắn lệnh của người dùng (nếu là lệnh)
 * @param {object} ctx - Telegram context
 * @param {string} errorText - Nội dung thông báo lỗi
 * @param {object} options - Options cho reply (parse_mode, reply_markup, etc.)
 * @returns {Promise} - Sent message
 */
async function replyErrorAndDeleteUserMessage(ctx, errorText, options = {}) {
    // Xóa tin nhắn của người dùng nếu đó là lệnh
    await deleteUserCommandMessage(ctx);

    // Gửi thông báo lỗi
    return ctx.reply(errorText, options);
}

async function clearCommandMessages(chatId, commandType, telegram) {
    if (!chatId) return null;
    const key = `${chatId}:${commandType}`;
    const oldMessageIds = commandMessageIds.get(key) || [];
    const failedToDelete = [];

    for (const oldMessageId of oldMessageIds) {
        try {
            await telegram.deleteMessage(chatId, oldMessageId);
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
            } else {
                console.log(`[TelegramBot] Không thể xóa tin nhắn cũ ${oldMessageId}: ${errorMessage}`);
            }
        }
    }

    // Luôn reset array, kể cả khi có lỗi
    commandMessageIds.set(key, []);

    if (failedToDelete.length > 0) {
        console.log(`[TelegramBot] Đã loại bỏ ${failedToDelete.length} message ID(s) không thể xóa được khi clear ${commandType}`);
    }

    return key;
}

async function sendQuickThongKe(ctx, commandType = 'thongke') {
    const chatId = ctx.chat?.id;
    if (!chatId) {
        return ctx.reply('❌ Không xác định được chat.');
    }

    const key = await clearCommandMessages(chatId, commandType, ctx.telegram);
    let loadingMessage = null;
    const messageIds = [];

    const sendAndTrack = async (text, options = {}) => {
        const sent = await ctx.reply(text, options);
        if (sent && sent.message_id) {
            messageIds.push(sent.message_id);
        }
    };

    try {
        try {
            loadingMessage = await ctx.reply('⏳ Đang tải thống kê...');
        } catch (e) {
            console.warn('[TelegramBot] Không thể gửi loading message:', e.message);
        }

        // Parallelize các queries độc lập để tăng hiệu suất
        const [lotoResult, dacBietResult] = await Promise.all([
            formatThongKeLoto().catch(error => {
                logError('formatThongKeLoto', error, { chatId });
                return null;
            }),
            formatThongKeDacBiet().catch(error => {
                logError('formatThongKeDacBiet', error, { chatId });
                return null;
            })
        ]);

        if (lotoResult) {
            await sendAndTrack(lotoResult, { parse_mode: 'HTML' });
        } else {
            await sendAndTrack('❌ Không có dữ liệu thống kê loto.');
        }

        if (dacBietResult) {
            await sendAndTrack(dacBietResult, { parse_mode: 'HTML' });
        } else {
            await sendAndTrack('❌ Không có dữ liệu thống kê đặc biệt.');
        }

        if (key && messageIds.length > 0) {
            commandMessageIds.set(key, messageIds);
            // Lưu vào database để persist qua server restart
            try {
                await TelegramCommandMessage.saveMessageIds(String(chatId), commandType, messageIds);
            } catch (error) {
                console.error(`[TelegramBot] Lỗi khi lưu message IDs vào database:`, error);
            }
        }
    } catch (error) {
        logError('sendQuickThongKe', error, { chatId });
        try {
            await sendAndTrack('❌ Có lỗi xảy ra khi lấy thống kê, vui lòng thử lại sau.');
            if (key) {
                commandMessageIds.set(key, messageIds);
            }
        } catch (replyError) {
            logError('sendQuickThongKe - replyError', replyError, { chatId });
        }
    } finally {
        if (loadingMessage) {
            try {
                await ctx.telegram.deleteMessage(chatId, loadingMessage.message_id);
            } catch (e) {
                // Ignore nếu không xóa được
            }
        }
    }
}

function getScheduleKey(chatId, type, time = null) {
    if (time) {
        const hourStr = String(time.hour).padStart(2, '0');
        const minuteStr = String(time.minute).padStart(2, '0');
        return `${chatId}:${type}:${hourStr}:${minuteStr}`;
    }
    return `${chatId}:${type}`;
}

function parseTimeInput(timeStr = '') {
    const trimmed = timeStr.trim();
    // Hỗ trợ cả format HH:MM và HHhMM (ví dụ: 18:36 hoặc 18h36)
    const match = /^(\d{1,2})[:h](\d{2})$/.exec(trimmed);
    if (!match) return null;
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    if (Number.isNaN(hour) || Number.isNaN(minute)) return null;
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
    return { hour, minute };
}

function buildCronExpression({ hour, minute }) {
    return `0 ${minute} ${hour} * * *`;
}

/**
 * Parse tham số thời gian từ tên lệnh
 * Ví dụ: inactive_50min -> { value: 50, unit: 'min', milliseconds: 3000000 }
 *        inactive_5hour -> { value: 5, unit: 'hour', milliseconds: 18000000 }
 * @param {string} command - Tên lệnh (ví dụ: 'inactive_50min')
 * @returns {Object|null} - Object chứa value, unit, milliseconds hoặc null nếu không hợp lệ
 */
function parseTimeFromCommand(command) {
    if (!command || typeof command !== 'string') {
        return null;
    }

    // Pattern: inactive_<số><đơn vị>
    // Đơn vị hỗ trợ: min, minute, minutes, hour, hours, h
    const match = command.match(/^inactive_(\d+)(min|minute|minutes|hour|hours|h)$/i);
    if (!match) {
        return null;
    }

    const value = parseInt(match[1], 10);
    const unit = match[2].toLowerCase();

    if (isNaN(value) || value <= 0) {
        return null;
    }

    let milliseconds;
    let displayUnit;

    // Chuyển đổi sang milliseconds và đơn vị hiển thị
    if (unit === 'h' || unit === 'hour' || unit === 'hours') {
        milliseconds = value * 60 * 60 * 1000;
        displayUnit = value === 1 ? 'giờ' : 'giờ';
    } else if (unit === 'min' || unit === 'minute' || unit === 'minutes') {
        milliseconds = value * 60 * 1000;
        displayUnit = value === 1 ? 'phút' : 'phút';
    } else {
        return null;
    }

    return {
        value,
        unit: unit === 'h' ? 'hour' : (unit === 'min' ? 'minute' : unit),
        milliseconds,
        displayUnit,
        displayText: `${value} ${displayUnit}`
    };
}

function createCtxForChat(bot, chatId) {
    return {
        chat: { id: chatId },
        telegram: bot.telegram,
        reply: (text, options) => bot.telegram.sendMessage(chatId, text, options),
        replyWithPhoto: (photo, options) => bot.telegram.sendPhoto(chatId, photo, options)
    };
}

// Hàm gửi thông báo chúc mừng
async function sendChucMungMessage(ctx, chatId) {
    const chucMungMessage = [
        'CHÚC TOÀN THỂ ACE RỰC RỠ VỀ BỜ CẢ 🥳🔥💥',
        '✅ Tỷ lệ xs 3 miền = 99.5 - ✅ Đ.ề cược tận 90s - ✅ Có đề live 18h25',
        '👉Link đăng ký:https://tonngokhongwukong.vercel.app/'
    ].join('\n');

    const keyboard = Markup.inlineKeyboard([
        [
            Markup.button.url('Link đăng ký', 'https://tonngokhongwukong.vercel.app/'),
            Markup.button.url('Nạp rút uy tín', 'https://tonngokhongwukong.vercel.app/')
        ]
    ]);

    try {
        // Xóa thông báo chúc mừng cũ trước khi gửi thông báo mới
        const commandType = 'chuc_mung';
        const key = `${chatId}:${commandType}`;

        // Lấy message IDs cũ từ database hoặc Map
        let oldMessageIds = commandMessageIds.get(key);
        if (!oldMessageIds || oldMessageIds.length === 0) {
            try {
                oldMessageIds = await TelegramCommandMessage.getMessageIds(String(chatId), commandType);
                if (oldMessageIds.length > 0) {
                    commandMessageIds.set(key, oldMessageIds);
                }
            } catch (error) {
                console.error(`[TelegramBot] Lỗi khi lấy message IDs từ database:`, error);
                oldMessageIds = [];
            }
        }

        // Xóa các tin nhắn cũ
        if (oldMessageIds.length > 0) {
            console.log(`[TelegramBot] Xóa ${oldMessageIds.length} thông báo chúc mừng cũ`);
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
                        console.log(`[TelegramBot] Không thể xóa message ID ${oldMessageId} (quá cũ): ${errorMessage}`);
                    } else {
                        console.log(`[TelegramBot] Lỗi tạm thời khi xóa message ID ${oldMessageId}: ${errorMessage}`);
                    }
                }
            }
        }

        // Gửi thông báo chúc mừng mới
        const sentMessage = await ctx.reply(chucMungMessage, keyboard);

        // Lưu message ID mới vào database và Map
        if (sentMessage && sentMessage.message_id) {
            const newMessageIds = [sentMessage.message_id];
            commandMessageIds.set(key, newMessageIds);
            try {
                await TelegramCommandMessage.saveMessageIds(String(chatId), commandType, newMessageIds);
            } catch (error) {
                console.error(`[TelegramBot] Lỗi khi lưu message IDs vào database:`, error);
            }
        }
    } catch (error) {
        console.error('[TelegramBot] Lỗi gửi thông báo chúc mừng:', error);
        throw error;
    }
}

async function broadcastMessage(bot, sourceChatId, text, options = {}) {
    const targets = getBroadcastTargets(sourceChatId);

    if (!targets.length) {
        throw new Error('Không có group chat nào khác trong TELEGRAM_ALLOWED_CHAT_IDS.');
    }

    const results = await Promise.allSettled(
        targets.map(async (chatId) => {
            // Sử dụng chat_id đã migrate nếu có
            const actualChatId = getMigratedChatId(chatId);
            
            try {
                await bot.telegram.sendMessage(actualChatId, text, options);
                return { chatId: actualChatId };
            } catch (error) {
                // Xử lý migrate chat_id
                const migratedChatId = handleChatMigration(error, actualChatId);
                if (migratedChatId) {
                    // Retry với chat_id mới
                    try {
                        await bot.telegram.sendMessage(migratedChatId, text, options);
                        return { chatId: migratedChatId };
                    } catch (retryError) {
                        throw { chatId: actualChatId, error: retryError };
                    }
                }
                throw { chatId: actualChatId, error };
            }
        })
    );

    const success = [];
    const failed = [];
    results.forEach(result => {
        if (result.status === 'fulfilled') {
            success.push(result.value.chatId);
        } else if (result.reason?.chatId) {
            failed.push({
                chatId: result.reason.chatId,
                reason: result.reason.error?.message || result.reason.error?.description || 'Unknown error'
            });
        } else {
            failed.push({ chatId: 'unknown', reason: result.reason?.message || 'Unknown error' });
        }
    });

    return { success, failed };
}

// Helper functions for user mention formatting
const sanitizeUsername = (value) => {
    if (!value) return null;
    return value.startsWith('@') ? value.slice(1) : value;
};

const buildUserMention = (profile = {}) => {
    const username =
        sanitizeUsername(profile.username) ||
        sanitizeUsername(profile.userUsername);
    const displayName =
        profile.displayName ||
        profile.fullName ||
        (() => {
            const parts = [profile.first_name, profile.last_name]
                .filter(Boolean)
                .map(part => String(part).trim());
            const joined = parts.join(' ').trim();
            return joined || null;
        })();
    if (username && displayName) {
        return `${displayName}(@${username})`;
    }
    if (username) {
        return `@${username}`;
    }
    if (displayName) {
        return displayName;
    }
    if (profile.userId || profile.id) {
        return `user_${profile.userId || profile.id}`;
    }
    return 'bạn';
};

async function triggerScheduledJob(bot, chatId, type) {
    if (type === 'xsmb') {
        // Sử dụng chat_id đã migrate nếu có
        const actualChatId = getMigratedChatId(chatId);
        
        const now = new Date();
        const { formatDateKey } = require('./prediction.service');
        const today = formatDateKey(now);
        const renderKey = `${actualChatId}:${today}`;

        // Kiểm tra xem đã render cho ngày hôm nay chưa
        if (xsmbRenderedDates.has(renderKey)) {
            console.log(`[TelegramBot] ⏭️ Đã render XSMB cho chat ${actualChatId} ngày ${today} rồi, bỏ qua`);
            return true;
        }

        console.log(`[TelegramBot] ⏰ Trigger scheduled job ${type} cho chat ${actualChatId} lúc ${now.toLocaleString('vi-VN', { timeZone: DEFAULT_SCHEDULE_TIMEZONE })}`);

        try {
            // Kiểm tra xem database đã có kết quả chưa
            const latestDoc = await XSMB.findLatest();
            if (!latestDoc) {
                console.log(`[TelegramBot] ℹ️ Chưa có kết quả XSMB trong database, bỏ qua`);
                return true;
            }

            // Kiểm tra xem kết quả có phải của ngày hôm nay không
            const docDate = formatDateKey(latestDoc.drawDate);
            if (docDate !== today) {
                console.log(`[TelegramBot] ℹ️ Kết quả XSMB trong database là của ngày ${docDate}, không phải hôm nay (${today}), bỏ qua`);
                return true;
            }

            // Có kết quả của ngày hôm nay, render ra
            const fakeCtx = createCtxForChat(bot, actualChatId);
            await replyWithResult(fakeCtx, () => Promise.resolve(latestDoc));

            // Đánh dấu đã render cho ngày này
            xsmbRenderedDates.add(renderKey);

            // Xóa key cũ sau 24 giờ để tránh memory leak
            setTimeout(() => {
                xsmbRenderedDates.delete(renderKey);
            }, 24 * 60 * 60 * 1000);

            console.log(`[TelegramBot] ✅ Đã gửi kết quả XSMB cho chat ${actualChatId} thành công (ngày ${today})`);
            return true;
        } catch (error) {
            // Xử lý migrate chat_id
            const migratedChatId = handleChatMigration(error, actualChatId);
            if (migratedChatId) {
                // Retry với chat_id mới
                try {
                    return await triggerScheduledJob(bot, migratedChatId, type);
                } catch (retryError) {
                    console.error(`[TelegramBot] Lỗi khi retry triggerScheduledJob với chat_id mới ${migratedChatId}:`, retryError);
                }
            }
            console.error(`[TelegramBot] ❌ Lỗi khi gửi kết quả XSMB cho chat ${actualChatId}:`, error);
            throw error;
        }
    }

    if (type === 'prediction_result') {
        const actualChatId = getMigratedChatId(chatId);
        console.log(`[TelegramBot] ⏰ Trigger scheduled job ${type} cho chat ${actualChatId} lúc ${new Date().toLocaleString('vi-VN', { timeZone: DEFAULT_SCHEDULE_TIMEZONE })}`);
        try {
            const fakeCtx = createCtxForChat(bot, actualChatId);

            // Lấy kết quả mới nhất
            const latestDoc = await XSMB.findLatest();
            if (!latestDoc) {
                console.log(`[TelegramBot] ℹ️ Chưa có kết quả xổ số để thông báo dự đoán cho chat ${actualChatId}`);
                return true;
            }

            // Gửi thông báo kết quả dự đoán (force gửi, không kiểm tra hasNotifiedResults)
            if (predictionHandlersInstance) {
                const normalizedDate = require('./prediction.service').formatDateKey(latestDoc.drawDate);
                console.log(`[TelegramBot] 📅 Đang gửi thông báo kết quả dự đoán cho ngày ${normalizedDate}`);
                const summary = await predictionHandlersInstance.forceAnnounceResult(fakeCtx, latestDoc);
                if (summary) {
                    await predictionHandlersInstance.announcePredictionStats(fakeCtx, summary);
                }
                console.log(`[TelegramBot] ✅ Đã xử lý thông báo kết quả dự đoán cho chat ${chatId}`);
            } else {
                console.warn(`[TelegramBot] ⚠️ predictionHandlersInstance chưa được khởi tạo`);
            }
            return true;
        } catch (error) {
            // Xử lý migrate chat_id
            const migratedChatId = handleChatMigration(error, actualChatId);
            if (migratedChatId) {
                try {
                    return await triggerScheduledJob(bot, migratedChatId, type);
                } catch (retryError) {
                    console.error(`[TelegramBot] Lỗi khi retry triggerScheduledJob với chat_id mới ${migratedChatId}:`, retryError);
                }
            }
            console.error(`[TelegramBot] ❌ Lỗi khi gửi thông báo kết quả dự đoán cho chat ${actualChatId}:`, error);
            throw error;
        }
    }

    if (type === 'prediction_list') {
        const actualChatId = getMigratedChatId(chatId);
        console.log(`[TelegramBot] ⏰ Trigger scheduled job ${type} cho chat ${actualChatId} lúc ${new Date().toLocaleString('vi-VN', { timeZone: DEFAULT_SCHEDULE_TIMEZONE })}`);
        try {
            const fakeCtx = createCtxForChat(bot, actualChatId);

            // Lấy danh sách dự đoán cho hôm nay (ngày hiện tại)
            const { formatDateKey } = require('./prediction.service');
            const today = new Date();
            const normalizedDate = formatDateKey(today);

            if (!normalizedDate) {
                console.error(`[TelegramBot] ❌ Không thể format ngày hiện tại cho chat ${actualChatId}`);
                return true;
            }

            // Gửi danh sách dự đoán (tương tự /soicau danhsachdangky)
            if (predictionHandlersInstance) {
                await predictionHandlersInstance.announcePredictionList(fakeCtx, normalizedDate);
                console.log(`[TelegramBot] ✅ Đã gửi danh sách dự đoán cho chat ${actualChatId} thành công (ngày ${normalizedDate})`);
            } else {
                console.warn(`[TelegramBot] ⚠️ predictionHandlersInstance chưa được khởi tạo`);
            }
            return true;
        } catch (error) {
            // Xử lý migrate chat_id
            const migratedChatId = handleChatMigration(error, actualChatId);
            if (migratedChatId) {
                try {
                    return await triggerScheduledJob(bot, migratedChatId, type);
                } catch (retryError) {
                    console.error(`[TelegramBot] Lỗi khi retry triggerScheduledJob với chat_id mới ${migratedChatId}:`, retryError);
                }
            }
            console.error(`[TelegramBot] ❌ Lỗi khi gửi danh sách dự đoán cho chat ${actualChatId}:`, error);
            throw error;
        }
    }

    if (type === 'prediction_stats') {
        const actualChatId = getMigratedChatId(chatId);
        console.log(`[TelegramBot] ⏰ Trigger scheduled job ${type} cho chat ${actualChatId} lúc ${new Date().toLocaleString('vi-VN', { timeZone: DEFAULT_SCHEDULE_TIMEZONE })}`);
        try {
            if (!predictionHandlersInstance) {
                console.warn('[TelegramBot] ⚠️ predictionHandlersInstance chưa được khởi tạo');
                return true;
            }
            const fakeCtx = createCtxForChat(bot, actualChatId);
            await predictionHandlersInstance.announceGlobalStats(fakeCtx);
            console.log(`[TelegramBot] ✅ Đã gửi thống kê kết quả dự đoán cho chat ${actualChatId}`);
            return true;
        } catch (error) {
            // Xử lý migrate chat_id
            const migratedChatId = handleChatMigration(error, actualChatId);
            if (migratedChatId) {
                try {
                    return await triggerScheduledJob(bot, migratedChatId, type);
                } catch (retryError) {
                    console.error(`[TelegramBot] Lỗi khi retry triggerScheduledJob với chat_id mới ${migratedChatId}:`, retryError);
                }
            }
            console.error(`[TelegramBot] ❌ Lỗi khi gửi thống kê kết quả dự đoán cho chat ${actualChatId}:`, error);
            throw error;
        }
    }

    if (type === 'prediction_signup_close') {
        const actualChatId = getMigratedChatId(chatId);
        console.log(`[TelegramBot] ⏰ Trigger scheduled job ${type} cho chat ${actualChatId} lúc ${new Date().toLocaleString('vi-VN', { timeZone: DEFAULT_SCHEDULE_TIMEZONE })}`);
        try {
            const fakeCtx = createCtxForChat(bot, actualChatId);

            // Gửi thông báo đăng ký đã đóng
            const today = new Date();
            const todayStr = today.toLocaleDateString('vi-VN');
            const message = [
                '<b>🔒 ĐĂNG KÝ DỰ ĐOÁN ĐÃ ĐÓNG</b>',
                '',
                `<b>⏰ Thời gian đăng ký cho hôm nay (${todayStr}) đã kết thúc lúc 18:00.</b>`,
                '',
                '<b>📋 Bạn có thể:</b>',
                '• <b>Xem danh sách dự đoán:</b> /soicau danhsachdangky',
                '• <b>Đăng ký cho ngày mai:</b> Sau 18:35',
                '',
                '<b>⏳ Kết quả xổ số sẽ được gửi lúc 18:36.</b>'
            ].join('\n');

            const signupCloseMessage = await fakeCtx.reply(message, { parse_mode: 'HTML' });
            console.log(`[TelegramBot] ✅ Đã gửi thông báo đóng đăng ký cho chat ${actualChatId} thành công`);

            // Lên lịch xóa tin nhắn sau 3 phút
            if (signupCloseMessage && signupCloseMessage.message_id) {
                scheduleMessageDeletion(actualChatId, signupCloseMessage.message_id, bot.telegram, 180000);
            }
            return true;
        } catch (error) {
            // Xử lý migrate chat_id
            const migratedChatId = handleChatMigration(error, actualChatId);
            if (migratedChatId) {
                try {
                    return await triggerScheduledJob(bot, migratedChatId, type);
                } catch (retryError) {
                    console.error(`[TelegramBot] Lỗi khi retry triggerScheduledJob với chat_id mới ${migratedChatId}:`, retryError);
                }
            }
            console.error(`[TelegramBot] ❌ Lỗi khi gửi thông báo đóng đăng ký cho chat ${actualChatId}:`, error);
            throw error;
        }
    }

    if (type === 'inactive_reminder') {
        const actualChatId = getMigratedChatId(chatId);
        console.log(`[TelegramBot] ⏰ Trigger scheduled job ${type} cho chat ${actualChatId} lúc ${new Date().toLocaleString('vi-VN', { timeZone: DEFAULT_SCHEDULE_TIMEZONE })}`);
        try {
            const inactiveMembers = await findInactiveMembers({
                chatId: String(actualChatId),
                thresholdHours: INACTIVE_THRESHOLD_HOURS,
                reminderCooldownHours: INACTIVE_REMINDER_COOLDOWN_HOURS,
                limit: INACTIVE_REMINDER_BATCH_LIMIT
            });

            if (!inactiveMembers.length) {
                console.log(`[TelegramBot] ℹ️ Không có thành viên nào cần nhắc tương tác cho chat ${chatId}`);
                return true;
            }

            const now = Date.now();
            const messageLines = [
                '📣 <b>NHẮC THÀNH VIÊN CHƯA TƯƠNG TÁC</b>',
                'Các bạn dưới đây đã hơn 2 ngày chưa tương tác. Vui lòng tham gia để tránh bị xóa khỏi nhóm:',
                ''
            ];

            inactiveMembers.forEach((member, index) => {
                const mention = buildUserMention(member);
                const lastInteraction = member.lastInteractionAt ? new Date(member.lastInteractionAt).toLocaleDateString('vi-VN') : 'không rõ';
                const days = member.lastInteractionAt
                    ? Math.max(2, Math.floor((now - new Date(member.lastInteractionAt).getTime()) / (1000 * 60 * 60 * 24)))
                    : INACTIVE_THRESHOLD_HOURS / 24;
                messageLines.push(`${index + 1}. ${mention} – ${days} ngày không tương tác (lần cuối: ${lastInteraction})`);
            });

            messageLines.push(
                '',
                '🔁 Vui lòng gửi tin nhắn, thả icon hoặc tham gia dự đoán để xác nhận bạn vẫn hoạt động.'
            );

            const fakeCtx = createCtxForChat(bot, actualChatId);
            await fakeCtx.reply(messageLines.join('\n'), { parse_mode: 'HTML' });
            await markMembersReminded(inactiveMembers.map(member => member._id));
            console.log(`[TelegramBot] ✅ Đã gửi nhắc tương tác cho ${inactiveMembers.length} thành viên ở chat ${actualChatId}`);
            return true;
        } catch (error) {
            // Xử lý migrate chat_id
            const migratedChatId = handleChatMigration(error, actualChatId);
            if (migratedChatId) {
                try {
                    return await triggerScheduledJob(bot, migratedChatId, type);
                } catch (retryError) {
                    console.error(`[TelegramBot] Lỗi khi retry triggerScheduledJob với chat_id mới ${migratedChatId}:`, retryError);
                }
            }
            console.error(`[TelegramBot] ❌ Lỗi khi gửi nhắc thành viên ít tương tác cho chat ${actualChatId}:`, error);
            throw error;
        }
    }

    if (type === 'chuc_mung') {
        const actualChatId = getMigratedChatId(chatId);
        console.log(`[TelegramBot] ⏰ Trigger scheduled job ${type} cho chat ${actualChatId} lúc ${new Date().toLocaleString('vi-VN', { timeZone: DEFAULT_SCHEDULE_TIMEZONE })}`);
        try {
            const fakeCtx = createCtxForChat(bot, actualChatId);
            await sendChucMungMessage(fakeCtx, actualChatId);
            console.log(`[TelegramBot] ✅ Đã gửi thông báo chúc mừng cho chat ${actualChatId}`);
            return true;
        } catch (error) {
            // Xử lý migrate chat_id
            const migratedChatId = handleChatMigration(error, actualChatId);
            if (migratedChatId) {
                try {
                    return await triggerScheduledJob(bot, migratedChatId, type);
                } catch (retryError) {
                    console.error(`[TelegramBot] Lỗi khi retry triggerScheduledJob với chat_id mới ${migratedChatId}:`, retryError);
                }
            }
            console.error(`[TelegramBot] ❌ Lỗi khi gửi thông báo chúc mừng cho chat ${actualChatId}:`, error);
            throw error;
        }
    }

    return false;
}

function cancelSchedule(chatId, type) {
    let cancelled = false;
    // Cancel tất cả schedule có type này (bao gồm cả các khung giờ khác nhau)
    const keysToCancel = [];
    scheduledJobs.forEach((value, key) => {
        if (key.startsWith(`${chatId}:${type}`)) {
            keysToCancel.push(key);
        }
    });

    keysToCancel.forEach(key => {
        const existing = scheduledJobs.get(key);
        if (existing && existing.job) {
            existing.job.stop();
            scheduledJobs.delete(key);
            cancelled = true;
        }
    });

    return cancelled;
}

function scheduleForChat({ bot, chatId, time, type }) {
    const cronExpression = buildCronExpression(time);
    const key = getScheduleKey(chatId, type, time);
    // Cancel schedule cũ với key cũ (không có time) để tương thích ngược
    const oldKey = getScheduleKey(chatId, type);
    if (scheduledJobs.has(oldKey)) {
        const oldJob = scheduledJobs.get(oldKey);
        if (oldJob && oldJob.job) {
            oldJob.job.stop();
        }
        scheduledJobs.delete(oldKey);
    }
    // Cancel schedule với key mới nếu đã tồn tại
    if (scheduledJobs.has(key)) {
        const existingJob = scheduledJobs.get(key);
        if (existingJob && existingJob.job) {
            existingJob.job.stop();
        }
    }
    const hourStr = String(time.hour).padStart(2, '0');
    const minuteStr = String(time.minute).padStart(2, '0');
    console.log(`[TelegramBot] 📅 Đăng ký lịch ${type} cho chat ${chatId} lúc ${hourStr}:${minuteStr} (${cronExpression}) - Timezone: ${DEFAULT_SCHEDULE_TIMEZONE}`);
    const job = cron.schedule(
        cronExpression,
        async () => {
            try {
                // Sử dụng chat_id đã migrate nếu có
                const actualChatId = getMigratedChatId(chatId);
                console.log(`[TelegramBot] 🔔 Cron job được trigger cho ${type} - chat ${actualChatId} lúc ${new Date().toLocaleString('vi-VN', { timeZone: DEFAULT_SCHEDULE_TIMEZONE })}`);
                await triggerScheduledJob(bot, actualChatId, type);
            } catch (error) {
                // Xử lý migrate chat_id
                const migratedChatId = handleChatMigration(error, chatId);
                if (migratedChatId) {
                    try {
                        await triggerScheduledJob(bot, migratedChatId, type);
                        return; // Retry thành công
                    } catch (retryError) {
                        console.error(`[TelegramBot] Lỗi khi retry triggerScheduledJob với chat_id mới ${migratedChatId}:`, retryError);
                    }
                }
                console.error(`[TelegramBot] ❌ Lỗi gửi lịch ${type} cho chat ${chatId}:`, error);
                console.error(`[TelegramBot] Stack trace:`, error.stack);
            }
        },
        { timezone: DEFAULT_SCHEDULE_TIMEZONE }
    );
    scheduledJobs.set(key, { job, cronExpression, type, time });
    return { cronExpression };
}

function describeSchedule(chatId, type) {
    const key = getScheduleKey(chatId, type);
    const data = scheduledJobs.get(key);
    if (!data) return null;
    const hourStr = String(data.time.hour).padStart(2, '0');
    const minuteStr = String(data.time.minute).padStart(2, '0');
    return `${type.toUpperCase()} - ${hourStr}:${minuteStr}`;
}

function buildScheduleHelpText() {
    return [
        '🕒 Sử dụng /schedule để bật nhắc tự động:',
        '- /schedule 18:36 xsmb  ➜ gửi kết quả XSMB lúc 18:36 mỗi ngày',
        '- /schedule 18:37 prediction_result  ➜ gửi thông báo kết quả dự đoán lúc 18:37',
        '- /schedule 18:35 prediction_stats  ➜ gửi thống kê kết quả dự đoán',
        '- /schedule 18:01 prediction_list  ➜ gửi danh sách dự đoán lúc 18:01',
        '- /schedule 18:00 prediction_signup_close  ➜ thông báo đăng ký đã đóng lúc 18:00',
        '- /schedule 16:00 chuc_mung  ➜ gửi thông báo chúc mừng lúc 16:00',
        '- /schedule 09:00 inactive_reminder  ➜ nhắc thành viên ít tương tác',
        '- /schedule off xsmb    ➜ tắt nhắc kết quả XSMB',
        '- /schedule off prediction_result  ➜ tắt thông báo kết quả dự đoán',
        '- /schedule off prediction_list  ➜ tắt thông báo danh sách dự đoán',
        '- /schedule off prediction_signup_close  ➜ tắt thông báo đóng đăng ký',
        '- /schedule off chuc_mung  ➜ tắt thông báo chúc mừng',
        '- /schedule off inactive_reminder  ➜ tắt nhắc thành viên ít tương tác',
        '- /schedule list        ➜ xem các lịch đang bật'
    ].join('\n');
}

function stopAllSchedules() {
    scheduledJobs.forEach(({ job }) => job.stop());
    scheduledJobs.clear();
}

/**
 * Kiểm tra xem có trong khung giờ live không (giống frontend)
 * Live window: 18:10 - 18:33 (hoặc theo cấu hình)
 */
function isWithinLiveWindow() {
    const now = new Date();
    // Convert sang timezone Việt Nam
    const vietTime = new Date(now.toLocaleString('en-US', { timeZone: DEFAULT_SCHEDULE_TIMEZONE }));
    const hours = vietTime.getHours();
    const minutes = vietTime.getMinutes();

    // Đọc từ env hoặc dùng giá trị mặc định (giống frontend)
    const liveHour = parseInt(process.env.TELEGRAM_LIVE_WINDOW_HOUR) || 18;
    const startMinute = parseInt(process.env.TELEGRAM_LIVE_WINDOW_START_MINUTE) || 10;
    const endMinute = parseInt(process.env.TELEGRAM_LIVE_WINDOW_END_MINUTE) || 33;

    // Live window: 18:10 - 18:33 (hoặc đến khi kết quả đầy đủ)
    return hours === liveHour && minutes >= startMinute && minutes <= endMinute;
}

/**
 * Setup Lottery Socket Realtime - Nhận kết quả xổ số realtime và gửi lên Telegram
 */
function setupLotterySocketRealtime(bot) {
    // Map để lưu liveData hiện tại theo chatId
    // Key: chatId, Value: liveData object
    const chatLiveData = new Map();
    
    // Map để track xem đã gửi complete message chưa (tránh gửi lặp)
    // Key: chatId, Value: boolean
    const hasSentComplete = new Map();
    
    // Map để lưu chat_id migration (old chat_id -> new supergroup chat_id)
    // Key: oldChatId, Value: newChatId
    const chatIdMigration = new Map();

    // Hàm kết nối socket (chỉ kết nối trong khung giờ live)
    function connectSocketIfInLiveWindow() {
        if (isWithinLiveWindow()) {
            if (!telegramLotterySocketClient.getConnectionStatus().connected) {
                console.log('[TelegramBot] 🔴 Trong khung live, kết nối socket lottery...');
                // Reset reconnection attempts để thử lại từ đầu
                telegramLotterySocketClient.resetReconnectionAttempts();
                telegramLotterySocketClient.connect();
                // Reset flag khi bắt đầu khung giờ mới
                hasSentComplete.clear();
                console.log('[TelegramBot] 🔄 Đã reset hasSentComplete flag cho khung giờ mới');
            }
        } else {
            // Ngoài khung live, ngắt kết nối để tiết kiệm tài nguyên
            if (telegramLotterySocketClient.getConnectionStatus().connected) {
                console.log('[TelegramBot] 🛑 Ngoài khung live, ngắt kết nối socket lottery');
                telegramLotterySocketClient.disconnect();
            }
        }
    }

    // Kiểm tra và kết nối sau khi đợi socket server khởi tạo (delay 3 giây)
    // Điều này đảm bảo socket server đã sẵn sàng trước khi client kết nối
    setTimeout(() => {
        connectSocketIfInLiveWindow();
    }, 3000);

    // Lắng nghe lỗi kết nối và reset attempts khi vào khung giờ mới
    telegramLotterySocketClient.on('connection_error', (error) => {
        // Nếu đang trong khung live và có lỗi, thử reset và kết nối lại sau một khoảng thời gian
        if (isWithinLiveWindow()) {
            console.log('[TelegramBot] ⚠️ Socket connection error detected, will retry later...');
            // Reset attempts sau 2 phút để thử lại
            setTimeout(() => {
                if (isWithinLiveWindow() && !telegramLotterySocketClient.getConnectionStatus().connected) {
                    console.log('[TelegramBot] 🔄 Retrying socket connection after error...');
                    telegramLotterySocketClient.resetReconnectionAttempts();
                    telegramLotterySocketClient.connect();
                }
            }, 120000); // Đợi 2 phút trước khi thử lại
        }
    });

    // Kiểm tra lại mỗi phút để tự động kết nối/ngắt kết nối
    const checkInterval = setInterval(() => {
        connectSocketIfInLiveWindow();
    }, 60000); // Check mỗi 1 phút

    // Cleanup interval khi bot shutdown
    process.once('SIGINT', () => clearInterval(checkInterval));
    process.once('SIGTERM', () => clearInterval(checkInterval));
    process.once('exit', () => clearInterval(checkInterval));

    // Hàm format message từ liveData (tương tự frontend)
    function formatLiveResultMessage(liveData) {
        if (!liveData) {
            return '⏳ Đang chờ kết quả xổ số...';
        }

        const formatDate = (date) => {
            if (!date) return '';
            try {
                const d = new Date(date);
                if (isNaN(d.getTime())) return '';
                const day = String(d.getDate()).padStart(2, '0');
                const month = String(d.getMonth() + 1).padStart(2, '0');
                const year = d.getFullYear();
                const days = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
                const dayOfWeek = days[d.getDay()];
                return `${dayOfWeek} - ${day}/${month}/${year}`;
            } catch {
                return '';
            }
        };

        const formatPrize = (value) => {
            if (!value || value === '...' || value === '***') return '...';
            return String(value);
        };

        const dateStr = formatDate(liveData.drawDate);
        const isComplete = liveData.isComplete || false;

        let message = `<b>🔴 TƯỜNG THUẬT TRỰC TIẾP XSMB</b>\n`;
        if (dateStr) {
            message += `<b>📅 ${dateStr}</b>\n\n`;
        }

        message += `<b>Giải Đặc Biệt:</b> <code>${formatPrize(liveData.specialPrize_0)}</code>\n`;
        message += `<b>Giải Nhất:</b> <code>${formatPrize(liveData.firstPrize_0)}</code>\n`;

        // Giải Nhì - hiển thị tất cả số trên cùng 1 dòng
        const secondPrizes = [];
        for (let i = 0; i < 2; i++) {
            const prize = formatPrize(liveData[`secondPrize_${i}`]);
            if (prize !== '...') {
                secondPrizes.push(prize);
            }
        }
        message += `<b>Giải Nhì:</b>`;
        if (secondPrizes.length > 0) {
            message += ` ${secondPrizes.map(p => `<code>${p}</code>`).join(' - ')}\n`;
        } else {
            message += ` <code>...</code>\n`;
        }

        // Giải Ba - hiển thị tất cả số trên cùng 1 dòng
        const threePrizes = [];
        for (let i = 0; i < 6; i++) {
            const prize = formatPrize(liveData[`threePrizes_${i}`]);
            if (prize !== '...') {
                threePrizes.push(prize);
            }
        }
        message += `<b>Giải Ba:</b>`;
        if (threePrizes.length > 0) {
            message += ` ${threePrizes.map(p => `<code>${p}</code>`).join(' - ')}\n`;
        } else {
            message += ` <code>...</code>\n`;
        }

        // Giải Tư - hiển thị tất cả số trên cùng 1 dòng
        const fourPrizes = [];
        for (let i = 0; i < 4; i++) {
            const prize = formatPrize(liveData[`fourPrizes_${i}`]);
            if (prize !== '...') {
                fourPrizes.push(prize);
            }
        }
        message += `<b>Giải Tư:</b>`;
        if (fourPrizes.length > 0) {
            message += ` ${fourPrizes.map(p => `<code>${p}</code>`).join(' - ')}\n`;
        } else {
            message += ` <code>...</code>\n`;
        }

        // Giải Năm - hiển thị tất cả số trên cùng 1 dòng
        const fivePrizes = [];
        for (let i = 0; i < 6; i++) {
            const prize = formatPrize(liveData[`fivePrizes_${i}`]);
            if (prize !== '...') {
                fivePrizes.push(prize);
            }
        }
        message += `<b>Giải Năm:</b>`;
        if (fivePrizes.length > 0) {
            message += ` ${fivePrizes.map(p => `<code>${p}</code>`).join(' - ')}\n`;
        } else {
            message += ` <code>...</code>\n`;
        }

        // Giải Sáu - hiển thị tất cả số trên cùng 1 dòng
        const sixPrizes = [];
        for (let i = 0; i < 3; i++) {
            const prize = formatPrize(liveData[`sixPrizes_${i}`]);
            if (prize !== '...') {
                sixPrizes.push(prize);
            }
        }
        message += `<b>Giải Sáu:</b>`;
        if (sixPrizes.length > 0) {
            message += ` ${sixPrizes.map(p => `<code>${p}</code>`).join(' - ')}\n`;
        } else {
            message += ` <code>...</code>\n`;
        }

        // Giải Bảy - hiển thị tất cả số trên cùng 1 dòng
        const sevenPrizes = [];
        for (let i = 0; i < 4; i++) {
            const prize = formatPrize(liveData[`sevenPrizes_${i}`]);
            if (prize !== '...') {
                sevenPrizes.push(prize);
            }
        }
        message += `<b>Giải Bảy:</b>`;
        if (sevenPrizes.length > 0) {
            message += ` ${sevenPrizes.map(p => `<code>${p}</code>`).join(' - ')}\n`;
        } else {
            message += ` <code>...</code>\n`;
        }

        message += `<b>Mã Đặc Biệt:</b> <code>${formatPrize(liveData.maDB)}</code>\n`;

        if (isComplete) {
            message += `\n✅ <b>Kết quả đã hoàn tất</b>`;
        } else {
            message += `\n⏳ <b>Đang cập nhật...</b>`;
        }

        return message;
    }

    // Hàm gửi/update message tổng hợp đến chat
    async function sendOrUpdateLiveResult(chatId, liveData) {
        try {
            // Kiểm tra xem chat_id có bị migrate không
            let actualChatId = chatId;
            if (chatIdMigration.has(String(chatId))) {
                actualChatId = chatIdMigration.get(String(chatId));
                console.log(`[TelegramBot] 🔄 Using migrated chat_id: ${chatId} -> ${actualChatId}`);
            }
            
            const commandType = 'live-xsmb';
            const key = `${actualChatId}:${commandType}`;

            // Format message tổng hợp
            const message = formatLiveResultMessage(liveData);
            const isComplete = liveData.isComplete || false;

            // Gửi tin nhắn mới
            const sentMsg = await bot.telegram.sendMessage(actualChatId, message, { parse_mode: 'HTML' });

            if (sentMsg && sentMsg.message_id) {
                // Xóa tin nhắn cũ và lưu tin nhắn mới
                await deleteOldCommandMessages(actualChatId, commandType, sentMsg.message_id, bot.telegram);

                if (isComplete) {
                    console.log(`[TelegramBot] ✅ Đã gửi thông báo kết quả hoàn tất cho chat ${actualChatId}, message ID: ${sentMsg.message_id}`);
                }
            }

            // Lưu liveData cho chat này (dùng actualChatId)
            chatLiveData.set(String(actualChatId), liveData);
        } catch (error) {
            // Xử lý lỗi migrate chat_id
            if (error.response && error.response.error_code === 400 && 
                error.response.description && error.response.description.includes('upgraded to a supergroup chat') &&
                error.response.parameters && error.response.parameters.migrate_to_chat_id) {
                
                const newChatId = error.response.parameters.migrate_to_chat_id;
                console.log(`[TelegramBot] 🔄 Chat ${chatId} đã được upgrade lên supergroup: ${newChatId}`);
                
                // Lưu migration mapping
                chatIdMigration.set(String(chatId), String(newChatId));
                
                // Cập nhật autoScheduleChats nếu có
                const chatIndex = autoScheduleChats.indexOf(String(chatId));
                if (chatIndex >= 0) {
                    autoScheduleChats[chatIndex] = String(newChatId);
                    console.log(`[TelegramBot] ✅ Đã cập nhật chat_id trong autoScheduleChats: ${chatId} -> ${newChatId}`);
                }
                
                // Thử gửi lại với chat_id mới
                try {
                    await sendOrUpdateLiveResult(newChatId, liveData);
                } catch (retryError) {
                    console.error(`[TelegramBot] Lỗi khi gửi lại với chat_id mới ${newChatId}:`, retryError);
                }
            } else {
                console.error(`[TelegramBot] Lỗi khi gửi/update live result cho chat ${chatId}:`, error);
            }
        }
    }

    // Lắng nghe events từ socket
    telegramLotterySocketClient.on('lottery:latest', (liveData) => {
        console.log('[TelegramBot] 📡 Received latest lottery result');
        // Gửi đến tất cả auto schedule chats
        autoScheduleChats.forEach(chatId => {
            sendOrUpdateLiveResult(chatId, liveData);
        });
    });

    telegramLotterySocketClient.on('lottery:prize-update', (data) => {
        console.log(`[TelegramBot] 📡 Received prize update: ${data.prizeType} = ${data.prizeData}`);

        // Gửi update đến tất cả auto schedule chats
        // Logic giống frontend: update ngay lập tức khi nhận từng phần tử riêng lẻ
        autoScheduleChats.forEach(chatId => {
            // Lấy liveData hiện tại của chat này (hoặc dùng fullData từ event)
            const currentLiveData = chatLiveData.get(String(chatId)) || data.fullData || {};

            // Update liveData với giá trị mới (giống frontend: setLiveData(prev => { ...prev, [prizeType]: prizeData }))
            currentLiveData[data.prizeType] = data.prizeData;
            currentLiveData.lastUpdated = data.timestamp || Date.now();

            // Update message tổng hợp ngay lập tức (giống frontend re-render ngay)
            sendOrUpdateLiveResult(chatId, currentLiveData);
        });
    });

    telegramLotterySocketClient.on('lottery:complete', (liveData) => {
        console.log('[TelegramBot] 📡 Received complete result');
        // Đảm bảo isComplete được set thành true
        const completeLiveData = { ...liveData, isComplete: true };
        autoScheduleChats.forEach(chatId => {
            // Chỉ gửi nếu chưa gửi complete message cho chat này
            if (!hasSentComplete.get(String(chatId))) {
                sendOrUpdateLiveResult(chatId, completeLiveData);
                hasSentComplete.set(String(chatId), true);
            }
        });
    });

    telegramLotterySocketClient.on('lottery:full-update', (liveData) => {
        console.log('[TelegramBot] 📡 Received full update');
        // Chỉ xử lý full-update nếu chưa complete (tránh gửi lặp)
        const isComplete = liveData.isComplete || false;
        if (!isComplete) {
            autoScheduleChats.forEach(chatId => {
                // Reset flag nếu chưa complete
                if (hasSentComplete.get(String(chatId))) {
                    hasSentComplete.set(String(chatId), false);
                }
                sendOrUpdateLiveResult(chatId, liveData);
            });
        } else {
            // Nếu đã complete, chỉ log (không gửi vì đã gửi ở lottery:complete)
            console.log('[TelegramBot] ⏭️ Skipping full-update (already complete)');
        }
    });

    console.log('[TelegramBot] ✅ Lottery Socket Realtime đã được khởi tạo');
    console.log(`[TelegramBot] 📅 Khung giờ live: ${process.env.TELEGRAM_LIVE_WINDOW_HOUR || 18}:${process.env.TELEGRAM_LIVE_WINDOW_START_MINUTE || 10} - ${process.env.TELEGRAM_LIVE_WINDOW_END_MINUTE || 33}`);
}

function setupDefaultSchedules(bot) {
    // Setup schedule cho XSMB - schedule nhiều khung giờ (mặc định: 18:31, 18:32, 18:33)
    // Parse danh sách các khung giờ từ env variable
    const timeStrings = DEFAULT_AUTO_SCHEDULE_TIMES.split(',').map(s => s.trim()).filter(Boolean);
    const scheduleTimes = [];

    for (const timeStr of timeStrings) {
        const parsedTime = parseTimeInput(timeStr);
        if (parsedTime) {
            scheduleTimes.push(parsedTime);
        } else {
            console.warn(`[TelegramBot] ⚠️ Thời gian "${timeStr}" trong TELEGRAM_AUTO_SCHEDULE_TIMES không hợp lệ, bỏ qua.`);
        }
    }

    if (scheduleTimes.length === 0) {
        console.warn('[TelegramBot] TELEGRAM_AUTO_SCHEDULE_TIMES không hợp lệ hoặc rỗng, bỏ qua auto schedule XSMB.');
    } else if (autoScheduleChats.length) {
        autoScheduleChats.forEach((chatIdRaw) => {
            const chatId = chatIdRaw.trim();
            if (!chatId) return;

            scheduleTimes.forEach((scheduleTime) => {
                scheduleForChat({ bot, chatId, time: scheduleTime, type: 'xsmb' });
                const hourStr = String(scheduleTime.hour).padStart(2, '0');
                const minuteStr = String(scheduleTime.minute).padStart(2, '0');
                console.log(`[TelegramBot] Auto schedule XSMB ${hourStr}:${minuteStr} cho chat ${chatId}`);
            });
        });
    }

    // Setup schedule cho thông báo kết quả dự đoán
    const notificationTime = parseTimeInput(DEFAULT_AUTO_SCHEDULE_TIME_NOTIFICATION_RESULT);
    if (!notificationTime) {
        console.warn('[TelegramBot] TELEGRAM_AUTO_SCHEDULE_TIME_NOTIFICATION_RESULT không hợp lệ, bỏ qua auto schedule thông báo kết quả.');
    } else if (autoScheduleChats.length) {
        autoScheduleChats.forEach((chatIdRaw) => {
            const chatId = chatIdRaw.trim();
            if (!chatId) return;
            scheduleForChat({ bot, chatId, time: notificationTime, type: 'prediction_result' });
            const hourStr = String(notificationTime.hour).padStart(2, '0');
            const minuteStr = String(notificationTime.minute).padStart(2, '0');
            console.log(`[TelegramBot] Auto schedule thông báo kết quả dự đoán ${hourStr}:${minuteStr} cho chat ${chatId}`);
        });
    }

    // Setup schedule cho danh sách dự đoán
    const forecastTime = parseTimeInput(DEFAULT_AUTO_SCHEDULE_TIME_SINGUP_FORECAST);
    if (!forecastTime) {
        console.warn('[TelegramBot] TELEGRAM_AUTO_SCHEDULE_TIME_SINGUP_FORECAST không hợp lệ, bỏ qua auto schedule danh sách dự đoán.');
    } else if (autoScheduleChats.length) {
        autoScheduleChats.forEach((chatIdRaw) => {
            const chatId = chatIdRaw.trim();
            if (!chatId) return;
            scheduleForChat({ bot, chatId, time: forecastTime, type: 'prediction_list' });
            const hourStr = String(forecastTime.hour).padStart(2, '0');
            const minuteStr = String(forecastTime.minute).padStart(2, '0');
            console.log(`[TelegramBot] Auto schedule danh sách dự đoán ${hourStr}:${minuteStr} cho chat ${chatId}`);
        });
    }

    // Setup schedule cho thống kê kết quả dự đoán
    const statsTime = parseTimeInput(DEFAULT_AUTO_SCHEDULE_TIME_STATISTICAL_RESULT);
    if (!statsTime) {
        console.warn('[TelegramBot] TELEGRAM_AUTO_SCHEDULE_TIME_STATISTICAL_RESULT không hợp lệ, bỏ qua auto schedule thống kê kết quả.');
    } else if (autoScheduleChats.length) {
        autoScheduleChats.forEach((chatIdRaw) => {
            const chatId = chatIdRaw.trim();
            if (!chatId) return;
            scheduleForChat({ bot, chatId, time: statsTime, type: 'prediction_stats' });
            const hourStr = String(statsTime.hour).padStart(2, '0');
            const minuteStr = String(statsTime.minute).padStart(2, '0');
            console.log(`[TelegramBot] Auto schedule thống kê kết quả dự đoán ${hourStr}:${minuteStr} cho chat ${chatId}`);
        });
    }

    // Setup schedule cho thông báo đóng đăng ký
    const signupCloseTime = parseTimeInput(DEFAULT_AUTO_SCHEDULE_TIME_SINGUP);
    if (!signupCloseTime) {
        console.warn('[TelegramBot] TELEGRAM_AUTO_SCHEDULE_TIME_SINGUP không hợp lệ, bỏ qua auto schedule thông báo đóng đăng ký.');
    } else if (autoScheduleChats.length) {
        autoScheduleChats.forEach((chatIdRaw) => {
            const chatId = chatIdRaw.trim();
            if (!chatId) return;
            scheduleForChat({ bot, chatId, time: signupCloseTime, type: 'prediction_signup_close' });
            const hourStr = String(signupCloseTime.hour).padStart(2, '0');
            const minuteStr = String(signupCloseTime.minute).padStart(2, '0');
            console.log(`[TelegramBot] Auto schedule thông báo đóng đăng ký ${hourStr}:${minuteStr} cho chat ${chatId}`);
        });
    }

    // Setup schedule nhắc thành viên ít tương tác
    const inactiveReminderTime = parseTimeInput(DEFAULT_INACTIVE_REMINDER_TIME);
    if (!inactiveReminderTime) {
        console.warn('[TelegramBot] TELEGRAM_INACTIVE_REMINDER_TIME không hợp lệ, bỏ qua auto schedule inactive reminder.');
    } else if (autoScheduleChats.length) {
        autoScheduleChats.forEach((chatIdRaw) => {
            const chatId = chatIdRaw.trim();
            if (!chatId) return;
            scheduleForChat({ bot, chatId, time: inactiveReminderTime, type: 'inactive_reminder' });
            const hourStr = String(inactiveReminderTime.hour).padStart(2, '0');
            const minuteStr = String(inactiveReminderTime.minute).padStart(2, '0');
            console.log(`[TelegramBot] Auto schedule nhắc thành viên ít tương tác ${hourStr}:${minuteStr} cho chat ${chatId}`);
        });
    }

    // Setup schedule cho thông báo chúc mừng - schedule nhiều khung giờ (mặc định: 16:00, 17:30)
    const chucMungTimeStrings = DEFAULT_AUTO_SCHEDULE_TIME_CHUNGMUNG.split(',').map(s => s.trim()).filter(Boolean);
    const chucMungScheduleTimes = [];

    for (const timeStr of chucMungTimeStrings) {
        const parsedTime = parseTimeInput(timeStr);
        if (parsedTime) {
            chucMungScheduleTimes.push(parsedTime);
        } else {
            console.warn(`[TelegramBot] ⚠️ Thời gian "${timeStr}" trong TELEGRAM_AUTO_SCHEDULE_TIME_CHUNGMUNG không hợp lệ, bỏ qua.`);
        }
    }

    if (chucMungScheduleTimes.length === 0) {
        console.warn('[TelegramBot] TELEGRAM_AUTO_SCHEDULE_TIME_CHUNGMUNG không hợp lệ hoặc rỗng, bỏ qua auto schedule thông báo chúc mừng.');
    } else if (autoScheduleChats.length) {
        autoScheduleChats.forEach((chatIdRaw) => {
            const chatId = chatIdRaw.trim();
            if (!chatId) return;

            chucMungScheduleTimes.forEach((scheduleTime) => {
                scheduleForChat({ bot, chatId, time: scheduleTime, type: 'chuc_mung' });
                const hourStr = String(scheduleTime.hour).padStart(2, '0');
                const minuteStr = String(scheduleTime.minute).padStart(2, '0');
                console.log(`[TelegramBot] Auto schedule thông báo chúc mừng ${hourStr}:${minuteStr} cho chat ${chatId}`);
            });
        });
    }

    if (!autoScheduleChats.length) {
        console.log('[TelegramBot] Không có chat nào để bật auto schedule mặc định.');
    }
}

function isChatAllowed(chatId) {
    if (!allowedChats.length) {
        // Allow all chats when the env var is not configured (easier for testing)
        return true;
    }

    return allowedChats.includes(String(chatId));
}

function isControlChat(chatId) {
    if (!controlChats.length) return false;
    return controlChats.includes(String(chatId));
}

function getBroadcastTargets(sourceChatId) {
    return allowedChats
        .map(String)
        .filter(chatId => chatId !== String(sourceChatId));
}

function getStartOfDayInTimezone(timezone) {
    const now = new Date();
    const tzNow = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
    const tzStart = new Date(tzNow);
    tzStart.setHours(0, 0, 0, 0);
    const offset = now.getTime() - tzNow.getTime();
    return new Date(tzStart.getTime() + offset);
}


async function sendXsmbDocAsImage(ctx, doc, { loadingMessage } = {}) {
    if (!doc) {
        throw new Error('Document is required to send image');
    }

    console.log('[TelegramBot] Đang generate hình ảnh...');
    const chatId = ctx.chat?.id;
    const actualChatId = getMigratedChatId(chatId);
    
    try {
        const imageBuffer = await xsmbImageGenerator.generateImage(doc);
        if (loadingMessage && actualChatId) {
            try {
                await ctx.telegram.deleteMessage(actualChatId, loadingMessage.message_id);
            } catch (e) {
                // Ignore nếu không xóa được
            }
        }
        console.log('[TelegramBot] Đã generate hình ảnh thành công, kích thước:', imageBuffer.length, 'bytes');

        let caption = '🎯 Kết Quả Xổ Số';
        if (doc.drawDate) {
            const date = new Date(doc.drawDate);
            caption += ' ' + date.toLocaleDateString('vi-VN');
        }

        return ctx.replyWithPhoto(
            { source: imageBuffer },
            { caption }
        );
    } catch (imageError) {
        // Xử lý migrate chat_id
        const migratedChatId = handleChatMigration(imageError, chatId);
        if (migratedChatId) {
            // Retry với chat_id mới
            try {
                const newCtx = createCtxForChat(ctx.telegram, migratedChatId);
                return await sendXsmbDocAsImage(newCtx, doc, { loadingMessage });
            } catch (retryError) {
                console.error(`[TelegramBot] Lỗi khi retry sendXsmbDocAsImage với chat_id mới ${migratedChatId}:`, retryError);
                throw retryError;
            }
        }
        
        console.error('[TelegramBot] Lỗi generate hình ảnh:', imageError);
        console.error('[TelegramBot] Stack trace:', imageError.stack);
        if (loadingMessage && chatId) {
            try {
                await ctx.telegram.deleteMessage(chatId, loadingMessage.message_id);
            } catch (e) {
                // Ignore nếu không xóa được
            }
        }
        throw imageError;
    }
}

async function sendThongKeAsImage(ctx, { loadingMessage } = {}) {
    console.log('[TelegramBot] Đang generate hình ảnh thống kê...');
    const chatId = ctx.chat?.id;
    const commandType = 'thongke';

    try {
        // Xóa tin nhắn cũ trước khi generate ảnh mới (nếu có)
        if (chatId) {
            try {
                // Lấy message IDs cũ từ database
                const oldMessageIds = await TelegramCommandMessage.getMessageIds(String(chatId), commandType);
                if (oldMessageIds && oldMessageIds.length > 0) {
                    console.log(`[TelegramBot] Tìm thấy ${oldMessageIds.length} tin nhắn cũ cần xóa cho ${commandType}:`, oldMessageIds);
                    // Xóa tất cả tin nhắn cũ
                    for (const oldMessageId of oldMessageIds) {
                        try {
                            await ctx.telegram.deleteMessage(chatId, oldMessageId);
                        } catch (e) {
                            // Ignore nếu không xóa được (quá cũ > 48h)
                        }
                    }
                }
            } catch (error) {
                console.error(`[TelegramBot] Lỗi khi xóa tin nhắn cũ cho ${commandType}:`, error);
            }
        }

        const imageBuffer = await thongKeStatsImageGenerator.generateImage();
        if (loadingMessage && chatId) {
            try {
                await ctx.telegram.deleteMessage(chatId, loadingMessage.message_id);
            } catch (e) {
                // Ignore nếu không xóa được
            }
        }
        console.log('[TelegramBot] Đã generate hình ảnh thống kê thành công, kích thước:', imageBuffer.length, 'bytes');

        const todayStr = new Date().toLocaleDateString('vi-VN');
        const caption = `Thống Kê Loto - ${todayStr}`;

        const sentMessage = await ctx.replyWithPhoto(
            { source: imageBuffer },
            { caption }
        );

        // Lưu message ID mới vào database
        if (chatId && sentMessage && sentMessage.message_id) {
            try {
                const messageIds = [sentMessage.message_id];
                await TelegramCommandMessage.saveMessageIds(String(chatId), commandType, messageIds);
                console.log(`[TelegramBot] Đã lưu ${messageIds.length} message ID(s) mới cho ${commandType}:`, messageIds);
            } catch (error) {
                console.error(`[TelegramBot] Lỗi khi lưu message IDs vào database:`, error);
            }
        }

        return sentMessage;
    } catch (imageError) {
        console.error('[TelegramBot] Lỗi generate hình ảnh thống kê:', imageError);
        console.error('[TelegramBot] Stack trace:', imageError.stack);
        if (loadingMessage && chatId) {
            try {
                await ctx.telegram.deleteMessage(chatId, loadingMessage.message_id);
            } catch (e) {
                // Ignore nếu không xóa được
            }
        }

        // Lưu error message ID nếu có
        try {
            const errorMsg = await ctx.reply('❌ Có lỗi xảy ra khi tạo ảnh thống kê, vui lòng thử lại sau.');
            if (chatId && errorMsg && errorMsg.message_id) {
                const messageIds = [errorMsg.message_id];
                await TelegramCommandMessage.saveMessageIds(String(chatId), commandType, messageIds);
            }
        } catch (error) {
            console.error(`[TelegramBot] Lỗi khi lưu error message ID:`, error);
        }

        throw imageError;
    }
}

async function sendThongKeDacBietAsImage(ctx, { loadingMessage } = {}) {
    console.log('[TelegramBot] Đang generate hình ảnh thống kê đặc biệt...');
    const chatId = ctx.chat?.id;
    const commandType = 'thongke_db';

    try {
        // Xóa tin nhắn cũ trước khi generate ảnh mới (nếu có)
        if (chatId) {
            try {
                // Lấy message IDs cũ từ database
                const oldMessageIds = await TelegramCommandMessage.getMessageIds(String(chatId), commandType);
                if (oldMessageIds && oldMessageIds.length > 0) {
                    console.log(`[TelegramBot] Tìm thấy ${oldMessageIds.length} tin nhắn cũ cần xóa cho ${commandType}:`, oldMessageIds);
                    // Xóa tất cả tin nhắn cũ
                    for (const oldMessageId of oldMessageIds) {
                        try {
                            await ctx.telegram.deleteMessage(chatId, oldMessageId);
                        } catch (e) {
                            // Ignore nếu không xóa được (quá cũ > 48h)
                        }
                    }
                }
            } catch (error) {
                console.error(`[TelegramBot] Lỗi khi xóa tin nhắn cũ cho ${commandType}:`, error);
            }
        }

        const imageBuffer = await thongKeDacBietImageGenerator.generateImage();
        if (loadingMessage && chatId) {
            try {
                await ctx.telegram.deleteMessage(chatId, loadingMessage.message_id);
            } catch (e) {
                // Ignore nếu không xóa được
            }
        }
        console.log('[TelegramBot] Đã generate hình ảnh thống kê đặc biệt thành công, kích thước:', imageBuffer.length, 'bytes');

        const todayStr = new Date().toLocaleDateString('vi-VN');
        const caption = `Thống Kê Đặc Biệt - ${todayStr}`;

        const sentMessage = await ctx.replyWithPhoto(
            { source: imageBuffer },
            { caption }
        );

        // Lưu message ID mới vào database
        if (chatId && sentMessage && sentMessage.message_id) {
            try {
                const messageIds = [sentMessage.message_id];
                await TelegramCommandMessage.saveMessageIds(String(chatId), commandType, messageIds);
                console.log(`[TelegramBot] Đã lưu ${messageIds.length} message ID(s) mới cho ${commandType}:`, messageIds);
            } catch (error) {
                console.error(`[TelegramBot] Lỗi khi lưu message IDs vào database:`, error);
            }
        }

        return sentMessage;
    } catch (imageError) {
        console.error('[TelegramBot] Lỗi generate hình ảnh thống kê đặc biệt:', imageError);
        console.error('[TelegramBot] Stack trace:', imageError.stack);
        throw imageError;
    }
}

async function sendThongKeBoAsImage(ctx, { loadingMessage } = {}) {
    console.log('[TelegramBot] Đang generate hình ảnh thống kê bộ số...');
    const chatId = ctx.chat?.id;
    const commandType = 'thongke_bo';

    try {
        // Xóa tin nhắn cũ trước khi generate ảnh mới (nếu có)
        if (chatId) {
            try {
                // Lấy message IDs cũ từ database
                const oldMessageIds = await TelegramCommandMessage.getMessageIds(String(chatId), commandType);
                if (oldMessageIds && oldMessageIds.length > 0) {
                    console.log(`[TelegramBot] Tìm thấy ${oldMessageIds.length} tin nhắn cũ cần xóa cho ${commandType}:`, oldMessageIds);
                    // Xóa tất cả tin nhắn cũ
                    for (const oldMessageId of oldMessageIds) {
                        try {
                            await ctx.telegram.deleteMessage(chatId, oldMessageId);
                        } catch (e) {
                            // Ignore nếu không xóa được (quá cũ > 48h)
                        }
                    }
                }
            } catch (error) {
                console.error(`[TelegramBot] Lỗi khi xóa tin nhắn cũ cho ${commandType}:`, error);
            }
        }

        const data = await thongKeBoImageGenerator.getStatsData();
        const imageBuffer = await thongKeBoImageGenerator.generateImage(data);
        if (loadingMessage && chatId) {
            try {
                await ctx.telegram.deleteMessage(chatId, loadingMessage.message_id);
            } catch (e) {
                // Ignore nếu không xóa được
            }
        }
        console.log('[TelegramBot] Đã generate hình ảnh thống kê bộ số thành công, kích thước:', imageBuffer.length, 'bytes');

        const todayStr = new Date().toLocaleDateString('vi-VN');
        const caption = `Thống Kê Bộ Số - ${todayStr}`;

        const sentMessage = await ctx.replyWithPhoto(
            { source: imageBuffer },
            { caption }
        );

        // Lưu message ID mới vào database
        if (chatId && sentMessage && sentMessage.message_id) {
            try {
                const messageIds = [sentMessage.message_id];
                await TelegramCommandMessage.saveMessageIds(String(chatId), commandType, messageIds);
                console.log(`[TelegramBot] Đã lưu ${messageIds.length} message ID(s) mới cho ${commandType}:`, messageIds);
            } catch (error) {
                console.error(`[TelegramBot] Lỗi khi lưu message IDs vào database:`, error);
            }
        }

        return sentMessage;
    } catch (imageError) {
        console.error('[TelegramBot] Lỗi generate hình ảnh thống kê bộ số:', imageError);
        console.error('[TelegramBot] Stack trace:', imageError.stack);
        if (loadingMessage && chatId) {
            try {
                await ctx.telegram.deleteMessage(chatId, loadingMessage.message_id);
            } catch (e) {
                // Ignore nếu không xóa được
            }
        }

        // Lưu error message ID nếu có
        try {
            const errorMsg = await ctx.reply('❌ Có lỗi xảy ra khi tạo ảnh thống kê bộ số, vui lòng thử lại sau.');
            if (chatId && errorMsg && errorMsg.message_id) {
                const messageIds = [errorMsg.message_id];
                await TelegramCommandMessage.saveMessageIds(String(chatId), commandType, messageIds);
            }
        } catch (error) {
            console.error('[TelegramBot] Lỗi khi gửi error message:', error);
        }

        throw imageError;
    }
}

async function sendThongKeDauDuoiAsImage(ctx, { loadingMessage } = {}) {
    console.log('[TelegramBot] Đang generate hình ảnh thống kê đầu đuôi...');
    const chatId = ctx.chat?.id;
    const commandType = 'thongke_dauduoi';

    try {
        // Xóa tin nhắn cũ trước khi generate ảnh mới (nếu có)
        if (chatId) {
            try {
                // Lấy message IDs cũ từ database
                const oldMessageIds = await TelegramCommandMessage.getMessageIds(String(chatId), commandType);
                if (oldMessageIds && oldMessageIds.length > 0) {
                    console.log(`[TelegramBot] Tìm thấy ${oldMessageIds.length} tin nhắn cũ cần xóa cho ${commandType}:`, oldMessageIds);
                    // Xóa tất cả tin nhắn cũ
                    for (const oldMessageId of oldMessageIds) {
                        try {
                            await ctx.telegram.deleteMessage(chatId, oldMessageId);
                        } catch (e) {
                            // Ignore nếu không xóa được (quá cũ > 48h)
                        }
                    }
                }
            } catch (error) {
                console.error(`[TelegramBot] Lỗi khi xóa tin nhắn cũ cho ${commandType}:`, error);
            }
        }

        const data = await thongKeDauDuoiImageGenerator.getStatsData();
        const imageBuffer = await thongKeDauDuoiImageGenerator.generateImage(data);
        if (loadingMessage && chatId) {
            try {
                await ctx.telegram.deleteMessage(chatId, loadingMessage.message_id);
            } catch (e) {
                // Ignore nếu không xóa được
            }
        }
        console.log('[TelegramBot] Đã generate hình ảnh thống kê đầu đuôi thành công, kích thước:', imageBuffer.length, 'bytes');

        const todayStr = new Date().toLocaleDateString('vi-VN');
        const caption = `Thống Kê Đầu Đuôi - ${todayStr}`;

        const sentMessage = await ctx.replyWithPhoto(
            { source: imageBuffer },
            { caption }
        );

        // Lưu message ID mới vào database
        if (chatId && sentMessage && sentMessage.message_id) {
            try {
                const messageIds = [sentMessage.message_id];
                await TelegramCommandMessage.saveMessageIds(String(chatId), commandType, messageIds);
                console.log(`[TelegramBot] Đã lưu ${messageIds.length} message ID(s) mới cho ${commandType}:`, messageIds);
            } catch (error) {
                console.error(`[TelegramBot] Lỗi khi lưu message IDs vào database:`, error);
            }
        }

        return sentMessage;
    } catch (imageError) {
        console.error('[TelegramBot] Lỗi generate hình ảnh thống kê đầu đuôi:', imageError);
        console.error('[TelegramBot] Stack trace:', imageError.stack);
        if (loadingMessage && chatId) {
            try {
                await ctx.telegram.deleteMessage(chatId, loadingMessage.message_id);
            } catch (e) {
                // Ignore nếu không xóa được
            }
        }

        // Lưu error message ID nếu có
        try {
            const errorMsg = await ctx.reply('❌ Có lỗi xảy ra khi tạo ảnh thống kê đầu đuôi, vui lòng thử lại sau.');
            if (chatId && errorMsg && errorMsg.message_id) {
                const messageIds = [errorMsg.message_id];
                await TelegramCommandMessage.saveMessageIds(String(chatId), commandType, messageIds);
            }
        } catch (error) {
            console.error('[TelegramBot] Lỗi khi gửi error message:', error);
        }

        throw imageError;
    }
}

async function replyWithResult(ctx, fetcher) {
    const chatId = ctx.chat?.id;
    const commandType = 'xsmb';
    const key = chatId ? `${chatId}:${commandType}` : null;

    // Xóa các tin nhắn cũ của lệnh /xsmb
    if (key) {
        const oldMessageIds = commandMessageIds.get(key) || [];
        const failedToDelete = [];

        for (const oldMessageId of oldMessageIds) {
            try {
                await ctx.telegram.deleteMessage(chatId, oldMessageId);
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
                    console.log(`[TelegramBot] Loại bỏ message ID ${oldMessageId} khỏi danh sách (không thể xóa): ${errorMessage}`);
                } else {
                    console.log(`[TelegramBot] Không thể xóa tin nhắn cũ ${oldMessageId}: ${errorMessage}`);
                }
            }
        }

        if (failedToDelete.length > 0) {
            console.log(`[TelegramBot] Đã loại bỏ ${failedToDelete.length} message ID(s) không thể xóa được cho ${commandType}`);
        }
    }

    let loadingMessage = null;
    const messageIds = [];

    try {
        // Gửi thông báo loading ngay khi bắt đầu
        try {
            loadingMessage = await ctx.reply('⏳ Đang tải kết quả xổ số...');
            if (loadingMessage && loadingMessage.message_id) {
                messageIds.push(loadingMessage.message_id);
            }
        } catch (e) {
            // Nếu không gửi được loading message, tiếp tục xử lý bình thường
            console.warn('[TelegramBot] Không thể gửi loading message:', e.message);
        }

        const doc = await fetcher();
        if (!doc) {
            // Xóa thông báo loading nếu có lỗi
            try {
                if (loadingMessage) {
                    const loadingMsgId = loadingMessage.message_id;
                    await ctx.telegram.deleteMessage(ctx.chat.id, loadingMsgId);
                    // Loại bỏ loading message ID khỏi array vì đã xóa
                    const loadingIndex = messageIds.indexOf(loadingMsgId);
                    if (loadingIndex > -1) {
                        messageIds.splice(loadingIndex, 1);
                    }
                    loadingMessage = null;
                }
            } catch (e) {
                // Ignore nếu không xóa được
            }
            const errorMsg = await ctx.reply('❌ Không tìm thấy dữ liệu.');
            if (key && errorMsg && errorMsg.message_id) {
                // Lưu error message ID (không lưu loading message vì đã xóa)
                const messageIds = [errorMsg.message_id];
                commandMessageIds.set(key, messageIds);
                // Lưu vào database để persist qua server restart
                try {
                    await TelegramCommandMessage.saveMessageIds(String(chatId), commandType, messageIds);
                } catch (error) {
                    console.error(`[TelegramBot] Lỗi khi lưu message IDs vào database:`, error);
                }
            }
            return errorMsg;
        }

        const currentLoading = loadingMessage;
        loadingMessage = null;
        const response = await sendXsmbDocAsImage(ctx, doc, { loadingMessage: currentLoading });

        // Lưu message_id của hình ảnh (không lưu loading message vì đã bị xóa bởi sendXsmbDocAsImage)
        if (key && response && response.message_id) {
            // Chỉ lưu result message ID, không lưu loading message ID vì nó đã bị xóa
            const messageIds = [response.message_id];
            commandMessageIds.set(key, messageIds);
            // Lưu vào database để persist qua server restart
            try {
                await TelegramCommandMessage.saveMessageIds(String(chatId), commandType, messageIds);
            } catch (error) {
                console.error(`[TelegramBot] Lỗi khi lưu message IDs vào database:`, error);
            }
        }

        if (predictionHandlersInstance) {
            try {
                await predictionHandlersInstance.maybeAnnounceResult(ctx, doc);
            } catch (predictionError) {
                console.error('[TelegramBot] Lỗi gửi tổng hợp dự đoán:', predictionError);
            }
        }

        return response;
    } catch (error) {
        console.error('[TelegramBot] Lỗi xử lý kết quả:', error);

        // Xử lý migrate chat_id
        const migratedChatId = handleChatMigration(error, chatId);
        if (migratedChatId) {
            // Retry với chat_id mới
            try {
                const newCtx = createCtxForChat(ctx.telegram, migratedChatId);
                return await replyWithResult(newCtx, fetcher);
            } catch (retryError) {
                console.error(`[TelegramBot] Lỗi khi retry với chat_id mới ${migratedChatId}:`, retryError);
            }
        }

        // Xóa thông báo loading nếu có lỗi
        try {
            if (loadingMessage) {
                await ctx.telegram.deleteMessage(ctx.chat.id, loadingMessage.message_id);
            }
        } catch (e) {
            // Ignore nếu không xóa được
        }

        // Sử dụng chat_id đã migrate nếu có
        const actualChatId = migratedChatId || chatId;
        let errorMsg;
        try {
            errorMsg = await ctx.reply('❌ Có lỗi xảy ra, vui lòng thử lại sau.');
        } catch (replyError) {
            // Nếu không gửi được với ctx cũ, thử với chat_id mới
            if (migratedChatId) {
                try {
                    const newCtx = createCtxForChat(ctx.telegram, migratedChatId);
                    errorMsg = await newCtx.reply('❌ Có lỗi xảy ra, vui lòng thử lại sau.');
                } catch (e) {
                    console.error(`[TelegramBot] Không thể gửi error message:`, e);
                }
            }
        }
        // Lưu error message ID để lần sau có thể xóa được
        if (key && errorMsg && errorMsg.message_id) {
            const messageIds = [errorMsg.message_id];
            commandMessageIds.set(key, messageIds);
            // Lưu vào database để persist qua server restart
            try {
                await TelegramCommandMessage.saveMessageIds(String(chatId), commandType, messageIds);
            } catch (error) {
                console.error(`[TelegramBot] Lỗi khi lưu message IDs vào database:`, error);
            }
        }
        return errorMsg;
    }
}

// Format thống kê Loto (lô gan, tần suất)
async function formatThongKeLoto() {
    try {
        const todayStr = new Date().toLocaleDateString('vi-VN');
        const lines = [`<b>THỐNG KÊ LOTO NGÀY ${todayStr}</b>`, ''];

        // Lấy dữ liệu lô gan từ database (60 ngày)
        const filterType = '60';
        const dbLoGan = await LoGanStats.findOne({ filterType });
        const loGanStats = dbLoGan?.statistics || [];
        const loGanTop = loGanStats
            .sort((a, b) => (b?.gapDraws || 0) - (a?.gapDraws || 0))
            .slice(0, 30)
            .map(item => ({
                number: String(item.number).padStart(2, '0'),
                days: item.gapDraws
            }));

        // Lấy dữ liệu tần suất từ database (30 ngày)
        const dbTanSuat = await TanSuatLotoStats.findOne({ days: 30 });
        const tanSuatStats = dbTanSuat?.statistics || [];
        const tanSuatTop = tanSuatStats
            .sort((a, b) => (b?.count || 0) - (a?.count || 0))
            .slice(0, 30)
            .map(item => ({
                number: String(item.number).padStart(2, '0'),
                count: item.count
            }));

        // Format Lô gan (2 cột, giống đặc biệt)
        if (loGanTop.length > 0) {
            lines.push('<b>📊 Lotto lâu chưa ra (lô gan):</b>');
            const ganGroups = [];
            for (let i = 0; i < loGanTop.length; i += 2) {
                ganGroups.push(loGanTop.slice(i, i + 2));
            }
            const ganLines = [];
            ganGroups.forEach((group) => {
                const groupStr = group.map(item => {
                    const daysStr = String(item.days).padStart(2, ' ');
                    return `<b>${item.number}(${daysStr} ngày)</b>`;
                }).join('    '); // 4 spaces
                ganLines.push(groupStr);
            });
            // Wrap trong blockquote
            lines.push(`<blockquote>${ganLines.join('\n')}</blockquote>`);
        }

        // Format Tần suất (2 cột, giống đặc biệt)
        if (tanSuatTop.length > 0) {
            lines.push('');
            lines.push('<b>📈 Lotto ra nhiều trong 30 ngày:</b>');
            const tsGroups = [];
            for (let i = 0; i < tanSuatTop.length; i += 2) {
                tsGroups.push(tanSuatTop.slice(i, i + 2));
            }
            const tsLines = [];
            tsGroups.forEach((group) => {
                const groupStr = group.map(item => {
                    const countStr = String(item.count).padStart(2, ' ');
                    return `<b>${item.number}(${countStr} lần)</b>`;
                }).join('    '); // 4 spaces
                tsLines.push(groupStr);
            });
            // Wrap trong blockquote
            lines.push(`<blockquote>${tsLines.join('\n')}</blockquote>`);
        }

        if (lines.length === 2) {
            return null;
        }

        return lines.join('\n');
    } catch (error) {
        console.error('[TelegramBot] Lỗi format thống kê loto:', error);
        return null;
    }
}

// Format thống kê Đặc biệt (chạm, tổng)
async function formatThongKeDacBiet() {
    try {
        const todayStr = new Date().toLocaleDateString('vi-VN');
        const lines = [`<b>THỐNG KÊ ĐẶC BIỆT NGÀY ${todayStr}</b>`, ''];

        // Lấy dữ liệu đặc biệt 365 ngày
        const dbSpecial = await GiaiDacBietStats.findOne({ days: 365 });
        const specialRecords = dbSpecial?.statistics || [];

        if (specialRecords.length === 0) {
            return null;
        }

        // Map: lastTwo => lastSeenDate (Date)
        const lastSeen = new Map();
        // Map: sumDigit(0-9) => lastSeenDate
        const sumLastSeen = new Map();
        // Map: chamDigit(0-9) => lastSeenDate
        const chamLastSeen = new Map();

        specialRecords.forEach(r => {
            if (!r?.number || !r?.drawDate) return;
            const lastTwo = String(r.number).slice(-2).padStart(2, '0');
            // drawDate có thể là Date object hoặc string
            let dateObj;
            if (r.drawDate instanceof Date) {
                dateObj = r.drawDate;
            } else {
                // Parse string date (dd/mm/yyyy hoặc ISO)
                const dateStr = String(r.drawDate);
                if (dateStr.includes('/')) {
                    const [d, m, y] = dateStr.split('/');
                    dateObj = new Date(Number(y), Number(m) - 1, Number(d));
                } else {
                    dateObj = new Date(dateStr);
                }
            }

            // Cập nhật lastSeen cho 2 số cuối
            const existed = lastSeen.get(lastTwo);
            if (!existed || dateObj > existed) {
                lastSeen.set(lastTwo, dateObj);
            }

            // Tổng: (a + b) % 10
            const a = parseInt(lastTwo[0], 10);
            const b = parseInt(lastTwo[1], 10);
            const sumDigit = (a + b) % 10;
            const sumExist = sumLastSeen.get(sumDigit);
            if (!sumExist || dateObj > sumExist) {
                sumLastSeen.set(sumDigit, dateObj);
            }

            // Chạm: mỗi chữ số có mặt trong 2 số cuối
            const digits = new Set([a, b]);
            digits.forEach(dg => {
                const chamExist = chamLastSeen.get(dg);
                if (!chamExist || dateObj > chamExist) {
                    chamLastSeen.set(dg, dateObj);
                }
            });
        });

        const today = new Date();
        const dayMs = 24 * 60 * 60 * 1000;

        // Tính gap cho đặc biệt (2 số cuối)
        const gaps = Array.from(lastSeen.entries()).map(([num, dt]) => ({
            number: num,
            days: Math.max(0, Math.round((today - dt) / dayMs))
        }));
        // Với các số không có trong 365 ngày qua, coi như >= 365 ngày
        for (let i = 0; i < 100; i++) {
            const num = String(i).padStart(2, '0');
            if (!lastSeen.has(num)) {
                gaps.push({ number: num, days: 365 });
            }
        }
        const specialGapTop = gaps.sort((a, b) => b.days - a.days).slice(0, 25);

        // Format Đặc biệt lâu chưa ra (2 cột, có khoảng trắng giữa số và "ngày")
        if (specialGapTop.length > 0) {
            lines.push('<b>🎯 Đặc biệt lâu chưa ra:</b>');
            const spGroups = [];
            for (let i = 0; i < specialGapTop.length; i += 2) {
                spGroups.push(specialGapTop.slice(i, i + 2));
            }
            const spLines = [];
            spGroups.forEach((group) => {
                const groupStr = group.map(item => {
                    const daysStr = String(item.days).padStart(3, ' ');
                    return `<b>${item.number}(${daysStr} ngày)</b>`;
                }).join('    '); // 4 spaces thay vì 2 spaces
                spLines.push(groupStr);
            });
            // Wrap trong blockquote
            lines.push(`<blockquote>${spLines.join('\n')}</blockquote>`);
        }

        // Tính tổng 0-9 gaps
        const sumGaps = [];
        for (let s = 0; s <= 9; s++) {
            const dt = sumLastSeen.get(s);
            const days = dt ? Math.max(0, Math.round((today - dt) / dayMs)) : 365;
            sumGaps.push({ sum: s, days });
        }
        sumGaps.sort((a, b) => b.days - a.days);

        // Format Tổng (2 cột)
        if (sumGaps.length > 0) {
            lines.push('');
            lines.push('<b>🔢 GAN TỔNG ĐẶC BIỆT:</b>');
            // Chia tổng thành các nhóm 2 số mỗi dòng
            const sumGroups = [];
            for (let i = 0; i < sumGaps.length; i += 2) {
                sumGroups.push(sumGaps.slice(i, i + 2));
            }
            const sumLines = [];
            sumGroups.forEach((group) => {
                const groupStr = group.map(s => {
                    const daysStr = String(s.days).padStart(2, ' ');
                    return `<b>${s.sum}(${daysStr} ngày)</b>`;
                }).join('  ');
                sumLines.push(groupStr);
            });
            // Wrap trong blockquote
            lines.push(`<blockquote>${sumLines.join('\n')}</blockquote>`);
            // Top tổng
            const topSum = sumGaps[0];
            if (topSum) {
                lines.push(`<b>Tổng ${topSum.sum} đã ${topSum.days} ngày chưa ra</b>`);
            }
        }

        // Tính chạm 0-9 gaps
        const chamGaps = [];
        for (let c = 0; c <= 9; c++) {
            const dt = chamLastSeen.get(c);
            const days = dt ? Math.max(0, Math.round((today - dt) / dayMs)) : 365;
            chamGaps.push({ cham: c, days });
        }
        chamGaps.sort((a, b) => b.days - a.days);

        // Format Chạm (2 cột)
        if (chamGaps.length > 0) {
            lines.push('');
            lines.push('<b>🎲 GAN CHẠM ĐẶC BIỆT:</b>');
            // Chia chạm thành các nhóm 2 số mỗi dòng
            const chamGroups = [];
            for (let i = 0; i < chamGaps.length; i += 2) {
                chamGroups.push(chamGaps.slice(i, i + 2));
            }
            const chamLines = [];
            chamGroups.forEach((group) => {
                const groupStr = group.map(c => {
                    const daysStr = String(c.days).padStart(2, ' ');
                    return `<b>${c.cham}(${daysStr} ngày)</b>`;
                }).join('  ');
                chamLines.push(groupStr);
            });
            // Wrap trong blockquote
            lines.push(`<blockquote>${chamLines.join('\n')}</blockquote>`);
            // Top chạm
            const topCham = chamGaps[0];
            if (topCham) {
                lines.push(`<b>Chạm ${topCham.cham} đã ${topCham.days} ngày chưa ra</b>`);
            }
        }

        if (lines.length === 2) {
            return null;
        }

        return lines.join('\n');
    } catch (error) {
        console.error('[TelegramBot] Lỗi format thống kê đặc biệt:', error);
        return null;
    }
}

module.exports = function initTelegramBot() {
    const token = process.env.TELEGRAM_BOT_TOKEN;

    if (!token) {
        console.warn('[TelegramBot] TELEGRAM_BOT_TOKEN chưa được cấu hình. Bỏ qua bot.');
        return null;
    }

    const bot = new Telegraf(token);
    const predictionHandlers = createPredictionHandlers({ xsmbModel: XSMB });
    predictionHandlersInstance = predictionHandlers;

    const extractUserIdentifiers = (user = {}) => {
        if (!user) return { username: null, displayName: null };
        const username = sanitizeUsername(user.username);
        const nameParts = [user.first_name, user.last_name]
            .filter(Boolean)
            .map(part => String(part).trim());
        const displayNameRaw = nameParts.join(' ').trim();
        const displayName = displayNameRaw || username || (user.id ? `user_${user.id}` : null);
        return { username, displayName };
    };

    // Middleware ghi nhận tương tác của user (message, reply, callback_query, reaction)
    bot.use(async (ctx, next) => {
        const chatId = ctx.chat?.id;
        const from = ctx.from;

        // Ghi nhận tương tác cho: message, callback_query, message_reaction
        if (chatId && from && !from.is_bot) {
            // Kiểm tra xem có phải là tương tác không (message, callback_query, hoặc reaction)
            const isInteraction = ctx.message || ctx.callbackQuery || ctx.update?.message_reaction;

            if (isInteraction) {
                const { username, displayName } = extractUserIdentifiers(from);
                recordInteraction({
                    chatId: String(chatId),
                    userId: String(from.id),
                    username,
                    displayName
                }).catch(error => {
                    console.error('[TelegramBot] Lỗi ghi nhận hoạt động người dùng:', error);
                });
            }
        }
        return next();
    });

    // Xử lý message_reaction riêng (reaction không có ctx.from trực tiếp)
    bot.on('message_reaction', async (ctx) => {
        const chatId = ctx.chat?.id;
        const reaction = ctx.update?.message_reaction;
        if (chatId && reaction && reaction.user && !reaction.user.is_bot) {
            const user = reaction.user;
            const { username, displayName } = extractUserIdentifiers(user);
            recordInteraction({
                chatId: String(chatId),
                userId: String(user.id),
                username,
                displayName
            }).catch(error => {
                console.error('[TelegramBot] Lỗi ghi nhận reaction:', error);
            });
        }
    });

    // Middleware đầu tiên: xử lý các lệnh text (không có dấu /) TRƯỚC KHI check quyền
    bot.use(async (ctx, next) => {
        // Kiểm tra và xóa tin nhắn spam số (chứa từ 15 cặp số 2 chữ số trở lên)
        if (ctx.message && ctx.message.text) {
            const deleted = await checkAndDeleteNumberSpamMessage(ctx);
            if (deleted) {
                return; // Dừng middleware chain nếu đã xóa tin nhắn
            }
        }

        // Xử lý tin nhắn text (không có dấu /) ngay lập tức
        if (ctx.message && ctx.message.text && !ctx.message.text.startsWith('/')) {
            const originalText = ctx.message.text; // Giữ nguyên toàn bộ text (bao gồm nhiều dòng)
            const text = originalText.trim();
            // Bỏ qua mention trong group (ví dụ: "wukong@botname") - chỉ ở dòng đầu tiên
            const firstLine = text.split('\n')[0];
            const cleanFirstLine = firstLine.replace(/@\w+/g, '').trim();

            // Xử lý "wukong"
            if (/^wukong$/i.test(cleanFirstLine)) {
                console.log('[TelegramBot] ✅ Tìm thấy "wukong" trong middleware! Chat ID:', ctx.chat?.id);
                try {
                    const keyboard = Markup.inlineKeyboard([
                        [
                            Markup.button.callback('🎯 Kết Quả XSMB Mới Nhất', 'btn_xsmb_latest'),
                            Markup.button.callback('📊 Thống Kê', 'btn_thongke')
                        ]
                    ]);
                    await ctx.reply(
                        '👋 Chào mừng! Vui lòng chọn chức năng bạn muốn sử dụng:',
                        keyboard
                    );
                    return; // Dừng middleware chain
                } catch (error) {
                    console.error('[TelegramBot] ❌ Lỗi khi hiển thị menu wukong:', error);
                }
            }

            // Xử lý "xsmb" - kết quả mới nhất hoặc theo ngày
            if (/^xsmb(\s+.*)?$/i.test(cleanFirstLine)) {
                console.log('[TelegramBot] ✅ Tìm thấy "xsmb" trong middleware! Chat ID:', ctx.chat?.id);
                try {
                    // Parse tham số ngày nếu có
                    const parts = cleanFirstLine.split(/\s+/);
                    if (parts.length > 1) {
                        const rawDate = parts.slice(1).join(' '); // Lấy tất cả phần sau "xsmb"
                        const normalizedDate = normalizeDateInput(rawDate);
                        if (normalizedDate) {
                            await replyWithResult(ctx, () => XSMB.findByDate(normalizedDate));
                        } else {
                            await replyErrorAndDeleteUserMessage(ctx, '❌ Định dạng ngày không hợp lệ. Ví dụ: xsmb 25-11 hoặc xsmb 25/11');
                        }
                    } else {
                        // Không có tham số, lấy kết quả mới nhất
                        await replyWithResult(ctx, () => XSMB.findLatest());
                    }
                    return; // Dừng middleware chain
                } catch (error) {
                    logError('xsmb middleware', error, { chatId: ctx.chat?.id });
                }
            }

            // Xử lý "tk dauduoi" hoặc "thongke dauduoi" - gửi ảnh thống kê đầu đuôi
            if (/^(tk|thongke)\s+dauduoi$/i.test(cleanFirstLine)) {
                console.log('[TelegramBot] ✅ Tìm thấy "tk dauduoi/thongke dauduoi" trong middleware! Chat ID:', ctx.chat?.id);
                let loadingMessage = null;
                try {
                    loadingMessage = await ctx.reply('⏳ Đang tải thống kê đầu đuôi...');
                } catch (e) {
                    console.warn('[TelegramBot] Không thể gửi loading message:', e.message);
                }
                try {
                    await sendThongKeDauDuoiAsImage(ctx, { loadingMessage });
                } catch (error) {
                    logTelegramError('sendThongKeDauDuoiAsImage', error, { chatId: ctx.chat?.id });
                    if (loadingMessage) {
                        try {
                            await ctx.telegram.deleteMessage(ctx.chat.id, loadingMessage.message_id);
                        } catch (e) {
                            // Ignore
                        }
                    }
                    await replyErrorAndDeleteUserMessage(ctx, '❌ Có lỗi xảy ra khi tạo ảnh thống kê đầu đuôi, vui lòng thử lại sau.');
                }
                return; // Dừng middleware chain
            }

            // Xử lý "tk bo" hoặc "thongke bo" - gửi ảnh thống kê bộ số
            if (/^(tk|thongke)\s+bo$/i.test(cleanFirstLine)) {
                console.log('[TelegramBot] ✅ Tìm thấy "tk bo/thongke bo" trong middleware! Chat ID:', ctx.chat?.id);
                let loadingMessage = null;
                try {
                    loadingMessage = await ctx.reply('⏳ Đang tải thống kê bộ số...');
                } catch (e) {
                    console.warn('[TelegramBot] Không thể gửi loading message:', e.message);
                }
                try {
                    await sendThongKeBoAsImage(ctx, { loadingMessage });
                } catch (error) {
                    logTelegramError('sendThongKeBoAsImage', error, { chatId: ctx.chat?.id });
                    if (loadingMessage) {
                        try {
                            await ctx.telegram.deleteMessage(ctx.chat.id, loadingMessage.message_id);
                        } catch (e) {
                            // Ignore
                        }
                    }
                    await replyErrorAndDeleteUserMessage(ctx, '❌ Có lỗi xảy ra khi tạo ảnh thống kê bộ số, vui lòng thử lại sau.');
                }
                return; // Dừng middleware chain
            }

            // Xử lý "tk db" hoặc "thongke db" - gửi ảnh thống kê đặc biệt
            if (/^(tk|thongke)\s+db$/i.test(cleanFirstLine)) {
                console.log('[TelegramBot] ✅ Tìm thấy "tk db/thongke db" trong middleware! Chat ID:', ctx.chat?.id);
                let loadingMessage = null;
                try {
                    loadingMessage = await ctx.reply('⏳ Đang tải thống kê đặc biệt...');
                } catch (e) {
                    console.warn('[TelegramBot] Không thể gửi loading message:', e.message);
                }
                try {
                    await sendThongKeDacBietAsImage(ctx, { loadingMessage });
                } catch (error) {
                    logTelegramError('sendThongKeDacBietAsImage', error, { chatId: ctx.chat?.id });
                    if (loadingMessage) {
                        try {
                            await ctx.telegram.deleteMessage(ctx.chat.id, loadingMessage.message_id);
                        } catch (e) {
                            // Ignore
                        }
                    }
                    await replyErrorAndDeleteUserMessage(ctx, '❌ Có lỗi xảy ra khi tạo ảnh thống kê đặc biệt, vui lòng thử lại sau.');
                }
                return; // Dừng middleware chain
            }

            // Xử lý "tk" hoặc "thongke" - gửi ảnh thống kê
            if (/^(tk|thongke)$/i.test(cleanFirstLine)) {
                console.log('[TelegramBot] ✅ Tìm thấy "tk/thongke" trong middleware! Chat ID:', ctx.chat?.id);
                let loadingMessage = null;
                try {
                    loadingMessage = await ctx.reply('⏳ Đang tải thống kê...');
                } catch (e) {
                    console.warn('[TelegramBot] Không thể gửi loading message:', e.message);
                }
                try {
                    await sendThongKeAsImage(ctx, { loadingMessage });
                } catch (error) {
                    logTelegramError('sendThongKeAsImage', error, { chatId: ctx.chat?.id });
                    if (loadingMessage) {
                        try {
                            await ctx.telegram.deleteMessage(ctx.chat.id, loadingMessage.message_id);
                        } catch (e) {
                            // Ignore
                        }
                    }
                    await replyErrorAndDeleteUserMessage(ctx, '❌ Có lỗi xảy ra khi tạo ảnh thống kê, vui lòng thử lại sau.');
                }
                return; // Dừng middleware chain
            }

            // Phát hiện lệnh gần đúng (fuzzy matching) - xử lý trước khi kiểm tra lệnh chính xác
            const fuzzyCommandPattern = /^(soica|soicauu|soicauuu|soicaau|soicaua|goiyy|goiyyy|goyi|goy)(\s+.*)?$/i;
            if (fuzzyCommandPattern.test(cleanFirstLine)) {
                console.log('[TelegramBot] ⚠️ Phát hiện lệnh gần đúng (có thể gõ sai):', cleanFirstLine);
                // Xóa tin nhắn và hướng dẫn người dùng
                await deleteUserCommandMessage(ctx);

                // Tạo user mention
                let userMention = 'Bạn';
                if (ctx.from) {
                    const userId = ctx.from.id;
                    const displayName = ctx.from.first_name || ctx.from.last_name || ctx.from.username || 'Bạn';
                    userMention = userId ? `<a href="tg://user?id=${userId}">${displayName}</a>` : displayName;
                }

                const errorMessage = `${userMention}, <b>SAI CÚ PHÁP: Lệnh không đúng.</b>\n\n` +
                    `Bạn có thể đã gõ sai lệnh. Vui lòng sử dụng:\n\n` +
                    `• <code>soicau [số] [số] ...</code> (tối thiểu 15 cặp số)\n` +
                    `• <code>goiy [số] [số] ...</code> (tối thiểu 15 cặp số)\n\n` +
                    `Ví dụ: <code>soicau 01 02 03 04 05 06 07 08 09 10 11 12 13 14 15</code>`;
                await replyAndCleanOld(ctx, 'soicau_error_sai_cu_phap_fuzzy', errorMessage, { parse_mode: 'HTML' });
                return; // Dừng middleware chain
            }

            // Xử lý "soicau" hoặc "goiy" - dự đoán (có thể có tham số và nhiều dòng)
            if (/^(soicau|goiy)(\s+.*)?$/i.test(cleanFirstLine)) {
                console.log('[TelegramBot] ✅ Tìm thấy "soicau/goiy" trong middleware! Chat ID:', ctx.chat?.id, 'First line:', cleanFirstLine);
                try {
                    // handleCommand parse args bằng cách split text và slice(1)
                    // Cần thêm dấu / vào dòng đầu tiên và giữ nguyên toàn bộ text (bao gồm các dòng sau)
                    // Ví dụ: "soicau 6 8 s\n00,01,02...\n5 8 s\n..." -> "/soicau 6 8 s\n00,01,02...\n5 8 s\n..."
                    const lines = originalText.split('\n');
                    if (lines.length > 0) {
                        // Xử lý dòng đầu tiên: thêm dấu / vào đầu (giữ nguyên mention vì có thể là tham số)
                        const firstLine = lines[0].trim();
                        lines[0] = '/' + firstLine;
                    }
                    const commandText = lines.join('\n');
                    console.log('[TelegramBot] Format command text (first 200 chars):', commandText.substring(0, 200));
                    ctx.message.text = commandText;
                    if (predictionHandlers) {
                        await predictionHandlers.handleCommand(ctx);
                    } else {
                        await replyErrorAndDeleteUserMessage(ctx, '❌ Chức năng dự đoán tạm thời không khả dụng.');
                    }
                    return; // Dừng middleware chain
                } catch (error) {
                    console.error('[TelegramBot] ❌ Lỗi khi xử lý soicau/goiy từ middleware:', error);
                    await replyErrorAndDeleteUserMessage(ctx, '❌ Có lỗi xảy ra, vui lòng thử lại sau.');
                }
            }
        }

        // Nếu không phải các lệnh text trên, tiếp tục với middleware tiếp theo
        return next();
    });

    bot.use(async (ctx, next) => {
        // Debug: log tất cả tin nhắn đến
        if (ctx.message && ctx.message.text) {
            console.log('[TelegramBot] 📩 Nhận tin nhắn text:', ctx.message.text, 'Chat ID:', ctx.chat?.id);
        }

        // Check quyền - nhưng bỏ qua nếu tin nhắn có vẻ như là lệnh (để tránh báo lỗi sai)
        if (!ctx.chat || !ctx.chat.id) {
            return next();
        }

        // Kiểm tra xem tin nhắn có vẻ như là lệnh không (bắt đầu bằng / hoặc chứa từ khóa lệnh)
        const messageText = ctx.message?.text || '';
        const isLikelyCommand = messageText.startsWith('/') ||
            /^(soicau|goiy|soica|xsmb|wukong|tk|thongke|schedule|broadcast|announce|inactive_|member_count)/i.test(messageText.trim());

        // Nếu tin nhắn có vẻ như là lệnh nhưng chat chưa được cấp quyền, bỏ qua (để các middleware khác xử lý)
        // Chỉ kiểm tra quyền cho các tin nhắn thường (không phải lệnh)
        if (!isLikelyCommand && !isChatAllowed(ctx.chat.id)) {
            console.log('[TelegramBot] Chat chưa được cấp quyền:', ctx.chat.id);
            return ctx.reply('❌ Chat này chưa được cấp quyền sử dụng bot.');
        }

        return next();
    });

    bot.use(async (ctx, next) => {
        const chatId = ctx.chat?.id;
        if (!chatId || !isControlChat(chatId)) {
            return next();
        }

        const targets = getBroadcastTargets(chatId);
        if (!targets.length) {
            return next();
        }

        const originalReply = ctx.reply?.bind(ctx);
        if (originalReply) {
            ctx.reply = async (text, options) => {
                const response = await originalReply(text, options);
                await Promise.allSettled(
                    targets.map(async (target) => {
                        // Sử dụng chat_id đã migrate nếu có
                        const actualTarget = getMigratedChatId(target);
                        
                        try {
                            await bot.telegram.sendMessage(actualTarget, text, options);
                        } catch (error) {
                            // Xử lý migrate chat_id
                            const migratedChatId = handleChatMigration(error, actualTarget);
                            if (migratedChatId) {
                                // Retry với chat_id mới
                                try {
                                    await bot.telegram.sendMessage(migratedChatId, text, options);
                                } catch (retryError) {
                                    console.error('[TelegramBot] Broadcast reply error (retry failed):', migratedChatId, retryError.message);
                                }
                            } else {
                                console.error('[TelegramBot] Broadcast reply error:', actualTarget, error.message);
                            }
                        }
                    })
                );
                return response;
            };
        }

        const originalReplyWithPhoto = ctx.replyWithPhoto?.bind(ctx);
        if (originalReplyWithPhoto) {
            ctx.replyWithPhoto = async (photo, options) => {
                const response = await originalReplyWithPhoto(photo, options);
                await Promise.allSettled(
                    targets.map(async (target) => {
                        // Sử dụng chat_id đã migrate nếu có
                        const actualTarget = getMigratedChatId(target);
                        
                        try {
                            await bot.telegram.sendPhoto(actualTarget, photo, options);
                        } catch (error) {
                            // Xử lý migrate chat_id
                            const migratedChatId = handleChatMigration(error, actualTarget);
                            if (migratedChatId) {
                                // Retry với chat_id mới
                                try {
                                    await bot.telegram.sendPhoto(migratedChatId, photo, options);
                                } catch (retryError) {
                                    console.error('[TelegramBot] Broadcast photo error (retry failed):', migratedChatId, retryError.message);
                                }
                            } else {
                                console.error('[TelegramBot] Broadcast photo error:', actualTarget, error.message);
                            }
                        }
                    })
                );
                return response;
            };
        }

        return next();
    });

    const formatMemberName = (member) => buildUserMention(member);

    // Hàm helper để tạo welcome message và keyboard
    const createWelcomeMessage = (names = 'bạn') => {
        const welcomeMessage = [
            `👋 Chào mừng ${names} gia nhập nhóm!`,
            '',
            'Tham gia chơi nạp rút mạnh ủng hộ ad xây dựng nhóm!',
            '',
            '✅ Tỷ lệ xs 3 miền = 99.5',
            '',
            '✅ Đ.ề cược tận 90s',
            '',
            '✅ Có đề live 18h25',
            '',
            '⚠️ Chơi link đại lý AD đảm bảo uy tín cho ae trong group chơi.',
            '',
            '👉Link đăng ký:https://tonngokhongwukong.vercel.app/'
        ].join('\n');

        const keyboard = Markup.inlineKeyboard([
            [
                Markup.button.callback('Kết quả XSMB', 'btn_xsmb_latest'),
                Markup.button.callback('Bộ đặc biệt gan', 'btn_xsmb_date')
            ],
            [
                Markup.button.url('Link đăng ký', 'https://tonngokhongwukong.vercel.app/'),
                Markup.button.url('Nạp rút uy tín', 'https://tonngokhongwukong.vercel.app/')
            ],
            [
                Markup.button.callback('Đề đặc biệt gan', 'btn_soicau_register'),
                Markup.button.callback('Đầu đuôi đb gan', 'btn_soicau_list')
            ]
        ]);

        return { welcomeMessage, keyboard };
    };

    // Hàm helper để hiển thị menu wukong
    const showWukongKeyboard = async (ctx) => {
        const keyboard = Markup.inlineKeyboard([
            [
                Markup.button.callback('🎯 Kết Quả XSMB Mới Nhất', 'btn_xsmb_latest'),
                Markup.button.callback('📊 Thống Kê', 'btn_thongke')
            ]
        ]);

        return await replyAndCleanOld(
            ctx,
            'wukong',
            '👋 Chào mừng! Vui lòng chọn chức năng bạn muốn sử dụng:',
            { reply_markup: keyboard.reply_markup }
        );
    };

    bot.on('new_chat_members', async (ctx) => {
        const chatId = ctx.chat?.id;
        if (!chatId || !isChatAllowed(chatId)) {
            return;
        }

        const newMembers = ctx.message?.new_chat_members || [];
        const humans = newMembers.filter(member => !member.is_bot);
        if (!humans.length) {
            return;
        }

        try {
            await upsertMembers(String(chatId), humans);
        } catch (error) {
            console.error('[TelegramBot] Lỗi lưu thông tin thành viên mới:', error.message);
        }

        const names = humans.map(formatMemberName).join(', ');
        const { welcomeMessage, keyboard } = createWelcomeMessage(names);

        try {
            // Xóa thông báo chào mừng cũ trước khi gửi thông báo mới
            const commandType = 'welcome_message';
            const key = `${chatId}:${commandType}`;

            // Lấy message IDs cũ từ database hoặc Map
            let oldMessageIds = commandMessageIds.get(key);
            if (!oldMessageIds || oldMessageIds.length === 0) {
                try {
                    oldMessageIds = await TelegramCommandMessage.getMessageIds(String(chatId), commandType);
                    if (oldMessageIds.length > 0) {
                        commandMessageIds.set(key, oldMessageIds);
                    }
                } catch (error) {
                    console.error(`[TelegramBot] Lỗi khi lấy message IDs từ database:`, error);
                    oldMessageIds = [];
                }
            }

            // Xóa các tin nhắn cũ
            if (oldMessageIds.length > 0) {
                console.log(`[TelegramBot] Xóa ${oldMessageIds.length} thông báo chào mừng cũ`);
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
                            console.log(`[TelegramBot] Không thể xóa message ID ${oldMessageId} (quá cũ): ${errorMessage}`);
                        } else {
                            console.log(`[TelegramBot] Lỗi tạm thời khi xóa message ID ${oldMessageId}: ${errorMessage}`);
                        }
                    }
                }
            }

            // Gửi thông báo chào mừng mới
            const sentMessage = await ctx.reply(welcomeMessage, keyboard);

            // Lưu message ID mới vào database và Map
            if (sentMessage && sentMessage.message_id) {
                const newMessageIds = [sentMessage.message_id];
                commandMessageIds.set(key, newMessageIds);
                try {
                    await TelegramCommandMessage.saveMessageIds(String(chatId), commandType, newMessageIds);
                } catch (error) {
                    console.error(`[TelegramBot] Lỗi khi lưu message IDs vào database:`, error);
                }
            }
        } catch (error) {
            console.error('[TelegramBot] Lỗi gửi thông báo chào mừng:', error);
        }
    });

    bot.on('left_chat_member', async (ctx) => {
        const chatId = ctx.chat?.id;
        if (!chatId || !isChatAllowed(chatId)) {
            return;
        }
        const member = ctx.message?.left_chat_member;
        if (!member) return;
        try {
            await markMemberStatus(String(chatId), String(member.id || member.userId), 'left');
        } catch (error) {
            console.error('[TelegramBot] Lỗi cập nhật trạng thái rời nhóm:', error.message);
        }
    });

    // Handler cho tin nhắn text "wukong" (không có dấu /) - PHẢI ĐẶT TRƯỚC TẤT CẢ COMMAND
    // bot.hears sẽ bắt tin nhắn text, không bắt command
    bot.hears(/^wukong$/i, async (ctx) => {
        console.log('[TelegramBot] ✅✅✅ Nhận tin nhắn "wukong" từ bot.hears. Chat ID:', ctx.chat?.id, 'Message text:', ctx.message?.text);
        try {
            return await showWukongKeyboard(ctx);
        } catch (error) {
            console.error('[TelegramBot] ❌ Lỗi khi hiển thị menu wukong:', error);
            return replyErrorAndDeleteUserMessage(ctx, '❌ Có lỗi xảy ra, vui lòng thử lại sau.');
        }
    });

    // Handler cho command /wukong - đặt sớm để đảm bảo được đăng ký
    bot.command('wukong', async (ctx) => {
        console.log('[TelegramBot] Nhận lệnh /wukong từ chat:', ctx.chat?.id);
        try {
            return await showWukongKeyboard(ctx);
        } catch (error) {
            console.error('[TelegramBot] Lỗi khi hiển thị menu wukong từ command:', error);
            return replyErrorAndDeleteUserMessage(ctx, '❌ Có lỗi xảy ra, vui lòng thử lại sau.');
        }
    });

    bot.command('start', (ctx) => {
        ctx.reply('Xin chào! Gõ /xsmb để nhận kết quả mới nhất hoặc /xsmb 25-11 để xem theo ngày.');
    });

    bot.command('help', (ctx) => {
        ctx.reply([
            '🧭 Các lệnh hỗ trợ:',
            '/xsmb - Kết quả XSMB mới nhất',
            '/xsmb DD-MM hoặc /xsmb DD/MM - Kết quả theo ngày (ví dụ: /xsmb 25-11)',
            // '/thongke hoặc /tk - Thống kê nhanh (lô gan, tần suất)', // Đã bỏ - thay thế bằng ảnh thống kê
            '/soicau - Gửi & xem dự đoán của nhóm',
            '/welcome - Gửi thông báo chào mừng'
        ].join('\n'));
    });

    // Lệnh thủ công để gửi thông báo chào mừng
    bot.command(['welcome', 'chao_mung'], async (ctx) => {
        const chatId = ctx.chat?.id;
        if (!chatId || !isChatAllowed(chatId)) {
            return;
        }

        // Lấy tên người dùng hiện tại hoặc tên từ lệnh
        const commandArgs = ctx.message.text.split(' ').slice(1);
        const names = commandArgs.length > 0
            ? commandArgs.join(' ')
            : ctx.from?.first_name || 'bạn';

        const { welcomeMessage, keyboard } = createWelcomeMessage(names);

        try {
            // Xóa thông báo chào mừng cũ trước khi gửi thông báo mới
            const commandType = 'welcome_message';
            const key = `${chatId}:${commandType}`;

            // Lấy message IDs cũ từ database hoặc Map
            let oldMessageIds = commandMessageIds.get(key);
            if (!oldMessageIds || oldMessageIds.length === 0) {
                try {
                    oldMessageIds = await TelegramCommandMessage.getMessageIds(String(chatId), commandType);
                    if (oldMessageIds.length > 0) {
                        commandMessageIds.set(key, oldMessageIds);
                    }
                } catch (error) {
                    console.error(`[TelegramBot] Lỗi khi lấy message IDs từ database:`, error);
                    oldMessageIds = [];
                }
            }

            // Xóa các tin nhắn cũ
            if (oldMessageIds.length > 0) {
                console.log(`[TelegramBot] Xóa ${oldMessageIds.length} thông báo chào mừng cũ`);
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
                            console.log(`[TelegramBot] Không thể xóa message ID ${oldMessageId} (quá cũ): ${errorMessage}`);
                        } else {
                            console.log(`[TelegramBot] Lỗi tạm thời khi xóa message ID ${oldMessageId}: ${errorMessage}`);
                        }
                    }
                }
            }

            // Gửi thông báo chào mừng mới
            const sentMessage = await ctx.reply(welcomeMessage, keyboard);

            // Lưu message ID mới vào database và Map
            if (sentMessage && sentMessage.message_id) {
                const newMessageIds = [sentMessage.message_id];
                commandMessageIds.set(key, newMessageIds);
                try {
                    await TelegramCommandMessage.saveMessageIds(String(chatId), commandType, newMessageIds);
                } catch (error) {
                    console.error(`[TelegramBot] Lỗi khi lưu message IDs vào database:`, error);
                }
            }
        } catch (error) {
            console.error('[TelegramBot] Lỗi gửi thông báo chào mừng:', error);
            await ctx.reply('❌ Có lỗi xảy ra khi gửi thông báo chào mừng.');
        }
    });

    // Đăng ký command với dấu /
    bot.command(['soicau', 'goiy'], (ctx) => predictionHandlers.handleCommand(ctx));

    // Hỗ trợ soicau không cần dấu / (phải đặt sau bot.command)
    bot.hears(/^(soicau|goiy)(\s|$)/i, (ctx) => {
        // Chuẩn hóa message text để xử lý như command
        const originalText = ctx.message?.text || '';
        // Thêm dấu / vào đầu để xử lý đúng
        ctx.message.text = '/' + originalText;
        return predictionHandlers.handleCommand(ctx);
    });

    bot.command('schedule', async (ctx) => {
        const chatId = ctx.chat?.id;
        if (!chatId) {
            return ctx.reply('❌ Không xác định được chat.');
        }

        const args = ctx.message?.text?.split(/\s+/).slice(1) || [];
        if (!args.length) {
            return ctx.reply(buildScheduleHelpText());
        }

        const firstArg = args[0].toLowerCase();

        if (firstArg === 'list') {
            const descriptions = SUPPORTED_SCHEDULE_TYPES
                .map(type => describeSchedule(chatId, type))
                .filter(Boolean);
            if (!descriptions.length) {
                return ctx.reply('ℹ️ Chưa có lịch nào được bật. Dùng /schedule 18:36 xsmb để thiết lập.');
            }
            const lines = descriptions.map(line => `• ${line}`);
            return ctx.reply(['📋 Lịch hiện tại:', ...lines].join('\n'));
        }

        if (['off', 'cancel', 'stop'].includes(firstArg)) {
            const type = (args[1]?.toLowerCase()) || 'xsmb';
            if (!SUPPORTED_SCHEDULE_TYPES.includes(type)) {
                return replyErrorAndDeleteUserMessage(ctx, '❌ Loại lịch không hợp lệ. Hiện hỗ trợ: xsmb, prediction_result, prediction_list, prediction_signup_close, prediction_stats, inactive_reminder, chuc_mung.');
            }
            const removed = cancelSchedule(chatId, type);
            return ctx.reply(
                removed
                    ? `✅ Đã tắt nhắc ${type.toUpperCase()} cho chat này.`
                    : `ℹ️ Không tìm thấy lịch ${type.toUpperCase()} nào đang bật.`
            );
        }

        if (args.length < 2) {
            return replyErrorAndDeleteUserMessage(ctx, '❌ Thiếu tham số. Ví dụ: /schedule 18:36 xsmb');
        }

        const time = parseTimeInput(firstArg);
        if (!time) {
            return ctx.reply('❌ Thời gian không hợp lệ. Vui lòng dùng định dạng HH:MM (ví dụ 18:36).');
        }

        const type = args[1].toLowerCase();
        if (!SUPPORTED_SCHEDULE_TYPES.includes(type)) {
            return ctx.reply('❌ Loại lịch không hợp lệ. Hiện hỗ trợ: xsmb, prediction_result, prediction_list, prediction_signup_close, prediction_stats, inactive_reminder, chuc_mung.');
        }

        scheduleForChat({ bot, chatId, time, type });
        const hourStr = String(time.hour).padStart(2, '0');
        const minuteStr = String(time.minute).padStart(2, '0');
        
        let additionalMessage = '';
        if (type === 'xsmb') {
            additionalMessage = '\nBot sẽ gửi hình ảnh kết quả giống lệnh /xsmb.';
        } else if (type === 'chuc_mung') {
            additionalMessage = '\nBot sẽ gửi thông báo chúc mừng với các nút đăng ký.';
        }
        
        return ctx.reply(
            `✅ Đã bật nhắc ${type.toUpperCase()} lúc ${hourStr}:${minuteStr} hằng ngày.${additionalMessage}`
        );
    });

    bot.command(['broadcast', 'announce'], async (ctx) => {
        const chatId = ctx.chat?.id;
        if (!chatId) {
            return ctx.reply('❌ Không xác định được chat.');
        }

        if (!isControlChat(chatId)) {
            return ctx.reply('❌ Bạn không có quyền sử dụng lệnh này.');
        }

        const argsText = ctx.message?.text?.split(/\s+/).slice(1).join(' ').trim();
        let payload = argsText;

        if (!payload && ctx.message?.reply_to_message) {
            payload = ctx.message.reply_to_message.text || ctx.message.reply_to_message.caption || '';
        }

        if (!payload) {
            return ctx.reply('❌ Vui lòng nhập nội dung thông báo hoặc reply vào tin cần phát đi.');
        }

        const finalMessage = `<b>📣 THÔNG BÁO</b>\n\n${payload}`;

        try {
            const { success, failed } = await broadcastMessage(bot, chatId, finalMessage, { parse_mode: 'HTML' });
            let summary = `✅ Đã gửi thông báo đến ${success.length} chat.`;
            if (failed.length) {
                summary += `\n⚠️ Gửi thất bại ${failed.length} chat:\n` +
                    failed.map(item => `• ${item.chatId}: ${item.reason}`).join('\n');
            }
            return ctx.reply(summary);
        } catch (error) {
            console.error('[TelegramBot] ❌ Broadcast error:', error);
            return ctx.reply(`❌ Không thể gửi thông báo: ${error.message || 'Unknown error'}`);
        }
    });

    bot.command('inactive_today', async (ctx) => {
        const chatId = ctx.chat?.id;
        if (!chatId) {
            return ctx.reply('❌ Không xác định được chat.');
        }

        if (!isChatAllowed(chatId)) {
            return ctx.reply('❌ Chat này chưa được cấp quyền sử dụng bot.');
        }

        try {
            const startOfDay = getStartOfDayInTimezone(DEFAULT_SCHEDULE_TIMEZONE);
            const members = await listActiveMembers(String(chatId));
            const activities = members.length
                ? await getActivitiesForUsers(String(chatId), members.map(m => m.userId))
                : [];

            if (!members.length) {
                return ctx.reply('❌ Chưa có dữ liệu thành viên để kiểm tra. Vui lòng thêm bot và để bot ghi nhận thành viên mới.');
            }

            const activityMap = new Map();
            activities.forEach(activity => {
                activityMap.set(String(activity.userId), new Date(activity.lastInteractionAt));
            });

            const now = Date.now();
            const inactiveMembers = members.filter(member => {
                const lastInteraction = activityMap.get(String(member.userId)) || (member.lastSeenAt ? new Date(member.lastSeenAt) : null);
                if (!lastInteraction) return true;
                return lastInteraction < startOfDay;
            });

            if (!inactiveMembers.length) {
                return ctx.reply('✅ Tất cả thành viên đã tương tác kể từ 00h00 hôm nay.');
            }

            const lines = [
                '📣 <b>NHẮC THÀNH VIÊN CHƯA TƯƠNG TÁC HÔM NAY</b>',
                'Các bạn dưới đây chưa tương tác từ 00h00 hôm nay:',
                ''
            ];

            inactiveMembers.forEach((member, index) => {
                const mention = formatMemberName(member);
                const lastInteraction = activityMap.get(String(member.userId)) || (member.lastSeenAt ? new Date(member.lastSeenAt) : null);
                const lastInteractionText = lastInteraction
                    ? lastInteraction.toLocaleString('vi-VN', { timeZone: DEFAULT_SCHEDULE_TIMEZONE })
                    : 'chưa từng';
                const hours = lastInteraction
                    ? Math.max(0, ((now - lastInteraction.getTime()) / (1000 * 60 * 60))).toFixed(1)
                    : '∞';
                lines.push(`${index + 1}. ${mention} – lần cuối: ${lastInteractionText} (${hours} giờ trước)`);
            });

            lines.push(
                '',
                '🔔 Vui lòng tương tác (chat, icon hoặc đăng ký soi cầu) để xác nhận bạn vẫn hoạt động nhé!'
            );

            return await replyAndCleanOld(ctx, 'inactive_today', lines.join('\n'), { parse_mode: 'HTML' });
        } catch (error) {
            console.error('[TelegramBot] Lỗi xử lý /inactive_today:', error);
            return ctx.reply('❌ Không thể kiểm tra thành viên chưa tương tác hôm nay.');
        }
    });

    // Hỗ trợ lệnh inactive với tham số động: /inactive_5min, /inactive_50min, /inactive_5hour, etc.
    bot.hears(/^\/inactive_(\d+)(min|minute|minutes|hour|hours|h)$/i, async (ctx) => {
        const chatId = ctx.chat?.id;
        if (!chatId) {
            return ctx.reply('❌ Không xác định được chat.');
        }

        if (!isChatAllowed(chatId)) {
            return ctx.reply('❌ Chat này chưa được cấp quyền sử dụng bot.');
        }

        try {
            // Parse tham số từ tên lệnh
            const command = ctx.message.text.replace(/^\//, '').split(/\s+/)[0];
            const timeParams = parseTimeFromCommand(command);

            if (!timeParams) {
                return ctx.reply(
                    '❌ Định dạng lệnh không hợp lệ.\n\n' +
                    '📋 <b>Cách sử dụng:</b>\n' +
                    '• <code>/inactive_5min</code> - Kiểm tra 5 phút\n' +
                    '• <code>/inactive_50min</code> - Kiểm tra 50 phút\n' +
                    '• <code>/inactive_2hour</code> - Kiểm tra 2 giờ\n' +
                    '• <code>/inactive_5h</code> - Kiểm tra 5 giờ',
                    { parse_mode: 'HTML' }
                );
            }

            const { milliseconds, displayText, value, displayUnit } = timeParams;
            const thresholdDate = new Date(Date.now() - milliseconds);
            const members = await listActiveMembers(String(chatId));
            const activities = members.length
                ? await getActivitiesForUsers(String(chatId), members.map(m => m.userId))
                : [];

            if (!members.length) {
                return ctx.reply('❌ Chưa có dữ liệu thành viên để kiểm tra. Vui lòng thêm bot và để bot ghi nhận thành viên mới.');
            }

            const activityMap = new Map();
            activities.forEach(activity => {
                activityMap.set(String(activity.userId), new Date(activity.lastInteractionAt));
            });

            const now = Date.now();
            const inactiveMembers = members.filter(member => {
                const lastInteraction = activityMap.get(String(member.userId)) || (member.lastSeenAt ? new Date(member.lastSeenAt) : null);
                if (!lastInteraction) return true;
                return lastInteraction < thresholdDate;
            });

            if (!inactiveMembers.length) {
                // Lọc ra những thành viên đã tương tác trong khoảng thời gian chỉ định
                const activeMembers = members.filter(member => {
                    const lastInteraction = activityMap.get(String(member.userId)) || (member.lastSeenAt ? new Date(member.lastSeenAt) : null);
                    if (!lastInteraction) return false;
                    return lastInteraction >= thresholdDate;
                });

                if (!activeMembers.length) {
                    return ctx.reply(`✅ Tất cả thành viên đã tương tác trong ${displayText} gần nhất.`);
                }

                const mentions = activeMembers.map(member => {
                    const mention = formatMemberName(member);
                    return mention;
                }).join(', ');

                const totalCount = activeMembers.length;
                return ctx.reply(
                    `✅ Các thành viên đã tương tác trong ${displayText}:\n` +
                    `<b>Tổng số: ${totalCount} thành viên</b>\n\n` +
                    `${mentions}`,
                    { parse_mode: 'HTML' }
                );
            }

            // Tính toán thời gian hiển thị phù hợp
            const timeLabel = displayUnit === 'giờ' ? 'GIỜ' : 'PHÚT';
            const totalInactive = inactiveMembers.length;
            const lines = [
                `📣 <b>NHẮC THÀNH VIÊN CHƯA TƯƠNG TÁC TRONG ${value} ${timeLabel} GẦN NHẤT</b>`,
                `Các bạn dưới đây chưa tương tác từ ${displayText} trước:`,
                `<b>Tổng số: ${totalInactive} thành viên</b>`,
                ''
            ];

            inactiveMembers.forEach((member, index) => {
                const mention = formatMemberName(member);
                const lastInteraction = activityMap.get(String(member.userId)) || (member.lastSeenAt ? new Date(member.lastSeenAt) : null);
                const lastInteractionText = lastInteraction
                    ? lastInteraction.toLocaleString('vi-VN', { timeZone: DEFAULT_SCHEDULE_TIMEZONE })
                    : 'chưa từng';

                // Tính thời gian cách đây (theo đơn vị phù hợp)
                let timeAgo;
                if (lastInteraction) {
                    const diffMs = now - lastInteraction.getTime();
                    if (displayUnit === 'giờ') {
                        const hoursAgo = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60)));
                        timeAgo = `${hoursAgo} giờ trước`;
                    } else {
                        const minutesAgo = Math.max(0, Math.floor(diffMs / (1000 * 60)));
                        timeAgo = `${minutesAgo} phút trước`;
                    }
                } else {
                    timeAgo = '∞';
                }

                lines.push(`${index + 1}. ${mention} – lần cuối: ${lastInteractionText} (${timeAgo})`);
            });

            lines.push(
                '',
                '🔔 Vui lòng tương tác (chat, icon hoặc đăng ký soi cầu) để xác nhận bạn vẫn hoạt động nhé!'
            );

            return await replyAndCleanOld(ctx, 'inactive_dynamic', lines.join('\n'), { parse_mode: 'HTML' });
        } catch (error) {
            console.error('[TelegramBot] Lỗi xử lý /inactive_*:', error);
            return ctx.reply(`❌ Không thể kiểm tra thành viên chưa tương tác.`);
        }
    });

    bot.command('member_count', async (ctx) => {
        const chatId = ctx.chat?.id;
        if (!chatId) {
            return ctx.reply('❌ Không xác định được chat.');
        }

        if (!isChatAllowed(chatId)) {
            return ctx.reply('❌ Chat này chưa được cấp quyền sử dụng bot.');
        }

        try {
            const members = await listActiveMembers(String(chatId));
            const total = members.length;
            const humans = members.filter(member => !member.isBot).length;
            const bots = total - humans;

            const lines = [
                '<b>📊 THỐNG KÊ THÀNH VIÊN</b>',
                '',
                `• Tổng số bản ghi: <b>${total}</b>`,
                `• Tổng Thành Viên Hợp Lệ: <b>${humans}</b>`,
                `• Bot: <b>${bots}</b>`,
                ''
            ];

            if (members.length > 0) {
                lines.push('<b>📋 DANH SÁCH THÀNH VIÊN ĐƯỢC CHẤP NHẬN THÀNH CÔNG:</b>', '');
                members.forEach((member, index) => {
                    const mention = formatMemberName(member);
                    lines.push(`${index + 1}. ${mention}`);
                });
            } else {
                lines.push('<i>(Bot chỉ đếm những người đã được đồng bộ/lưu hồ sơ)</i>');
            }

            return await replyAndCleanOld(ctx, 'member_count', lines.join('\n'), { parse_mode: 'HTML' });
        } catch (error) {
            console.error('[TelegramBot] Lỗi xử lý /member_count:', error);
            return ctx.reply('❌ Không thể lấy danh sách thành viên.');
        }
    });

    bot.command('xsmb', (ctx) => {
        const parts = ctx.message.text.split(' ');
        // Nếu có tham số ngày
        if (parts.length > 1) {
            const rawDate = parts.slice(1).join(' '); // Lấy tất cả phần sau lệnh
            const normalizedDate = normalizeDateInput(rawDate);
            if (!normalizedDate) {
                return ctx.reply('❌ Định dạng ngày không hợp lệ. Ví dụ: /xsmb 25-11 hoặc /xsmb 25/11');
            }
            return replyWithResult(ctx, () => XSMB.findByDate(normalizedDate));
        }
        // Nếu không có tham số, lấy kết quả mới nhất
        return replyWithResult(ctx, () => XSMB.findLatest());
    });

    // Lệnh xsmb10 đã bị vô hiệu hóa
    // bot.command('xsmb10', async (ctx) => {
    //     try {
    //         const docs = await XSMB.find({ station: 'xsmb' })
    //             .sort({ drawDate: -1 })
    //             .limit(10)
    //             .lean();
    //
    //         if (!docs.length) {
    //             return ctx.reply('❌ Không có dữ liệu.');
    //         }
    //
    //         // Với 10 kỳ, gửi từng kỳ một để tránh tin nhắn quá dài
    //         for (const doc of docs) {
    //             await sendXsmbDocAsImage(ctx, doc);
    //         }
    //     } catch (error) {
    //         console.error('[TelegramBot] Lỗi xử lý /xsmb10:', error);
    //         return ctx.reply('❌ Có lỗi xảy ra, vui lòng thử lại sau.');
    //     }
    // });

    // Lệnh thống kê nhanh - gửi ảnh thống kê
    bot.command(['thongke', 'tk'], async (ctx) => {
        const commandText = ctx.message.text.trim().toLowerCase();

        // Kiểm tra nếu là lệnh "tk dauduoi" hoặc "thongke dauduoi"
        if (commandText === '/tk dauduoi' || commandText === '/thongke dauduoi' ||
            commandText === 'tk dauduoi' || commandText === 'thongke dauduoi') {
            let loadingMessage = null;
            try {
                loadingMessage = await ctx.reply('⏳ Đang tải thống kê đầu đuôi...');
            } catch (e) {
                console.warn('[TelegramBot] Không thể gửi loading message:', e.message);
            }
            try {
                await sendThongKeDauDuoiAsImage(ctx, { loadingMessage });
            } catch (error) {
                logTelegramError('sendThongKeDauDuoiAsImage', error, { chatId: ctx.chat?.id });
                if (loadingMessage) {
                    try {
                        await ctx.telegram.deleteMessage(ctx.chat.id, loadingMessage.message_id);
                    } catch (e) {
                        // Ignore
                    }
                }
                await ctx.reply('❌ Có lỗi xảy ra khi tạo ảnh thống kê đầu đuôi, vui lòng thử lại sau.');
            }
            return;
        }

        // Kiểm tra nếu là lệnh "tk bo" hoặc "thongke bo"
        if (commandText === '/tk bo' || commandText === '/thongke bo' ||
            commandText === 'tk bo' || commandText === 'thongke bo') {
            let loadingMessage = null;
            try {
                loadingMessage = await ctx.reply('⏳ Đang tải thống kê bộ số...');
            } catch (e) {
                console.warn('[TelegramBot] Không thể gửi loading message:', e.message);
            }
            try {
                await sendThongKeBoAsImage(ctx, { loadingMessage });
            } catch (error) {
                logTelegramError('sendThongKeBoAsImage', error, { chatId: ctx.chat?.id });
                if (loadingMessage) {
                    try {
                        await ctx.telegram.deleteMessage(ctx.chat.id, loadingMessage.message_id);
                    } catch (e) {
                        // Ignore
                    }
                }
                await ctx.reply('❌ Có lỗi xảy ra khi tạo ảnh thống kê bộ số, vui lòng thử lại sau.');
            }
            return;
        }

        // Kiểm tra nếu là lệnh "tk db" hoặc "thongke db"
        if (commandText === '/tk db' || commandText === '/thongke db' ||
            commandText === 'tk db' || commandText === 'thongke db') {
            let loadingMessage = null;
            try {
                loadingMessage = await ctx.reply('⏳ Đang tải thống kê đặc biệt...');
            } catch (e) {
                console.warn('[TelegramBot] Không thể gửi loading message:', e.message);
            }
            try {
                await sendThongKeDacBietAsImage(ctx, { loadingMessage });
            } catch (error) {
                logTelegramError('sendThongKeDacBietAsImage', error, { chatId: ctx.chat?.id });
                if (loadingMessage) {
                    try {
                        await ctx.telegram.deleteMessage(ctx.chat.id, loadingMessage.message_id);
                    } catch (e) {
                        // Ignore
                    }
                }
                await ctx.reply('❌ Có lỗi xảy ra khi tạo ảnh thống kê đặc biệt, vui lòng thử lại sau.');
            }
            return;
        }

        // Lệnh tk/thongke thông thường
        let loadingMessage = null;
        try {
            loadingMessage = await ctx.reply('⏳ Đang tải thống kê...');
        } catch (e) {
            console.warn('[TelegramBot] Không thể gửi loading message:', e.message);
        }
        try {
            await sendThongKeAsImage(ctx, { loadingMessage });
        } catch (error) {
            logTelegramError('sendThongKeAsImage', error, { chatId: ctx.chat?.id });
            if (loadingMessage) {
                try {
                    await ctx.telegram.deleteMessage(ctx.chat.id, loadingMessage.message_id);
                } catch (e) {
                    // Ignore
                }
            }
            await ctx.reply('❌ Có lỗi xảy ra khi tạo ảnh thống kê, vui lòng thử lại sau.');
        }
    });



    // Handler cho callback query (khi người dùng click vào button)
    bot.action('btn_xsmb_latest', async (ctx) => {
        // Trả lời callback để xóa loading indicator
        await ctx.answerCbQuery('Đang tải kết quả XSMB...');

        // Gọi hàm replyWithResult
        await replyWithResult(ctx, () => XSMB.findLatest());
    });

    // Button thống kê - đã bỏ (thay thế bằng ảnh thống kê)
    // bot.action('btn_thongke', async (ctx) => {
    //     // Trả lời callback để xóa loading indicator
    //     await ctx.answerCbQuery('Đang tải thống kê...');
    //
    //     let loadingMessage = null;
    //     try {
    //         // Gửi thông báo loading
    //         try {
    //             loadingMessage = await ctx.reply('⏳ Đang tải thống kê...');
    //         } catch (e) {
    //             console.warn('[TelegramBot] Không thể gửi loading message:', e.message);
    //         }
    //
    //         // Parallelize các queries độc lập để tăng hiệu suất
    //         const [lotoResult, dacBietResult] = await Promise.all([
    //             formatThongKeLoto().catch(error => {
    //                 logError('formatThongKeLoto', error, { chatId: ctx.chat?.id });
    //                 return null;
    //             }),
    //             formatThongKeDacBiet().catch(error => {
    //                 logError('formatThongKeDacBiet', error, { chatId: ctx.chat?.id });
    //                 return null;
    //             })
    //         ]);
    //
    //         // Bản 1: Thống kê Loto
    //         if (lotoResult) {
    //             await ctx.reply(lotoResult, { parse_mode: 'HTML' });
    //         } else {
    //             await ctx.reply('❌ Không có dữ liệu thống kê loto.');
    //         }
    //
    //         // Bản 2: Thống kê Đặc biệt
    //         if (dacBietResult) {
    //             await ctx.reply(dacBietResult, { parse_mode: 'HTML' });
    //         } else {
    //             await ctx.reply('❌ Không có dữ liệu thống kê đặc biệt.');
    //         }
    //
    //         // Xóa thông báo loading sau khi gửi xong kết quả
    //         if (loadingMessage) {
    //             try {
    //                 await ctx.telegram.deleteMessage(ctx.chat.id, loadingMessage.message_id);
    //             } catch (e) {
    //                 // Ignore nếu không xóa được
    //             }
    //         }
    //     } catch (error) {
    //         console.error('[TelegramBot] Lỗi xử lý thống kê từ button:', error);
    //
    //         // Xóa thông báo loading nếu có lỗi
    //         if (loadingMessage) {
    //             try {
    //                 await ctx.telegram.deleteMessage(ctx.chat.id, loadingMessage.message_id);
    //             } catch (e) {
    //                 // Ignore nếu không xóa được
    //             }
    //         }
    //
    //         await ctx.reply('❌ Có lỗi xảy ra khi lấy thống kê, vui lòng thử lại sau.');
    //     }
    // });

    // Nút btn_xsmb10 đã bị vô hiệu hóa
    // bot.action('btn_xsmb10', async (ctx) => {
    //     // Trả lời callback để xóa loading indicator
    //     await ctx.answerCbQuery('Đang tải 10 kỳ gần nhất...');
    //
    //     try {
    //         const docs = await XSMB.find({ station: 'xsmb' })
    //             .sort({ drawDate: -1 })
    //             .limit(10)
    //             .lean();
    //
    //         if (!docs.length) {
    //             return ctx.reply('❌ Không có dữ liệu.');
    //         }
    //
    //         // Với 10 kỳ, gửi từng kỳ một để tránh tin nhắn quá dài
    //         for (const doc of docs) {
    //             await sendXsmbDocAsImage(ctx, doc);
    //         }
    //     } catch (error) {
    //         console.error('[TelegramBot] Lỗi xử lý /xsmb10 từ button:', error);
    //         return ctx.reply('❌ Có lỗi xảy ra, vui lòng thử lại sau.');
    //     }
    // });

    bot.action('btn_xsmb_date', async (ctx) => {
        await ctx.answerCbQuery('Đang tải thống kê bộ số...');
        let loadingMessage = null;
        try {
            loadingMessage = await ctx.reply('⏳ Đang tải thống kê bộ số...');
        } catch (e) {
            console.warn('[TelegramBot] Không thể gửi loading message:', e.message);
        }
        try {
            await sendThongKeBoAsImage(ctx, { loadingMessage });
        } catch (error) {
            logTelegramError('sendThongKeBoAsImage', error, { chatId: ctx.chat?.id });
            if (loadingMessage) {
                try {
                    await ctx.telegram.deleteMessage(ctx.chat.id, loadingMessage.message_id);
                } catch (e) {
                    // Ignore
                }
            }
            await ctx.reply('❌ Có lỗi xảy ra khi tạo ảnh thống kê bộ số, vui lòng thử lại sau.');
        }
    });

    bot.action('btn_goiy', async (ctx) => {
        await ctx.answerCbQuery('Đang mở menu dự đoán...');
        if (predictionHandlers) {
            await predictionHandlers.handleCommand(ctx);
        } else {
            await ctx.reply('❌ Chức năng dự đoán tạm thời không khả dụng.');
        }
    });

    bot.action('btn_soicau_register', async (ctx) => {
        await ctx.answerCbQuery('Đang tải thống kê đặc biệt...');
        let loadingMessage = null;
        try {
            loadingMessage = await ctx.reply('⏳ Đang tải thống kê đặc biệt...');
        } catch (e) {
            console.warn('[TelegramBot] Không thể gửi loading message:', e.message);
        }
        try {
            await sendThongKeDacBietAsImage(ctx, { loadingMessage });
        } catch (error) {
            logTelegramError('sendThongKeDacBietAsImage', error, { chatId: ctx.chat?.id });
            if (loadingMessage) {
                try {
                    await ctx.telegram.deleteMessage(ctx.chat.id, loadingMessage.message_id);
                } catch (e) {
                    // Ignore
                }
            }
            await ctx.reply('❌ Có lỗi xảy ra khi tạo ảnh thống kê đặc biệt, vui lòng thử lại sau.');
        }
    });

    bot.action('btn_soicau_list', async (ctx) => {
        await ctx.answerCbQuery('Đang tải thống kê đầu đuôi...');
        let loadingMessage = null;
        try {
            loadingMessage = await ctx.reply('⏳ Đang tải thống kê đầu đuôi...');
        } catch (e) {
            console.warn('[TelegramBot] Không thể gửi loading message:', e.message);
        }
        try {
            await sendThongKeDauDuoiAsImage(ctx, { loadingMessage });
        } catch (error) {
            logTelegramError('sendThongKeDauDuoiAsImage', error, { chatId: ctx.chat?.id });
            if (loadingMessage) {
                try {
                    await ctx.telegram.deleteMessage(ctx.chat.id, loadingMessage.message_id);
                } catch (e) {
                    // Ignore
                }
            }
            await ctx.reply('❌ Có lỗi xảy ra khi tạo ảnh thống kê đầu đuôi, vui lòng thử lại sau.');
        }
    });

    // Bật lịch mặc định (nếu được cấu hình)
    try {
        setupDefaultSchedules(bot);
    } catch (error) {
        console.error('[TelegramBot] Không thể khởi tạo auto schedule mặc định:', error);
    }

    // Setup Lottery Socket Client để nhận kết quả realtime
    setupLotterySocketRealtime(bot);

    // Cleanup browser khi bot shutdown
    const cleanup = async () => {
        stopAllSchedules();
        try {
            await xsmbImageGenerator.closeBrowser();
            console.log('[TelegramBot] Image generator browser closed');
        } catch (error) {
            console.error('[TelegramBot] Error closing image generator browser:', error);
        }
    };

    // Thêm cleanup handlers
    process.once('SIGINT', cleanup);
    process.once('SIGTERM', cleanup);
    process.once('exit', cleanup);

    return bot;
};



