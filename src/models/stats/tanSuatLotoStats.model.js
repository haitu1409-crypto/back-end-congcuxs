const mongoose = require('mongoose');

/**
 * Model lưu trữ thống kê Tần Suất Lô Tô
 * Mỗi bản ghi chứa tần suất xuất hiện của các lô tô cho một khoảng thời gian
 */
const tanSuatLotoStatsSchema = new mongoose.Schema({
    days: {
        type: Number,
        required: true,
        enum: [30, 60, 90, 120, 180, 365]
    },
    statistics: [{
        number: { type: String, required: true },
        count: { type: Number, required: true },
        percentage: { type: String, required: true }
    }],
    metadata: {
        totalDraws: { type: Number },
        startDate: { type: String },
        endDate: { type: String },
        totalNumbers: { type: Number }
    },
    lastUpdated: { type: Date, default: Date.now }
}, {
    timestamps: true,
    indexes: [
        { days: 1 },
        { lastUpdated: -1 }
    ]
});

module.exports = mongoose.model('TanSuatLotoStats', tanSuatLotoStatsSchema);

