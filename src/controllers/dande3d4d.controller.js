/**
 * Dàn Đề 3D/4D Controller
 */

const dande3d4dService = require('../services/dande3d4d.service');

/**
 * Generate dàn đề 3D
 */
const generate3D = async (req, res) => {
    try {
        const { input } = req.body;

        if (!input || typeof input !== 'string') {
            return res.status(400).json({
                success: false,
                message: 'Input không hợp lệ'
            });
        }

        const result = dande3d4dService.generate3D(input);

        res.status(200).json({
            success: true,
            message: 'Tạo dàn 3D thành công',
            data: result
        });

    } catch (error) {
        console.error('Error in generate3D:', error);
        res.status(400).json({
            success: false,
            message: error.message || 'Lỗi khi tạo dàn 3D'
        });
    }
};

/**
 * Generate dàn đề 4D
 */
const generate4D = async (req, res) => {
    try {
        const { input } = req.body;

        if (!input || typeof input !== 'string') {
            return res.status(400).json({
                success: false,
                message: 'Input không hợp lệ'
            });
        }

        const result = dande3d4dService.generate4D(input);

        res.status(200).json({
            success: true,
            message: 'Tạo dàn 4D thành công',
            data: result
        });

    } catch (error) {
        console.error('Error in generate4D:', error);
        res.status(400).json({
            success: false,
            message: error.message || 'Lỗi khi tạo dàn 4D'
        });
    }
};

module.exports = {
    generate3D,
    generate4D
};

