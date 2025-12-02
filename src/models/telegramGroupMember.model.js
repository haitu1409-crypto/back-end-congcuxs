const mongoose = require('mongoose');

const TelegramGroupMemberSchema = new mongoose.Schema({
    chatId: { type: String, required: true, index: true },
    userId: { type: String, required: true },
    username: { type: String },
    displayName: { type: String },
    firstName: { type: String },
    lastName: { type: String },
    isBot: { type: Boolean, default: false },
    status: {
        type: String,
        enum: ['active', 'left', 'kicked'],
        default: 'active'
    },
    joinedAt: { type: Date },
    lastSeenAt: { type: Date },
    lastSyncedAt: { type: Date }
}, {
    timestamps: true
});

TelegramGroupMemberSchema.index({ chatId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model('TelegramGroupMember', TelegramGroupMemberSchema);














