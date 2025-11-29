const PredictionScore = require('../models/predictionScore.model');

async function applyScoreChange({ chatId, userId, username, displayName, delta, reason, label, normalizedDate }) {
    if (!chatId || !userId || !delta || !normalizedDate) {
        return null;
    }

    // Kiểm tra xem đã có history entry cho normalizedDate này chưa
    // Nếu đã có thì không chấm điểm lại (tránh trùng lặp)
    const existingScore = await PredictionScore.findOne({ chatId, userId }).lean();
    if (existingScore && Array.isArray(existingScore.history)) {
        const hasExistingEntry = existingScore.history.some(
            entry => entry.normalizedDate === normalizedDate
        );
        if (hasExistingEntry) {
            // Đã chấm điểm cho ngày này rồi, không chấm lại
            return existingScore;
        }
    }

    const update = {
        $inc: { points: delta },
        $setOnInsert: {
            chatId,
            userId
        }
    };

    if (username || displayName) {
        update.$set = {};
        if (username) {
            update.$set.username = username;
        }
        if (displayName) {
            update.$set.displayName = displayName;
        }
    }

    update.$push = {
        history: {
            $each: [{
                delta,
                reason,
                label,
                normalizedDate,
                createdAt: new Date()
            }],
            $slice: -50
        }
    };

    return PredictionScore.findOneAndUpdate(
        { chatId, userId },
        update,
        {
            new: true,
            upsert: true
        }
    );
}

async function getScoreboard(chatId, limit = 20) {
    if (!chatId) return [];
    return PredictionScore.find({ chatId })
        .sort({ points: -1 })
        .limit(limit)
        .lean();
}

module.exports = {
    applyScoreChange,
    getScoreboard
};

