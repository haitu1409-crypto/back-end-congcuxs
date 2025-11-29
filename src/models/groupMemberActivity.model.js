const mongoose = require('mongoose');

const GroupMemberActivitySchema = new mongoose.Schema(
    {
        chatId: { type: String, required: true, index: true },
        userId: { type: String, required: true, index: true },
        username: { type: String },
        displayName: { type: String },
        lastInteractionAt: { type: Date, default: Date.now },
        lastReminderAt: { type: Date }
    },
    { timestamps: true }
);

GroupMemberActivitySchema.index({ chatId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model('GroupMemberActivity', GroupMemberActivitySchema);


