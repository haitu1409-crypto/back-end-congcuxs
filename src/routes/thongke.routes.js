/**
 * Thống Kê Routes
 * Định nghĩa các endpoints cho chức năng thống kê 3 miền
 */

const express = require('express');
const router = express.Router();
const thongKeController = require('../controllers/thongke.controller');

// ===== Thống kê 3 miền =====
/**
 * GET /api/thongke/3-mien
 * Lấy thống kê tất cả 3 miền
 * Query params:
 * - startDate: string (YYYY-MM-DD) - Ngày bắt đầu
 * - endDate: string (YYYY-MM-DD) - Ngày kết thúc  
 * - limit: number (1-100) - Số lượng bản ghi tối đa
 */
router.get('/3-mien', thongKeController.getThongKe3Mien);

/**
 * GET /api/thongke/mien/:region
 * Lấy thống kê theo miền cụ thể
 * Params:
 * - region: string (mien-nam|mien-trung|mien-bac)
 * Query params:
 * - startDate: string (YYYY-MM-DD) - Ngày bắt đầu
 * - endDate: string (YYYY-MM-DD) - Ngày kết thúc
 * - limit: number (1-100) - Số lượng bản ghi tối đa
 */
router.get('/mien/:region', thongKeController.getThongKeoTheoMien);

/**
 * GET /api/thongke/tong-quan
 * Lấy thống kê tổng quan (chỉ summary)
 * Query params:
 * - days: number (1-30) - Số ngày gần nhất, mặc định 7
 */
router.get('/tong-quan', thongKeController.getTongQuan);

/**
 * GET /api/thongke/:date
 * Lấy dữ liệu thống kê theo ngày cụ thể
 * Params:
 * - date: string (YYYY-MM-DD) - Ngày cần lấy
 */
router.get('/:date', thongKeController.getThongKeByDate);

/**
 * PUT /api/thongke/:date
 * Cập nhật dữ liệu thống kê cho một ngày
 * Params:
 * - date: string (YYYY-MM-DD) - Ngày cần cập nhật
 * Body:
 * - mienNam: { db?: string, nhan?: string }
 * - mienTrung: { db?: string, nhan?: string }
 * - mienBac: { db?: string, nhan?: string }
 */
router.put('/:date', thongKeController.updateThongKe);

/**
 * DELETE /api/thongke/:date
 * Xóa dữ liệu thống kê theo ngày
 * Params:
 * - date: string (YYYY-MM-DD) - Ngày cần xóa
 */
router.delete('/:date', thongKeController.deleteThongKe);

/**
 * POST /api/thongke/save
 * Lưu dữ liệu thống kê với xác thực đơn giản
 * Body:
 * - username: string - Tên tài khoản
 * - password: string - Mật khẩu 6 số
 * - data: object - Dữ liệu thống kê
 * - userDisplayName: string - Tên hiển thị
 */
router.post('/save', thongKeController.saveStatistics);

/**
 * POST /api/thongke/load
 * Tải dữ liệu thống kê đã lưu
 * Body:
 * - username: string - Tên tài khoản
 * - password: string - Mật khẩu 6 số
 */
router.post('/load', thongKeController.loadStatistics);

module.exports = router;
