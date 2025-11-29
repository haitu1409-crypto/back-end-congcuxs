const mongoose = require('mongoose');

/**
 * Model lưu trữ thống kê chi tiết của Giải Đặc Biệt
 * Bao gồm: gan theo bộ, tổng, chạm, đầu đuôi
 * Dùng cho logic dự đoán
 */
const specialDetailedStatsSchema = new mongoose.Schema({
    days: {
        type: Number,
        required: true,
        enum: [10, 20, 30, 60, 90, 100, 120, 150, 180, 270, 365]
    },
    // Thống kê gan theo số (00-99)
    numberGaps: [{
        number: { type: String, required: true },
        days: { type: Number, required: true },
        lastDate: { type: String }
    }],
    // Thống kê gan theo tổng (0-9)
    sumGaps: [{
        sum: { type: Number, required: true },
        days: { type: Number, required: true },
        lastDate: { type: String }
    }],
    // Thống kê tần suất theo tổng (0-9)
    sumFrequency: [{
        sum: { type: Number, required: true },
        count: { type: Number, required: true },
        percentage: { type: String }
    }],
    // Thống kê gan theo chạm (0-9)
    chamGaps: [{
        cham: { type: Number, required: true },
        days: { type: Number, required: true },
        lastDate: { type: String }
    }],
    // Thống kê tần suất theo chạm (0-9)
    chamFrequency: [{
        cham: { type: Number, required: true },
        count: { type: Number, required: true },
        percentage: { type: String }
    }],
    // Thống kê gan theo bộ (00-99)
    boGaps: [{
        setId: { type: String, required: true },
        days: { type: Number, required: true },
        lastDate: { type: String }
    }],
    // Thống kê tần suất theo bộ (00-99)
    boFrequency: [{
        setId: { type: String, required: true },
        count: { type: Number, required: true },
        percentage: { type: String }
    }],
    // Thống kê gan đầu (0-9)
    dauGaps: [{
        digit: { type: Number, required: true },
        days: { type: Number, required: true },
        lastDate: { type: String }
    }],
    // Thống kê gan đuôi (0-9)
    duoiGaps: [{
        digit: { type: Number, required: true },
        days: { type: Number, required: true },
        lastDate: { type: String }
    }],
    // Thống kê tần suất đầu (0-9)
    dauFrequency: [{
        digit: { type: Number, required: true },
        count: { type: Number, required: true },
        percentage: { type: String }
    }],
    // Thống kê tần suất đuôi (0-9)
    duoiFrequency: [{
        digit: { type: Number, required: true },
        count: { type: Number, required: true },
        percentage: { type: String }
    }],
    metadata: {
        startDate: { type: String },
        endDate: { type: String },
        totalDraws: { type: Number },
        calculatedAt: { type: Date, default: Date.now }
    },
    lastUpdated: { type: Date, default: Date.now }
}, {
    timestamps: true,
    indexes: [
        { days: 1 },
        { lastUpdated: -1 }
    ]
});

module.exports = mongoose.model('SpecialDetailedStats', specialDetailedStatsSchema);

