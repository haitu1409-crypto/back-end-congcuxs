/**
 * Bạch Thủ Đề Controller
 */

const BachThuDeService = require('../services/bachThuDe.service');
const BachThuDeResult = require('../models/bachThuDeResult.model');

class BachThuDeController {
    constructor() {
        this.bachThuDeService = new BachThuDeService();
    }

    /**
     * Lấy dự đoán bạch thủ đề
     */
    getBachThuDe = async (req, res) => {
        try {
            const { date, days = 30 } = req.query;

            if (!date) {
                return res.status(400).json({
                    success: false,
                    message: 'Ngày dự đoán là bắt buộc'
                });
            }

            // Parse date - handle both formats
            let targetDate;
            if (date.includes('/')) {
                // Format: dd/mm/yyyy
                const [day, month, year] = date.split('/');
                // Tạo ngày với timezone UTC để tránh lỗi timezone
                targetDate = new Date(Date.UTC(year, month - 1, day));
            } else {
                // Format: yyyy-mm-dd or other ISO formats
                targetDate = new Date(date);
            }

            if (isNaN(targetDate.getTime())) {
                return res.status(400).json({
                    success: false,
                    message: 'Ngày không hợp lệ. Vui lòng sử dụng format dd/mm/yyyy hoặc yyyy-mm-dd'
                });
            }

            // Validate days
            const daysNum = parseInt(days) || 14;
            if (isNaN(daysNum) || daysNum < 5 || daysNum > 100) {
                return res.status(400).json({
                    success: false,
                    message: 'Số ngày dữ liệu phải từ 5 đến 100'
                });
            }

            // Kiểm tra database trước (ưu tiên cao nhất)
            const existingResult = await BachThuDeResult.findByPredictionDate(targetDate, daysNum);
            if (existingResult) {
                console.log(`✅ Trả về dữ liệu từ database cho ngày ${targetDate.toISOString().split('T')[0]} (Optimized)`);
                return res.json({
                    success: true,
                    data: {
                        predictions: existingResult.predictions,
                        combinedPrediction: existingResult.combinedPrediction,
                        history: existingResult.history,
                        metadata: existingResult.metadata
                    },
                    message: 'Dự đoán bạch thủ đề từ database (đã được tính toán trước)',
                    fromDatabase: true,
                    optimized: true
                });
            }

            console.log(`⚠️ Không có dữ liệu trong database, tính toán real-time cho ngày ${targetDate.toISOString().split('T')[0]}`);

            console.log(`🎯 Getting bạch thủ đề for ${targetDate.toISOString().split('T')[0]}, days: ${daysNum}`);

            const result = await this.bachThuDeService.generateBachThuDe(targetDate, daysNum);

            // Lưu vào database
            try {
                const bachThuDeResult = new BachThuDeResult({
                    predictionDate: targetDate,
                    dataDays: daysNum,
                    predictions: result.predictions,
                    combinedPrediction: result.combinedPrediction,
                    history: result.history,
                    metadata: result.metadata
                });
                await bachThuDeResult.save();
                console.log(`Đã lưu vào database cho ngày ${targetDate.toISOString().split('T')[0]}`);
            } catch (dbErr) {
                console.warn('Lỗi khi lưu vào database:', dbErr.message);
            }

            res.json({
                success: true,
                data: result,
                message: 'Dự đoán bạch thủ đề thành công'
            });

        } catch (error) {
            console.error('❌ Error in getBachThuDe:', error);

            res.status(500).json({
                success: false,
                message: error.message || 'Lỗi server khi dự đoán bạch thủ đề',
                error: process.env.NODE_ENV === 'development' ? error.stack : undefined
            });
        }
    }

    /**
     * Lấy dự đoán bạch thủ đề cho hôm nay
     */
    getBachThuDeToday = async (req, res) => {
        try {
            const today = new Date();
            console.log(`🎯 Getting bạch thủ đề for today: ${today.toISOString().split('T')[0]}`);

            // Kiểm tra database trước (ưu tiên cao nhất)
            const existingResult = await BachThuDeResult.findByPredictionDate(today, 14);
            if (existingResult) {
                console.log(`✅ Trả về dữ liệu từ database cho ngày ${today.toISOString().split('T')[0]} (Optimized)`);
                return res.json({
                    success: true,
                    data: {
                        predictions: existingResult.predictions,
                        combinedPrediction: existingResult.combinedPrediction,
                        history: existingResult.history,
                        metadata: existingResult.metadata
                    },
                    message: 'Dự đoán bạch thủ đề từ database (đã được tính toán trước)',
                    fromDatabase: true,
                    optimized: true
                });
            }

            console.log(`⚠️ Không có dữ liệu trong database, tính toán real-time cho ngày ${today.toISOString().split('T')[0]}`);

            const result = await this.bachThuDeService.generateBachThuDe(today, 14);

            // Lưu vào database
            try {
                const bachThuDeResult = new BachThuDeResult({
                    predictionDate: today,
                    dataDays: 14,
                    predictions: result.predictions,
                    combinedPrediction: result.combinedPrediction,
                    history: result.history,
                    metadata: result.metadata
                });
                await bachThuDeResult.save();
                console.log(`Đã lưu vào database cho ngày ${today.toISOString().split('T')[0]}`);
            } catch (dbErr) {
                console.warn('Lỗi khi lưu vào database:', dbErr.message);
            }

            res.json({
                success: true,
                data: result,
                message: 'Dự đoán bạch thủ đề hôm nay thành công'
            });

        } catch (error) {
            console.error('❌ Error in getBachThuDeToday:', error);

            res.status(500).json({
                success: false,
                message: error.message || 'Lỗi server khi dự đoán bạch thủ đề hôm nay',
                error: process.env.NODE_ENV === 'development' ? error.stack : undefined
            });
        }
    }
}

module.exports = new BachThuDeController();
