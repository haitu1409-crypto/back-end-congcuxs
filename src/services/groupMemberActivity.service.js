const GroupMemberActivity = require('../models/groupMemberActivity.model');

async function recordInteraction({ chatId, userId, username, displayName }) {
    if (!chatId || !userId) return;

    const sanitizedUsername = username ? username.replace(/^@/, '') : undefined;
    const update = {
        chatId: String(chatId),
        userId: String(userId),
        lastInteractionAt: new Date()
    };

    if (sanitizedUsername) {
        update.username = sanitizedUsername;
    }
    if (displayName) {
        update.displayName = displayName;
    }

    await GroupMemberActivity.findOneAndUpdate(
        { chatId: String(chatId), userId: String(userId) },
        { $set: update },
        { upsert: true, new: true, setDefaultsOnInsert: true }
    );
}

async function findInactiveMembers({
    chatId,
    thresholdHours = 48,
    reminderCooldownHours = 24,
    limit = 20
}) {
    if (!chatId) return [];
    const now = Date.now();
    const thresholdDate = new Date(now - thresholdHours * 60 * 60 * 1000);
    const reminderCooldownDate = new Date(now - reminderCooldownHours * 60 * 60 * 1000);

    return GroupMemberActivity.find({
        chatId: String(chatId),
        lastInteractionAt: { $lt: thresholdDate },
        $or: [
            { lastReminderAt: { $exists: false } },
            { lastReminderAt: { $lt: reminderCooldownDate } }
        ]
    })
        .sort({ lastInteractionAt: 1 })
        .limit(limit)
        .lean();
}

async function findDailyInactiveMembers(chatId, since = null) {
    if (!chatId) return [];
    const startOfDay = since ? new Date(since) : new Date();
    startOfDay.setHours(0, 0, 0, 0);

    return GroupMemberActivity.find({
        chatId: String(chatId),
        $or: [
            { lastInteractionAt: { $exists: false } },
            { lastInteractionAt: { $lt: startOfDay } }
        ]
    })
        .sort({ lastInteractionAt: 1 })
        .lean();
}

async function markMembersReminded(ids = []) {
    if (!ids.length) return;
    await GroupMemberActivity.updateMany(
        { _id: { $in: ids } },
        { $set: { lastReminderAt: new Date() } }
    );
}

async function getActivitiesForUsers(chatId, userIds = []) {
    if (!chatId || !Array.isArray(userIds) || !userIds.length) return [];
    return GroupMemberActivity.find({
        chatId: String(chatId),
        userId: { $in: userIds.map(String) }
    }).lean();
}

async function findInactiveInMinutes(chatId, minutes = 5) {
    if (!chatId) return [];
    const now = Date.now();
    const thresholdDate = new Date(now - minutes * 60 * 1000);

    return GroupMemberActivity.find({
        chatId: String(chatId),
        $or: [
            { lastInteractionAt: { $exists: false } },
            { lastInteractionAt: { $lt: thresholdDate } }
        ]
    })
        .sort({ lastInteractionAt: 1 })
        .lean();
}

module.exports = {
    recordInteraction,
    findInactiveMembers,
    findDailyInactiveMembers,
    markMembersReminded,
    getActivitiesForUsers,
    findInactiveInMinutes
};



