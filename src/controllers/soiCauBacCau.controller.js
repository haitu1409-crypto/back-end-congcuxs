/**
 * Controller Soi Cầu Bắc Cầu
 */

const soiCauBacCauService = require('../services/soiCauBacCau.service');
const soiCauBacCauPredictionService = require('../services/soiCauBacCauPrediction.service');
const SoiCauBacCauStats = require('../models/soiCauBacCauStats.model');
const database = require('../config/database');

/**
 * Lấy thống kê soi cầu bắc cầu
 */
const getSoiCauBacCauStats = async (req, res) => {
    try {
        const { days = 90 } = req.query;
        const numDays = parseInt(days);

        if (![90, 120, 150, 180, 240, 270, 300, 365].includes(numDays)) {
            return res.status(400).json({
                error: 'Số ngày phải là 90, 120, 150, 180, 240, 270, 300 hoặc 365'
            });
        }

        console.log(`📊 Lấy thống kê soi cầu bắc cầu cho ${numDays} ngày...`);

        // Tìm trong database - LUÔN trả về cache nếu có, không tự động tính toán lại
        let responseData = null;

        await database.waitForConnection();

        const cached = await SoiCauBacCauStats.findByDays(numDays);

        if (cached && cached.statistics.length > 0) {
            const cacheAge = Date.now() - new Date(cached.lastUpdated).getTime();
            const cacheAgeMinutes = Math.round(cacheAge / 1000 / 60);
            console.log(`✅ Trả về dữ liệu từ cache (${cacheAgeMinutes} phút trước)`);
            responseData = {
                statistics: cached.statistics,
                metadata: cached.metadata
            };
        } else {
            console.log(`ℹ️ Không tìm thấy cache cho ${numDays} ngày. Tiến hành tính toán trực tiếp...`);
            const result = await soiCauBacCauService.calculateSoiCauBacCauStats(numDays);
            await SoiCauBacCauStats.createOrUpdate(numDays, result);
            responseData = {
                statistics: result.statistics,
                metadata: result.metadata
            };
        }

        // Nếu vẫn không có dữ liệu sau khi tính toán
        if (!responseData || !responseData.statistics || responseData.statistics.length === 0) {
            return res.status(404).json({
                error: `Không có dữ liệu cho ${numDays} ngày.`,
                message: 'Không tìm thấy dữ liệu soi cầu bắc cầu'
            });
        }

        return res.status(200).json({
            success: true,
            statistics: responseData.statistics,
            metadata: responseData.metadata
        });

    } catch (error) {
        console.error('❌ Lỗi khi lấy thống kê soi cầu bắc cầu:', error);
        res.status(500).json({
            error: error.message || 'Lỗi server khi lấy thống kê soi cầu bắc cầu'
        });
    }
};

/**
 * Cập nhật thống kê soi cầu bắc cầu
 */
const updateSoiCauBacCauStats = async (req, res) => {
    try {
        const { days = 90 } = req.query;
        const numDays = parseInt(days);

        if (![90, 120, 150, 180, 240, 270, 300, 365].includes(numDays)) {
            return res.status(400).json({
                error: 'Số ngày phải là 90, 120, 150, 180, 240, 270, 300 hoặc 365'
            });
        }

        await database.waitForConnection();

        console.log(`🔄 Cập nhật thống kê soi cầu bắc cầu cho ${numDays} ngày...`);

        // Tính toán lại thống kê
        const result = await soiCauBacCauService.calculateSoiCauBacCauStats(numDays);

        // Lưu vào database
        await SoiCauBacCauStats.createOrUpdate(numDays, result);

        console.log(`✅ Đã cập nhật thống kê soi cầu bắc cầu cho ${numDays} ngày`);

        res.status(200).json({
            success: true,
            message: `Đã cập nhật thống kê soi cầu bắc cầu cho ${numDays} ngày`,
            statistics: result.statistics,
            metadata: result.metadata
        });

    } catch (error) {
        console.error('❌ Lỗi khi cập nhật thống kê soi cầu bắc cầu:', error);
        res.status(500).json({
            error: error.message || 'Lỗi server khi cập nhật thống kê soi cầu bắc cầu'
        });
    }
};

module.exports = {
    getSoiCauBacCauStats,
    updateSoiCauBacCauStats
};


