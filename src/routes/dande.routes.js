/**
 * Dàn Đề Routes
 * Định nghĩa các endpoints cho chức năng tạo dàn đề
 */

const express = require('express');
const router = express.Router();
const danDeController = require('../controllers/dande.controller');
const dande2dController = require('../controllers/dande2d.controller');
const dande3d4dController = require('../controllers/dande3d4d.controller');
const dandacbietController = require('../controllers/dandacbiet.controller');

// ===== Dàn đề 9x-0x (Original) =====
/**
 * POST /api/dande/generate
 * Tạo dàn đề ngẫu nhiên 9x-0x
 * Body: { quantity: number }
 */
router.post('/generate', danDeController.generateDanDe);

/**
 * POST /api/dande/save
 * Lưu lịch sử dàn đề (optional - có thể thêm database sau)
 * Body: { levels: object, metadata: object }
 */
router.post('/save', danDeController.saveDanDe);

/**
 * GET /api/dande/stats
 * Lấy thống kê về dàn đề (optional)
 */
router.get('/stats', danDeController.getStats);

// ===== Dàn đề 2D =====
/**
 * POST /api/dande/2d
 * Tạo dàn đề 2D
 * Body: { input: string }
 */
router.post('/2d', dande2dController.generate2D);

// ===== Dàn đề 3D/4D =====
/**
 * POST /api/dande/3d
 * Tạo dàn đề 3D
 * Body: { input: string }
 */
router.post('/3d', dande3d4dController.generate3D);

/**
 * POST /api/dande/4d
 * Tạo dàn đề 4D
 * Body: { input: string }
 */
router.post('/4d', dande3d4dController.generate4D);

// ===== Dàn đề đặc biệt =====
/**
 * POST /api/dande/dacbiet/quick
 * Lấy nhanh dàn đặc biệt
 * Body: { filter: string }
 */
router.post('/dacbiet/quick', dandacbietController.getQuickDan);

/**
 * POST /api/dande/dacbiet/dau-duoi
 * Tạo dàn đầu-đuôi
 * Body: { dau, duoi, tong, them, bo }
 */
router.post('/dacbiet/dau-duoi', dandacbietController.taoDanDauDuoi);

/**
 * POST /api/dande/dacbiet/cham
 * Tạo dàn chạm
 * Body: { cham, tong, them, bo }
 */
router.post('/dacbiet/cham', dandacbietController.taoDanCham);

/**
 * POST /api/dande/dacbiet/bo
 * Tạo dàn bộ
 * Body: { bo, tong, them, boNums }
 */
router.post('/dacbiet/bo', dandacbietController.taoDanBo);

module.exports = router;

