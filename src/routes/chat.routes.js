/**
 * Chat Routes - API endpoints cho chat
 */

const express = require('express');
const {
    getGroupchatRoom,
    getPrivateChatWithAdmin,
    getMessages,
    getMyChatRooms,
    markAsRead,
    getUnreadCount,
    verifyChatCode,
    checkChatAccess,
    toggleReaction,
    deleteMessages,
    deleteMessage,
    editMessage,
    createPrivateChat,
    getPrivateChatsUnreadCounts
} = require('../controllers/chat.controller');
const { verifyToken } = require('../middleware/auth.middleware');

const router = express.Router();

// Import mark as read limiter from server.js (passed via app.locals or require)
let markAsReadLimiter;
try {
    // Try to get from parent app if available
    const rateLimit = require('express-rate-limit');
    markAsReadLimiter = rateLimit({
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 100000, // Very high limit for mark as read
        message: {
            error: 'Too Many Requests',
            message: 'Quá nhiều requests đánh dấu đã đọc, vui lòng thử lại sau.',
            retryAfter: Math.ceil(15 * 60 * 1000 / 1000)
        },
        standardHeaders: true,
        legacyHeaders: false,
        keyGenerator: (req) => {
            // Rate limit per user, not per IP (for mark as read)
            return req.userId || req.ip;
        }
    });
} catch (error) {
    // Fallback: no rate limiting for mark as read if can't load
    markAsReadLimiter = (req, res, next) => next();
}

// All routes require authentication
router.use(verifyToken);

// Chat access verification
router.post('/verify-code', verifyChatCode);
router.get('/check-access', checkChatAccess);

// Groupchat routes
router.get('/groupchat', getGroupchatRoom);

// Private chat routes
router.get('/private/admin', getPrivateChatWithAdmin);
router.get('/private/user/:targetUserId', getPrivateChatWithAdmin); // Admin only
router.post('/private/create', createPrivateChat); // Create or get private chat with any user
router.get('/private/unread-counts', getPrivateChatsUnreadCounts); // Get unread counts for all private chats

// Message routes
router.get('/room/:roomId/messages', getMessages);
router.post('/room/:roomId/read', markAsReadLimiter, markAsRead); // Apply special rate limiter for mark as read
router.get('/room/:roomId/unread', getUnreadCount);
router.post('/message/:messageId/reaction', toggleReaction);
router.delete('/messages', deleteMessages); // Admin only - delete multiple messages
router.delete('/message/:messageId', deleteMessage); // Delete single message (user within 5 min, admin anytime)
router.put('/message/:messageId', editMessage); // Edit message (user within 5 min, admin anytime)

// Chat rooms
router.get('/rooms', getMyChatRooms);

module.exports = router;

