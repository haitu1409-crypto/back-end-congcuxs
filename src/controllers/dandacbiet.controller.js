/**
 * Dàn Đặc Biệt Controller
 */

const dandacbietService = require('../services/dandacbiet.service');

/**
 * Lấy nhanh dàn đặc biệt
 */
const getQuickDan = async (req, res) => {
    try {
        const { filter } = req.body;

        if (!filter || typeof filter !== 'string') {
            return res.status(400).json({
                success: false,
                message: 'Filter không hợp lệ'
            });
        }

        const result = dandacbietService.getQuickDan(filter);

        res.status(200).json({
            success: true,
            message: 'Lấy dàn đặc biệt thành công',
            data: {
                result,
                total: result.length,
                filter
            }
        });

    } catch (error) {
        console.error('Error in getQuickDan:', error);
        res.status(400).json({
            success: false,
            message: error.message || 'Lỗi khi lấy dàn đặc biệt'
        });
    }
};

/**
 * Tạo dàn đầu-đuôi
 */
const taoDanDauDuoi = async (req, res) => {
    try {
        const { dau, duoi, tong, them, bo } = req.body;

        const result = dandacbietService.taoDanDauDuoi({
            dau, duoi, tong, them, bo
        });

        res.status(200).json({
            success: true,
            message: 'Tạo dàn đầu-đuôi thành công',
            data: {
                result,
                total: result.length
            }
        });

    } catch (error) {
        console.error('Error in taoDanDauDuoi:', error);
        res.status(400).json({
            success: false,
            message: error.message || 'Lỗi khi tạo dàn đầu-đuôi'
        });
    }
};

/**
 * Tạo dàn chạm
 */
const taoDanCham = async (req, res) => {
    try {
        const { cham, tong, them, bo } = req.body;

        const result = dandacbietService.taoDanCham({
            cham, tong, them, bo
        });

        res.status(200).json({
            success: true,
            message: 'Tạo dàn chạm thành công',
            data: {
                result,
                total: result.length
            }
        });

    } catch (error) {
        console.error('Error in taoDanCham:', error);
        res.status(400).json({
            success: false,
            message: error.message || 'Lỗi khi tạo dàn chạm'
        });
    }
};

/**
 * Tạo dàn bộ
 */
const taoDanBo = async (req, res) => {
    try {
        const { bo, tong, them, boNums } = req.body;

        const result = dandacbietService.taoDanBo({
            bo, tong, them, boNums
        });

        res.status(200).json({
            success: true,
            message: 'Tạo dàn bộ thành công',
            data: {
                result,
                total: result.length
            }
        });

    } catch (error) {
        console.error('Error in taoDanBo:', error);
        res.status(400).json({
            success: false,
            message: error.message || 'Lỗi khi tạo dàn bộ'
        });
    }
};

module.exports = {
    getQuickDan,
    taoDanDauDuoi,
    taoDanCham,
    taoDanBo
};

