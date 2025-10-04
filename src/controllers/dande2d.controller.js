/**
 * Dàn Đề 2D Controller
 */

const dande2dService = require('../services/dande2d.service');

/**
 * Generate dàn đề 2D
 */
const generate2D = async (req, res) => {
    try {
        const { input } = req.body;

        if (!input || typeof input !== 'string') {
            return res.status(400).json({
                success: false,
                message: 'Input không hợp lệ'
            });
        }

        const result = dande2dService.generate2D(input);

        res.status(200).json({
            success: true,
            message: 'Tạo dàn 2D thành công',
            data: result
        });

    } catch (error) {
        console.error('Error in generate2D:', error);
        res.status(400).json({
            success: false,
            message: error.message || 'Lỗi khi tạo dàn 2D'
        });
    }
};

module.exports = {
    generate2D
};

