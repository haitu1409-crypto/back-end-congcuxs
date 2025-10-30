const mongoose = require('mongoose');

/**
 * Model lưu trữ thống kê Lô Gan
 * Mỗi bản ghi chứa thống kê lô gan cho một khoảng thời gian cụ thể
 */
const loGanStatsSchema = new mongoose.Schema({
    filterType: {
        type: String,
        required: true,
        enum: ['below-7', '7-14', '14-28', '30', '60']
    },
    description: {
        type: String,
        required: true
    },
    statistics: [{
        number: { type: Number, required: true },
        lastAppeared: { type: String, required: true },
        gapDraws: { type: Number, required: true },
        maxGap: { type: Number }
    }],
    metadata: {
        totalNumbers: { type: Number },
        startDate: { type: String },
        endDate: { type: String },
        totalDraws: { type: Number }
    },
    lastUpdated: { type: Date, default: Date.now }
}, {
    timestamps: true,
    indexes: [
        { filterType: 1 },
        { lastUpdated: -1 }
    ]
});

module.exports = mongoose.model('LoGanStats', loGanStatsSchema);

