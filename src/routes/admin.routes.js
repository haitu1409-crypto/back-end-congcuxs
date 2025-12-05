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
const {
    getThongKeDan,
    getCaoThuList,
    saveThongKeDan,
    saveMultipleThongKeDan,
    deleteThongKeDan,
    runResult
} = require('../controllers/thongKeDan.controller');
const { verifyToken } = require('../middleware/auth.middleware');
const { requireAdmin } = require('../middleware/admin.middleware');
const { requireAdminPassword } = require('../middleware/adminPassword.middleware');

const router = express.Router();

// User management routes - require JWT token
router.use('/users', verifyToken);
router.use('/users', requireAdmin);

router.get('/users', getUsers);
router.get('/users/:userId', getUser);
router.put('/users/:userId', updateUser);
router.delete('/users/:userId', deleteUser);
router.post('/users/:userId/chat-ban', toggleChatBan);

// Thống kê dàn routes - require password authentication
router.get('/thong-ke-dan', requireAdminPassword, getThongKeDan);
router.get('/thong-ke-dan/cao-thu-list', requireAdminPassword, getCaoThuList);
router.post('/thong-ke-dan', requireAdminPassword, saveThongKeDan);
router.post('/thong-ke-dan/multiple', requireAdminPassword, saveMultipleThongKeDan);
router.delete('/thong-ke-dan/:id', requireAdminPassword, deleteThongKeDan);
router.post('/thong-ke-dan/run-result', requireAdminPassword, runResult);

module.exports = router;




























