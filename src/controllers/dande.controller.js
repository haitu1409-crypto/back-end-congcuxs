/**
 * Dàn Đề Controller
 * Xử lý logic nghiệp vụ cho chức năng tạo dàn đề
 */

const danDeService = require('../services/dande.service');

/**
 * Tạo dàn đề ngẫu nhiên
 */
const generateDanDe = async (req, res) => {
    try {
        const { quantity, combinationNumbers, excludeNumbers, excludeDoubles, specialSets } = req.body;

        // Validation
        if (!quantity || typeof quantity !== 'number') {
            return res.status(400).json({
                success: false,
                message: 'Số lượng dàn không hợp lệ'
            });
        }

        if (quantity < 1 || quantity > 50) {
            return res.status(400).json({
                success: false,
                message: 'Số lượng dàn phải từ 1 đến 50'
            });
        }

        // Validation số mong muốn (nếu có)
        if (combinationNumbers) {
            if (!Array.isArray(combinationNumbers)) {
                return res.status(400).json({
                    success: false,
                    message: 'Thêm số mong muốn phải là mảng'
                });
            }

            // Kiểm tra từng số mong muốn
            const invalidNumbers = combinationNumbers.filter(num => {
                return typeof num !== 'string' || !/^\d{2}$/.test(num) || parseInt(num) > 99;
            });

            if (invalidNumbers.length > 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Thêm số mong muốn phải là số 2 chữ số từ 00-99'
                });
            }

            if (combinationNumbers.length > 40) {
                return res.status(400).json({
                    success: false,
                    message: 'Thêm số mong muốn không được quá 40 số'
                });
            }
        }

        // Validation loại bỏ số mong muốn (nếu có)
        if (excludeNumbers) {
            if (!Array.isArray(excludeNumbers)) {
                return res.status(400).json({
                    success: false,
                    message: 'Loại bỏ số mong muốn phải là mảng'
                });
            }

            // Kiểm tra từng số loại bỏ
            const invalidExcludeNumbers = excludeNumbers.filter(num => {
                return typeof num !== 'string' || !/^\d{2}$/.test(num) || parseInt(num) > 99;
            });

            if (invalidExcludeNumbers.length > 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Loại bỏ số mong muốn phải là số 2 chữ số từ 00-99'
                });
            }

            if (excludeNumbers.length > 5) {
                return res.status(400).json({
                    success: false,
                    message: 'Loại bỏ số mong muốn không được quá 5 số'
                });
            }
        }

        // Validation excludeDoubles (nếu có)
        if (excludeDoubles !== undefined && typeof excludeDoubles !== 'boolean') {
            return res.status(400).json({
                success: false,
                message: 'excludeDoubles phải là boolean'
            });
        }

        // Validation bộ số đặc biệt (nếu có)
        if (specialSets) {
            if (!Array.isArray(specialSets)) {
                return res.status(400).json({
                    success: false,
                    message: 'Bộ số đặc biệt phải là mảng'
                });
            }

            // Kiểm tra từng bộ số đặc biệt
            const invalidSets = specialSets.filter(setId => {
                return typeof setId !== 'string' || !/^\d{2}$/.test(setId) || parseInt(setId) > 99;
            });

            if (invalidSets.length > 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Bộ số đặc biệt phải là số 2 chữ số từ 00-99'
                });
            }

            if (specialSets.length > 5) {
                return res.status(400).json({
                    success: false,
                    message: 'Số lượng bộ số đặc biệt tối đa là 5'
                });
            }
        }

        // Kiểm tra xung đột giữa số mong muốn và loại bỏ số mong muốn
        if (combinationNumbers && excludeNumbers) {
            const conflicts = combinationNumbers.filter(num => excludeNumbers.includes(num));
            if (conflicts.length > 0) {
                return res.status(400).json({
                    success: false,
                    message: `Số ${conflicts.join(', ')} không thể vừa là số mong muốn vừa là loại bỏ số mong muốn`
                });
            }
        }

        // Kiểm tra xung đột giữa số mong muốn và số kép bằng
        if (combinationNumbers && excludeDoubles) {
            const doubleNumbers = ['00', '11', '22', '33', '44', '55', '66', '77', '88', '99'];
            const conflicts = combinationNumbers.filter(num => doubleNumbers.includes(num));
            if (conflicts.length > 0) {
                return res.status(400).json({
                    success: false,
                    message: `Số ${conflicts.join(', ')} không thể vừa là số mong muốn vừa bị loại bỏ kép bằng`
                });
            }
        }

        // Generate dàn đề
        const result = danDeService.generateRandomDanDe(quantity, combinationNumbers, excludeNumbers, excludeDoubles, specialSets);

        res.status(200).json({
            success: true,
            message: 'Tạo dàn đề thành công',
            data: result
        });

    } catch (error) {
        console.error('Error in generateDanDe:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi tạo dàn đề',
            error: error.message
        });
    }
};

/**
 * Lưu dàn đề (optional - có thể mở rộng với database)
 */
const saveDanDe = async (req, res) => {
    try {
        const { levels, metadata } = req.body;

        // Validation
        if (!levels) {
            return res.status(400).json({
                success: false,
                message: 'Dữ liệu dàn đề không hợp lệ'
            });
        }

        // Ở đây có thể lưu vào database nếu cần
        // Hiện tại chỉ trả về success

        res.status(200).json({
            success: true,
            message: 'Lưu dàn đề thành công',
            data: {
                saved: true,
                timestamp: new Date().toISOString()
            }
        });

    } catch (error) {
        console.error('Error in saveDanDe:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lưu dàn đề',
            error: error.message
        });
    }
};

/**
 * Lấy thống kê (optional)
 */
const getStats = async (req, res) => {
    try {
        // Có thể thêm logic thống kê nếu có database
        res.status(200).json({
            success: true,
            message: 'Lấy thống kê thành công',
            data: {
                totalGenerated: 0,
                lastGenerated: null,
                popularLevels: []
            }
        });

    } catch (error) {
        console.error('Error in getStats:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy thống kê',
            error: error.message
        });
    }
};

module.exports = {
    generateDanDe,
    saveDanDe,
    getStats
};

