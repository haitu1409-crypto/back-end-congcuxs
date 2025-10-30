const mongoose = require('mongoose');

/**
 * Model lưu trữ thống kê Giải Đặc Biệt Theo Tuần
 * Mỗi bản ghi chứa giải đặc biệt theo tuần cho một tháng cụ thể
 */
const giaiDacBietTuanStatsSchema = new mongoose.Schema({
    month: {
        type: Number,
        required: true,
        min: 1,
        max: 12
    },
    year: {
        type: Number,
        required: true,
        min: 2000
    },
    statistics: [{
        number: { type: String, required: true },
        drawDate: { type: String, required: true }
    }],
    metadata: {
        startDate: { type: String },
        endDate: { type: String },
        totalDraws: { type: Number },
        month: { type: Number },
        year: { type: Number }
    },
    lastUpdated: { type: Date, default: Date.now }
}, {
    timestamps: true,
    indexes: [
        { year: 1, month: 1 },
        { lastUpdated: -1 }
    ]
});

module.exports = mongoose.model('GiaiDacBietTuanStats', giaiDacBietTuanStatsSchema);

