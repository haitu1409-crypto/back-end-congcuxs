/**
 * Thống Kê Controller
 * Xử lý các request liên quan đến thống kê 3 miền
 */

const thongKeService = require('../services/thongke.service');
const SavedStatistics = require('../models/savedStatistics.model');
const cacheManager = require('../utils/cache');

class ThongKeController {
    /**
     * Kiểm tra định dạng ngày hợp lệ
     * @param {string} dateString 
     * @returns {boolean}
     */
    isValidDate(dateString) {
        const regex = /^\d{4}-\d{2}-\d{2}$/;
        if (!regex.test(dateString)) return false;

        const date = new Date(dateString);
        return date instanceof Date && !isNaN(date) &&
            date.toISOString().split('T')[0] === dateString;
    }

    /**
     * Lấy thống kê 3 miền với caching
     * GET /api/thongke/3-mien
     */
    async getThongKe3Mien(req, res) {
        try {
            const { startDate, endDate, limit } = req.query;

            // Validate tham số
            if (startDate && !this.isValidDate(startDate)) {
                return res.status(400).json({
                    success: false,
                    message: 'Ngày bắt đầu không hợp lệ. Định dạng: YYYY-MM-DD'
                });
            }

            if (endDate && !this.isValidDate(endDate)) {
                return res.status(400).json({
                    success: false,
                    message: 'Ngày kết thúc không hợp lệ. Định dạng: YYYY-MM-DD'
                });
            }

            if (limit && (isNaN(limit) || limit < 1 || limit > 100)) {
                return res.status(400).json({
                    success: false,
                    message: 'Limit phải là số từ 1 đến 100'
                });
            }

            // Tạo cache key từ params
            const cacheKey = cacheManager.createKey('api_thongke_3mien', {
                startDate,
                endDate,
                limit: limit ? parseInt(limit) : undefined
            });

            // Kiểm tra cache trước
            const cached = cacheManager.get(cacheKey);
            if (cached) {
                res.setHeader('X-Cache', 'HIT');
                return res.json(cached);
            }

            const result = await thongKeService.getThongKe3Mien({
                startDate,
                endDate,
                limit: limit ? parseInt(limit) : undefined
            });

            // Cache kết quả thành công
            if (result.success) {
                cacheManager.set(cacheKey, result, 300); // Cache 5 phút
                res.setHeader('X-Cache', 'MISS');
            }

            res.json(result);
        } catch (error) {
            console.error('Lỗi trong getThongKe3Mien:', error);
            res.status(500).json({
                success: false,
                message: error.message || 'Lỗi server nội bộ'
            });
        }
    }

    /**
     * Lấy thống kê theo miền cụ thể
     * GET /api/thongke/mien/:region
     */
    async getThongKeoTheoMien(req, res) {
        try {
            const { region } = req.params;
            const { startDate, endDate, limit } = req.query;

            // Validate region
            const validRegions = ['mien-nam', 'mien-trung', 'mien-bac'];
            if (!validRegions.includes(region)) {
                return res.status(400).json({
                    success: false,
                    message: 'Miền không hợp lệ. Chỉ chấp nhận: mien-nam, mien-trung, mien-bac'
                });
            }

            // Convert URL param to service param
            const regionMap = {
                'mien-nam': 'mienNam',
                'mien-trung': 'mienTrung',
                'mien-bac': 'mienBac'
            };

            // Validate tham số khác
            if (startDate && !this.isValidDate(startDate)) {
                return res.status(400).json({
                    success: false,
                    message: 'Ngày bắt đầu không hợp lệ. Định dạng: YYYY-MM-DD'
                });
            }

            if (endDate && !this.isValidDate(endDate)) {
                return res.status(400).json({
                    success: false,
                    message: 'Ngày kết thúc không hợp lệ. Định dạng: YYYY-MM-DD'
                });
            }

            if (limit && (isNaN(limit) || limit < 1 || limit > 100)) {
                return res.status(400).json({
                    success: false,
                    message: 'Limit phải là số từ 1 đến 100'
                });
            }

            const result = await thongKeService.getThongKeoTheoMien(regionMap[region], {
                startDate,
                endDate,
                limit: limit ? parseInt(limit) : undefined
            });

            res.json(result);
        } catch (error) {
            console.error('Lỗi trong getThongKeoTheoMien:', error);
            res.status(500).json({
                success: false,
                message: error.message || 'Lỗi server nội bộ'
            });
        }
    }

    /**
     * Lấy thống kê tổng quan
     * GET /api/thongke/tong-quan
     */
    async getTongQuan(req, res) {
        try {
            const { days = 7 } = req.query;

            if (isNaN(days) || days < 1 || days > 30) {
                return res.status(400).json({
                    success: false,
                    message: 'Số ngày phải từ 1 đến 30'
                });
            }

            const endDate = new Date().toISOString().split('T')[0];
            const startDate = new Date(Date.now() - (days - 1) * 24 * 60 * 60 * 1000)
                .toISOString().split('T')[0];

            const result = await thongKeService.getThongKe3Mien({
                startDate,
                endDate,
                limit: parseInt(days)
            });

            // Trả về chỉ summary và metadata
            res.json({
                success: true,
                data: {
                    summary: result.data.summary,
                    metadata: {
                        ...result.data.metadata,
                        period: `${days} ngày gần nhất`
                    }
                }
            });
        } catch (error) {
            console.error('Lỗi trong getTongQuan:', error);
            res.status(500).json({
                success: false,
                message: error.message || 'Lỗi server nội bộ'
            });
        }
    }

    /**
     * Cập nhật dữ liệu thống kê
     * PUT /api/thongke/:date
     */
    async updateThongKe(req, res) {
        try {
            const { date } = req.params;
            const updateData = req.body;

            if (!this.isValidDate(date)) {
                return res.status(400).json({
                    success: false,
                    message: 'Ngày không hợp lệ. Định dạng: YYYY-MM-DD'
                });
            }

            const result = await thongKeService.updateThongKe(date, updateData, 'user');
            res.json(result);
        } catch (error) {
            console.error('Lỗi trong updateThongKe:', error);
            res.status(500).json({
                success: false,
                message: error.message || 'Lỗi server nội bộ'
            });
        }
    }

    /**
     * Lấy dữ liệu thống kê theo ngày
     * GET /api/thongke/:date
     */
    async getThongKeByDate(req, res) {
        try {
            const { date } = req.params;

            if (!this.isValidDate(date)) {
                return res.status(400).json({
                    success: false,
                    message: 'Ngày không hợp lệ. Định dạng: YYYY-MM-DD'
                });
            }

            const result = await thongKeService.getThongKeByDate(date);
            res.json(result);
        } catch (error) {
            console.error('Lỗi trong getThongKeByDate:', error);
            res.status(500).json({
                success: false,
                message: error.message || 'Lỗi server nội bộ'
            });
        }
    }

    /**
     * Xóa dữ liệu thống kê
     * DELETE /api/thongke/:date
     */
    async deleteThongKe(req, res) {
        try {
            const { date } = req.params;

            if (!this.isValidDate(date)) {
                return res.status(400).json({
                    success: false,
                    message: 'Ngày không hợp lệ. Định dạng: YYYY-MM-DD'
                });
            }

            const result = await thongKeService.deleteThongKe(date);
            res.json(result);
        } catch (error) {
            console.error('Lỗi trong deleteThongKe:', error);
            res.status(500).json({
                success: false,
                message: error.message || 'Lỗi server nội bộ'
            });
        }
    }

    /**
     * Lưu dữ liệu thống kê
     * POST /api/thongke/save
     */
    async saveStatistics(req, res) {
        try {
            const { username, password, data, userDisplayName } = req.body;

            // Validate input
            if (!username || !password || !data) {
                return res.status(400).json({
                    success: false,
                    message: 'Thiếu thông tin bắt buộc: username, password, data'
                });
            }

            // Validate username
            if (typeof username !== 'string' || username.trim().length === 0 || username.trim().length > 50) {
                return res.status(400).json({
                    success: false,
                    message: 'Tên tài khoản phải là chuỗi từ 1-50 ký tự'
                });
            }

            // Validate password (6 digits)
            if (!/^\d{6}$/.test(password)) {
                return res.status(400).json({
                    success: false,
                    message: 'Mật khẩu phải là 6 chữ số'
                });
            }

            // Validate userDisplayName if provided
            if (userDisplayName && (typeof userDisplayName !== 'string' || userDisplayName.length > 100)) {
                return res.status(400).json({
                    success: false,
                    message: 'Tên hiển thị không được vượt quá 100 ký tự'
                });
            }

            // Save or update statistics
            const savedData = await SavedStatistics.saveOrUpdate(
                username.trim(),
                password,
                data,
                userDisplayName || ''
            );

            res.json({
                success: true,
                message: 'Lưu dữ liệu thành công',
                data: {
                    id: savedData._id,
                    username: savedData.username,
                    savedAt: savedData.savedAt,
                    updatedAt: savedData.updatedAt
                }
            });
        } catch (error) {
            console.error('Lỗi trong saveStatistics:', error);

            // Handle duplicate key error
            if (error.code === 11000) {
                return res.status(409).json({
                    success: false,
                    message: 'Tài khoản và mật khẩu này đã tồn tại'
                });
            }

            res.status(500).json({
                success: false,
                message: error.message || 'Lỗi server nội bộ'
            });
        }
    }

    /**
     * Tải dữ liệu thống kê đã lưu
     * POST /api/thongke/load
     */
    async loadStatistics(req, res) {
        try {
            const { username, password } = req.body;

            // Validate input
            if (!username || !password) {
                return res.status(400).json({
                    success: false,
                    message: 'Thiếu thông tin bắt buộc: username, password'
                });
            }

            // Validate username
            if (typeof username !== 'string' || username.trim().length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Tên tài khoản không hợp lệ'
                });
            }

            // Validate password (6 digits)
            if (!/^\d{6}$/.test(password)) {
                return res.status(400).json({
                    success: false,
                    message: 'Mật khẩu phải là 6 chữ số'
                });
            }

            // Find saved statistics
            const savedData = await SavedStatistics.findByAuth(username.trim(), password);

            if (!savedData) {
                return res.status(404).json({
                    success: false,
                    message: 'Không tìm thấy dữ liệu với tài khoản và mật khẩu này'
                });
            }

            res.json({
                success: true,
                message: 'Tải dữ liệu thành công',
                data: {
                    data: savedData.data,
                    userDisplayName: savedData.userDisplayName,
                    savedAt: savedData.savedAt,
                    updatedAt: savedData.updatedAt
                }
            });
        } catch (error) {
            console.error('Lỗi trong loadStatistics:', error);
            res.status(500).json({
                success: false,
                message: error.message || 'Lỗi server nội bộ'
            });
        }
    }

}

const thongKeController = new ThongKeController();

// Bind all methods to preserve 'this' context
module.exports = {
    getThongKe3Mien: thongKeController.getThongKe3Mien.bind(thongKeController),
    getThongKeoTheoMien: thongKeController.getThongKeoTheoMien.bind(thongKeController),
    getTongQuan: thongKeController.getTongQuan.bind(thongKeController),
    updateThongKe: thongKeController.updateThongKe.bind(thongKeController),
    getThongKeByDate: thongKeController.getThongKeByDate.bind(thongKeController),
    deleteThongKe: thongKeController.deleteThongKe.bind(thongKeController),
    saveStatistics: thongKeController.saveStatistics.bind(thongKeController),
    loadStatistics: thongKeController.loadStatistics.bind(thongKeController)
};
