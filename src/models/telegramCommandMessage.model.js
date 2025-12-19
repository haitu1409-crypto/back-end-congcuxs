/**
 * Telegram Command Message Model
 * Lưu trữ message IDs của các lệnh Telegram bot để có thể xóa tin nhắn cũ khi gọi lệnh mới
 */

const mongoose = require('mongoose');

const telegramCommandMessageSchema = new mongoose.Schema({
    chatId: {
        type: String,
        required: true,
        index: true
    },
    commandType: {
        type: String,
        required: true,
        index: true
    },
    messageIds: {
        type: [Number],
        required: true,
        default: []
    },
    lastUpdated: {
        type: Date,
        default: Date.now,
        index: true
    }
}, {
    timestamps: true
});

// Compound index để tìm nhanh theo chatId và commandType
telegramCommandMessageSchema.index({ chatId: 1, commandType: 1 }, { unique: true });

// TTL index: Tự động xóa các bản ghi cũ hơn 7 ngày (message IDs cũ hơn 48h không thể xóa được nữa)
telegramCommandMessageSchema.index({ lastUpdated: 1 }, { expireAfterSeconds: 7 * 24 * 60 * 60 });

// Static method: Lấy message IDs
telegramCommandMessageSchema.statics.getMessageIds = async function(chatId, commandType) {
    const doc = await this.findOne({ chatId: String(chatId), commandType });
    return doc ? (doc.messageIds || []) : [];
};

// Static method: Lưu message IDs
telegramCommandMessageSchema.statics.saveMessageIds = async function(chatId, commandType, messageIds) {
    if (!Array.isArray(messageIds) || messageIds.length === 0) {
        return null;
    }
    
    return this.findOneAndUpdate(
        { chatId: String(chatId), commandType },
        {
            chatId: String(chatId),
            commandType,
            messageIds: messageIds,
            lastUpdated: new Date()
        },
        { upsert: true, new: true }
    );
};

// Static method: Xóa message IDs (khi clear)
telegramCommandMessageSchema.statics.clearMessageIds = async function(chatId, commandType) {
    return this.findOneAndUpdate(
        { chatId: String(chatId), commandType },
        {
            messageIds: [],
            lastUpdated: new Date()
        },
        { upsert: true, new: true }
    );
};

module.exports = mongoose.model('TelegramCommandMessage', telegramCommandMessageSchema);










































