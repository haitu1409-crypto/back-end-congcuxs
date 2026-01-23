/**
 * Admin Routes - API endpoints cho admin
 */

const express = require('express');
const {
    getUsers,
    getUser,
    updateUser,
    deleteUser,
    toggleChatBan
} = require('../controllers/admin.controller');
const { verifyToken } = require('../middleware/auth.middleware');
const { requireAdmin } = require('../middleware/admin.middleware');

const router = express.Router();

// User management routes - require JWT token
router.use('/users', verifyToken);
router.use('/users', requireAdmin);

router.get('/users', getUsers);
router.get('/users/:userId', getUser);
router.put('/users/:userId', updateUser);
router.delete('/users/:userId', deleteUser);
router.post('/users/:userId/chat-ban', toggleChatBan);

module.exports = router;




























