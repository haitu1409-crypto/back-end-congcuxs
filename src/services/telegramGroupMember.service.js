const TelegramGroupMember = require('../models/telegramGroupMember.model');

function sanitizeUsername(username) {
    if (!username) return undefined;
    return username.replace(/^@/, '');
}

function buildDisplayName(user = {}) {
    const parts = [user.first_name, user.last_name].filter(Boolean).map(p => String(p).trim());
    if (parts.length) {
        return parts.join(' ');
    }
    if (user.displayName) return user.displayName;
    if (user.username) return sanitizeUsername(user.username);
    if (user.id) return `user_${user.id}`;
    return undefined;
}

async function upsertMember({
    chatId,
    userId,
    username,
    displayName,
    firstName,
    lastName,
    isBot = false,
    status = 'active',
    joinedAt,
    lastSeenAt
}) {
    if (!chatId || !userId) return null;

    const update = {
        username: sanitizeUsername(username),
        displayName: displayName || buildDisplayName({ first_name: firstName, last_name: lastName, username }),
        firstName,
        lastName,
        isBot,
        status,
        lastSyncedAt: new Date()
    };

    if (joinedAt) update.joinedAt = joinedAt;
    if (lastSeenAt) update.lastSeenAt = lastSeenAt;

    return TelegramGroupMember.findOneAndUpdate(
        { chatId: String(chatId), userId: String(userId) },
        { $set: update, $setOnInsert: { chatId: String(chatId), userId: String(userId), joinedAt: joinedAt || new Date() } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
    );
}

async function upsertMembers(chatId, members = []) {
    if (!chatId || !members.length) return;
    await Promise.allSettled(
        members.map(member =>
            upsertMember({
                chatId,
                userId: member.id || member.userId,
                username: member.username,
                displayName: member.displayName,
                firstName: member.first_name,
                lastName: member.last_name,
                isBot: member.is_bot || member.isBot,
                status: 'active',
                joinedAt: new Date()
            })
        )
    );
}

async function markMemberStatus(chatId, userId, status = 'left') {
    if (!chatId || !userId) return;
    await TelegramGroupMember.findOneAndUpdate(
        { chatId: String(chatId), userId: String(userId) },
        { $set: { status, lastSyncedAt: new Date() } }
    );
}

async function listActiveMembers(chatId) {
    if (!chatId) return [];
    return TelegramGroupMember.find({
        chatId: String(chatId),
        status: 'active',
        isBot: { $ne: true }
    }).lean();
}

module.exports = {
    upsertMember,
    upsertMembers,
    markMemberStatus,
    listActiveMembers
};















