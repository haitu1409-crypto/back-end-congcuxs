const mongoose = require('mongoose');

/**
 * Model lưu trữ thống kê Giải Đặc Biệt
 * Mỗi bản ghi chứa danh sách giải đặc biệt cho một khoảng thời gian cụ thể
 */
const giaiDacBietStatsSchema = new mongoose.Schema({
    days: {
        type: Number,
        required: true,
        enum: [10, 20, 30, 60, 90, 100, 120, 150, 180, 270, 365]
    },
    statistics: [{
        number: { type: String, required: true },
        drawDate: { type: String, required: true }
    }],
    metadata: {
        startDate: { type: String },
        endDate: { type: String },
        totalDraws: { type: Number },
        filterType: { type: String }
    },
    lastUpdated: { type: Date, default: Date.now }
}, {
    timestamps: true,
    indexes: [
        { days: 1 },
        { lastUpdated: -1 }
    ]
});

module.exports = mongoose.model('GiaiDacBietStats', giaiDacBietStatsSchema);

