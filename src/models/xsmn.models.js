const mongoose = require('mongoose');

const xsmnSchema = new mongoose.Schema({
    drawDate: { type: Date, required: true },
    dayOfWeek: { type: String },
    tentinh: { type: String, required: true },
    tinh: { type: String, required: true },
    slug: { type: String, unique: true },
    year: { type: Number },
    month: { type: Number },
    eightPrizes: { type: [String] },
    sevenPrizes: { type: [String] },
    sixPrizes: { type: [String] },
    fivePrizes: { type: [String] },
    fourPrizes: { type: [String] },
    threePrizes: { type: [String] },
    secondPrize: { type: [String] },
    firstPrize: { type: [String] },
    specialPrize: { type: [String] },
    station: { type: String, required: true, default: 'xsmn' },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
    isComplete: { type: Boolean, default: false }, // Đánh dấu dữ liệu đã đầy đủ
    scrapedAt: { type: Date }, // Thời gian cào dữ liệu
}, {
    timestamps: true,
    indexes: [
        { key: { drawDate: 1, station: 1, tentinh: 1 }, unique: true },
        { key: { drawDate: -1, station: 1 } },
        { key: { slug: 1 }, unique: true },
        { key: { tentinh: 1 } },
        { key: { dayOfWeek: 1 } },
        { key: { station: 1, tinh: 1 } },
        { key: { isComplete: 1 } },
        { key: { scrapedAt: -1 } },
    ],
});

// Pre-save middleware
xsmnSchema.pre('save', function (next) {
    this.updatedAt = new Date();
    if (this.isNew) {
        this.scrapedAt = new Date();
    }
    next();
});

// Static method để tìm kết quả theo ngày và tỉnh
xsmnSchema.statics.findByDateAndProvince = function (date, tentinh) {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    return this.findOne({
        drawDate: {
            $gte: startOfDay,
            $lte: endOfDay
        },
        station: 'xsmn',
        tentinh: tentinh
    });
};

// Static method để tìm tất cả kết quả theo ngày
xsmnSchema.statics.findByDate = function (date) {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    return this.find({
        drawDate: {
            $gte: startOfDay,
            $lte: endOfDay
        },
        station: 'xsmn'
    });
};

// Static method để tìm kết quả gần nhất cho một tỉnh
xsmnSchema.statics.findLatestByProvince = function (tentinh) {
    return this.findOne({
        station: 'xsmn',
        tentinh: tentinh
    }).sort({ drawDate: -1 });
};

// Instance method để kiểm tra dữ liệu đầy đủ
xsmnSchema.methods.checkCompleteness = function () {
    const requiredFields = [
        'eightPrizes', 'sevenPrizes', 'sixPrizes', 'fivePrizes',
        'fourPrizes', 'threePrizes', 'secondPrize', 'firstPrize', 'specialPrize'
    ];

    for (const field of requiredFields) {
        if (!Array.isArray(this[field]) || this[field].length === 0) {
            return false;
        }
        // Kiểm tra tất cả phần tử trong mảng
        for (const item of this[field]) {
            if (!item || item === '...' || item === '****' || !/^\d+$/.test(item)) {
                return false;
            }
        }
    }

    return true;
};

// Instance method để cập nhật trạng thái hoàn thành
xsmnSchema.methods.updateCompleteness = function () {
    this.isComplete = this.checkCompleteness();
    if (this.isComplete) {
        this.scrapedAt = new Date();
    }
    return this.isComplete;
};

module.exports = mongoose.model('XSMN', xsmnSchema);