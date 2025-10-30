const LoGanStats = require('../models/stats/loganStats.model');
const GiaiDacBietStats = require('../models/stats/giaiDacBietStats.model');
const GiaiDacBietTuanStats = require('../models/stats/giaiDacBietTuanStats.model');
const DauDuoiStats = require('../models/stats/dauDuoiStats.model');
const TanSuatLotoStats = require('../models/stats/tanSuatLotoStats.model');
const TanSuatLoCapStats = require('../models/stats/tanSuatLoCapStats.model');
const { 
    calculateLoGanStats, 
    calculateSpecialPrizeStats, 
    calculateSpecialPrizeStatsByWeek,
    calculateDauDuoiStats,
    calculateTanSuatLotoStats,
    calculateTanSuatLoCapStats
} = require('./xsmbController');

/**
 * Cập nhật thống kê Lô Gan
 */
const updateLoGanStats = async (req, res) => {
    try {
        const { days } = req.query;
        
        if (!days) {
            return res.status(400).json({ error: 'Tham số days là bắt buộc' });
        }

        console.log(`🔄 Cập nhật thống kê Lô Gan cho ${days} ngày...`);

        // Tính toán thống kê
        const result = await calculateLoGanStats(days);

        // Lưu vào database
        const filterType = days === 6 ? 'below-7' : 
                          days === 7 ? '7-14' : 
                          days === 14 ? '14-28' :
                          days === 30 ? '30' : '60';

        await LoGanStats.findOneAndUpdate(
            { filterType },
            {
                filterType,
                description: result.metadata?.description || `${days} ngày`,
                statistics: result.statistics,
                metadata: result.metadata,
                lastUpdated: new Date()
            },
            { upsert: true, new: true }
        );

        console.log(`✅ Đã cập nhật thống kê Lô Gan cho ${days} ngày`);

        res.status(200).json({
            success: true,
            message: `Đã cập nhật thống kê Lô Gan cho ${days} ngày`,
            data: result
        });
    } catch (error) {
        console.error('❌ Lỗi khi cập nhật thống kê Lô Gan:', error);
        res.status(500).json({ error: error.message });
    }
};

/**
 * Cập nhật thống kê Giải Đặc Biệt
 */
const updateGiaiDacBietStats = async (req, res) => {
    try {
        const { days } = req.query;
        
        if (!days) {
            return res.status(400).json({ error: 'Tham số days là bắt buộc' });
        }

        console.log(`🔄 Cập nhật thống kê Giải Đặc Biệt cho ${days} ngày...`);

        // Tính toán thống kê
        const result = await calculateSpecialPrizeStats(days);

        // Lưu vào database
        await GiaiDacBietStats.findOneAndUpdate(
            { days: Number(days) },
            {
                days: Number(days),
                statistics: result.statistics,
                metadata: result.metadata,
                lastUpdated: new Date()
            },
            { upsert: true, new: true }
        );

        console.log(`✅ Đã cập nhật thống kê Giải Đặc Biệt cho ${days} ngày`);

        res.status(200).json({
            success: true,
            message: `Đã cập nhật thống kê Giải Đặc Biệt cho ${days} ngày`,
            data: result
        });
    } catch (error) {
        console.error('❌ Lỗi khi cập nhật thống kê Giải Đặc Biệt:', error);
        res.status(500).json({ error: error.message });
    }
};

/**
 * Cập nhật thống kê Giải Đặc Biệt Theo Tuần
 */
const updateGiaiDacBietTuanStats = async (req, res) => {
    try {
        const { month, year } = req.query;
        
        if (!month || !year) {
            return res.status(400).json({ error: 'Tham số month và year là bắt buộc' });
        }

        console.log(`🔄 Cập nhật thống kê Giải Đặc Biệt Tuần cho tháng ${month}/${year}...`);

        // Tính toán thống kê
        const result = await calculateSpecialPrizeStatsByWeek(month, year);

        // Lưu vào database
        await GiaiDacBietTuanStats.findOneAndUpdate(
            { month: Number(month), year: Number(year) },
            {
                month: Number(month),
                year: Number(year),
                statistics: result.statistics,
                metadata: result.metadata,
                lastUpdated: new Date()
            },
            { upsert: true, new: true }
        );

        console.log(`✅ Đã cập nhật thống kê Giải Đặc Biệt Tuần cho tháng ${month}/${year}`);

        res.status(200).json({
            success: true,
            message: `Đã cập nhật thống kê Giải Đặc Biệt Tuần cho tháng ${month}/${year}`,
            data: result
        });
    } catch (error) {
        console.error('❌ Lỗi khi cập nhật thống kê Giải Đặc Biệt Tuần:', error);
        res.status(500).json({ error: error.message });
    }
};

/**
 * Cập nhật thống kê Đầu Đuôi
 */
const updateDauDuoiStats = async (req, res) => {
    try {
        const { days } = req.query;
        
        if (!days) {
            return res.status(400).json({ error: 'Tham số days là bắt buộc' });
        }

        console.log(`🔄 Cập nhật thống kê Đầu Đuôi cho ${days} ngày...`);

        // Tính toán thống kê
        const result = await calculateDauDuoiStats(days);

        // Lưu vào database
        await DauDuoiStats.findOneAndUpdate(
            { days: Number(days) },
            {
                days: Number(days),
                dauStats: result.dauStats,
                duoiStats: result.duoiStats,
                specialDauDuoiStats: result.specialDauDuoiStats,
                metadata: result.metadata,
                lastUpdated: new Date()
            },
            { upsert: true, new: true }
        );

        console.log(`✅ Đã cập nhật thống kê Đầu Đuôi cho ${days} ngày`);

        res.status(200).json({
            success: true,
            message: `Đã cập nhật thống kê Đầu Đuôi cho ${days} ngày`,
            data: result
        });
    } catch (error) {
        console.error('❌ Lỗi khi cập nhật thống kê Đầu Đuôi:', error);
        res.status(500).json({ error: error.message });
    }
};

/**
 * Cập nhật thống kê Tần Suất Lô Tô
 */
const updateTanSuatLotoStats = async (req, res) => {
    try {
        const { days } = req.query;
        
        if (!days) {
            return res.status(400).json({ error: 'Tham số days là bắt buộc' });
        }

        console.log(`🔄 Cập nhật thống kê Tần Suất Lô Tô cho ${days} ngày...`);

        // Tính toán thống kê
        const result = await calculateTanSuatLotoStats(days);

        // Lưu vào database
        await TanSuatLotoStats.findOneAndUpdate(
            { days: Number(days) },
            {
                days: Number(days),
                statistics: result.statistics,
                metadata: result.metadata,
                lastUpdated: new Date()
            },
            { upsert: true, new: true }
        );

        console.log(`✅ Đã cập nhật thống kê Tần Suất Lô Tô cho ${days} ngày`);

        res.status(200).json({
            success: true,
            message: `Đã cập nhật thống kê Tần Suất Lô Tô cho ${days} ngày`,
            data: result
        });
    } catch (error) {
        console.error('❌ Lỗi khi cập nhật thống kê Tần Suất Lô Tô:', error);
        res.status(500).json({ error: error.message });
    }
};

/**
 * Cập nhật thống kê Tần Suất Lô Cặp
 */
const updateTanSuatLoCapStats = async (req, res) => {
    try {
        const { days } = req.query;
        
        if (!days) {
            return res.status(400).json({ error: 'Tham số days là bắt buộc' });
        }

        console.log(`🔄 Cập nhật thống kê Tần Suất Lô Cặp cho ${days} ngày...`);

        // Tính toán thống kê
        const result = await calculateTanSuatLoCapStats(days);

        // Lưu vào database
        await TanSuatLoCapStats.findOneAndUpdate(
            { days: Number(days) },
            {
                days: Number(days),
                statistics: result.statistics,
                metadata: result.metadata,
                lastUpdated: new Date()
            },
            { upsert: true, new: true }
        );

        console.log(`✅ Đã cập nhật thống kê Tần Suất Lô Cặp cho ${days} ngày`);

        res.status(200).json({
            success: true,
            message: `Đã cập nhật thống kê Tần Suất Lô Cặp cho ${days} ngày`,
            data: result
        });
    } catch (error) {
        console.error('❌ Lỗi khi cập nhật thống kê Tần Suất Lô Cặp:', error);
        res.status(500).json({ error: error.message });
    }
};

module.exports = {
    updateLoGanStats,
    updateGiaiDacBietStats,
    updateGiaiDacBietTuanStats,
    updateDauDuoiStats,
    updateTanSuatLotoStats,
    updateTanSuatLoCapStats
};

