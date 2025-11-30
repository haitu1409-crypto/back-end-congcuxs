/**
 * Script để tìm tất cả các chatId cũ trong database
 * Giúp phát hiện các chatId chưa được migrate
 */

require('dotenv').config();
const database = require('../src/config/database');
const UserPrediction = require('../src/models/userPrediction.model');
const GroupMemberActivity = require('../src/models/groupMemberActivity.model');
const TelegramGroupMember = require('../src/models/telegramGroupMember.model');
const PredictionScore = require('../src/models/predictionScore.model');
const TelegramCommandMessage = require('../src/models/telegramCommandMessage.model');

// ChatId mới (nhóm mới)
const NEW_CHAT_ID = '-1003225717094';

// Helper function để lấy distinct chatId với batch processing để tránh hết bộ nhớ
async function getDistinctChatIds(Model, modelName) {
    console.log(`🔍 Đang tìm chatId trong ${modelName}...`);
    const allChatIds = new Set();

    try {
        // Sử dụng aggregation pipeline với allowDiskUse để xử lý dữ liệu lớn
        const chatIds = await Model.aggregate([
            { $match: { chatId: { $exists: true, $ne: null } } },
            { $group: { _id: '$chatId' } },
            { $project: { _id: 0, chatId: '$_id' } }
        ]).allowDiskUse(true);

        chatIds.forEach(item => {
            const id = String(item.chatId);
            if (id !== NEW_CHAT_ID) {
                allChatIds.add(id);
            }
        });

        console.log(`   Tìm thấy ${chatIds.length} chatId trong ${modelName}`);
        return allChatIds;
    } catch (error) {
        console.error(`   ⚠️ Lỗi khi tìm chatId trong ${modelName}:`, error.message);
        // Fallback: sử dụng distinct nếu aggregation thất bại
        try {
            const chatIds = await Model.distinct('chatId');
            chatIds.forEach(id => {
                if (id !== NEW_CHAT_ID) {
                    allChatIds.add(String(id));
                }
            });
            console.log(`   Tìm thấy ${chatIds.length} chatId trong ${modelName} (fallback)`);
        } catch (fallbackError) {
            console.error(`   ❌ Lỗi fallback trong ${modelName}:`, fallbackError.message);
        }
        return allChatIds;
    }
}

async function findAllOldChatIds() {
    try {
        console.log('🔄 Đang kết nối MongoDB...');
        await database.connect();
        console.log('✅ Kết nối MongoDB thành công\n');

        const allChatIds = new Set();

        // Tìm tất cả chatId với batch processing để tránh hết bộ nhớ
        const [predictionChatIds, activityChatIds, memberChatIds, scoreChatIds, messageChatIds] = await Promise.all([
            getDistinctChatIds(UserPrediction, 'UserPrediction'),
            getDistinctChatIds(GroupMemberActivity, 'GroupMemberActivity'),
            getDistinctChatIds(TelegramGroupMember, 'TelegramGroupMember'),
            getDistinctChatIds(PredictionScore, 'PredictionScore'),
            getDistinctChatIds(TelegramCommandMessage, 'TelegramCommandMessage')
        ]);

        // Merge tất cả chatIds
        [predictionChatIds, activityChatIds, memberChatIds, scoreChatIds, messageChatIds].forEach(chatIdSet => {
            chatIdSet.forEach(id => allChatIds.add(id));
        });

        const uniqueChatIds = Array.from(allChatIds).sort();

        console.log('\n📊 TỔNG KẾT:');
        console.log(`   📦 Tổng số chatId cũ (khác ${NEW_CHAT_ID}): ${uniqueChatIds.length}`);
        console.log('\n📋 Danh sách các chatId cũ cần migrate:');
        uniqueChatIds.forEach((chatId, index) => {
            console.log(`   ${index + 1}. ${chatId}`);
        });

        // Đếm số lượng records cho mỗi chatId với batch processing
        console.log('\n📈 Số lượng records cho mỗi chatId cũ:');
        const BATCH_SIZE = 10; // Xử lý 10 chatId mỗi lần để tránh hết bộ nhớ

        for (let i = 0; i < uniqueChatIds.length; i += BATCH_SIZE) {
            const batch = uniqueChatIds.slice(i, i + BATCH_SIZE);

            // Xử lý batch song song nhưng giới hạn số lượng
            await Promise.all(batch.map(async (chatId) => {
                try {
                    const [predCount, activityCount, memberCount, scoreCount, messageCount] = await Promise.all([
                        UserPrediction.countDocuments({ chatId }),
                        GroupMemberActivity.countDocuments({ chatId }),
                        TelegramGroupMember.countDocuments({ chatId }),
                        PredictionScore.countDocuments({ chatId }),
                        TelegramCommandMessage.countDocuments({ chatId })
                    ]);

                    const total = predCount + activityCount + memberCount + scoreCount + messageCount;

                    if (total > 0) {
                        console.log(`   ${chatId}:`);
                        if (predCount > 0) console.log(`      - UserPrediction: ${predCount}`);
                        if (activityCount > 0) console.log(`      - GroupMemberActivity: ${activityCount}`);
                        if (memberCount > 0) console.log(`      - TelegramGroupMember: ${memberCount}`);
                        if (scoreCount > 0) console.log(`      - PredictionScore: ${scoreCount}`);
                        if (messageCount > 0) console.log(`      - TelegramCommandMessage: ${messageCount}`);
                        console.log(`      - Tổng: ${total} records`);
                    }
                } catch (error) {
                    console.error(`   ⚠️ Lỗi khi đếm records cho ${chatId}:`, error.message);
                }
            }));

            // Giải phóng bộ nhớ sau mỗi batch
            if (global.gc) {
                global.gc();
            }
        }

        console.log('\n💡 Để migrate, thêm các chatId trên vào OLD_CHAT_IDS trong các script migration');

    } catch (error) {
        console.error('❌ Lỗi:', error);
        throw error;
    } finally {
        await database.disconnect();
        console.log('\n🔌 Đã ngắt kết nối MongoDB');
    }
}

// Chạy script
findAllOldChatIds()
    .then(() => {
        console.log('\n✅ Script hoàn tất!');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n❌ Script thất bại:', error);
        process.exit(1);
    });


