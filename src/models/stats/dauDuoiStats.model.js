const mongoose = require('mongoose');

/**
 * Model lưu trữ thống kê Đầu Đuôi
 * Mỗi bản ghi chứa thống kê đầu đuôi cho một khoảng thời gian cụ thể
 */
const dauDuoiStatsSchema = new mongoose.Schema({
    days: {
        type: Number,
        required: true,
        enum: [30, 60, 90, 120, 180, 365]
    },
    dauStats: [{
        number: { type: Number, required: true },
        count: { type: Number, required: true },
        percentage: { type: String }
    }],
    duoiStats: [{
        number: { type: Number, required: true },
        count: { type: Number, required: true },
        percentage: { type: String }
    }],
    specialDauDuoiStats: [{
        number: { type: Number, required: true },
        dauCount: { type: Number },
        dauPercentage: { type: String },
        duoiCount: { type: Number },
        duoiPercentage: { type: String }
    }],
    dauStatsByDate: {
        type: mongoose.Schema.Types.Mixed
    },
    duoiStatsByDate: {
        type: mongoose.Schema.Types.Mixed
    },
    metadata: {
        totalDraws: { type: Number },
        startDate: { type: String },
        endDate: { type: String }
    },
    lastUpdated: { type: Date, default: Date.now }
}, {
    timestamps: true,
    indexes: [
        { days: 1 },
        { lastUpdated: -1 }
    ]
});

module.exports = mongoose.model('DauDuoiStats', dauDuoiStatsSchema);

