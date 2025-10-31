const mongoose = require('mongoose');

const xsmbSchema = new mongoose.Schema({
    drawDate: { type: Date, required: true },
    dayOfWeek: { type: String },
    tentinh: { type: String, required: true },
    tinh: { type: String, required: true },
    slug: { type: String, unique: true },
    year: { type: Number },
    month: { type: Number },
    maDB: { type: String },
    specialPrize: { type: [String] },
    firstPrize: { type: [String] },
    secondPrize: { type: [String] },
    threePrizes: { type: [String] },
    fourPrizes: { type: [String] },
    fivePrizes: { type: [String] },
    sixPrizes: { type: [String] },
    sevenPrizes: { type: [String] },
    station: { type: String, required: true, default: 'xsmb' },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
    isComplete: { type: Boolean, default: false }, // Đánh dấu dữ liệu đã đầy đủ
    scrapedAt: { type: Date }, // Thời gian cào dữ liệu
}, {
    timestamps: true,
    indexes: [
        { key: { drawDate: 1, station: 1 }, unique: true },
        { key: { drawDate: -1, station: 1 } },
        { key: { slug: 1 }, unique: true },
        { key: { dayOfWeek: 1 } },
        { key: { station: 1, tinh: 1 } },
        { key: { isComplete: 1 } },
        { key: { scrapedAt: -1 } },
    ],
});

// Pre-save middleware
xsmbSchema.pre('save', function (next) {
    this.updatedAt = new Date();
    if (this.isNew) {
        this.scrapedAt = new Date();
    }
    next();
});

// Static method để tìm kết quả theo ngày
xsmbSchema.statics.findByDate = function (date) {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    return this.findOne({
        drawDate: {
            $gte: startOfDay,
            $lte: endOfDay
        },
        station: 'xsmb'
    });
};

// Static method để tìm kết quả gần nhất
xsmbSchema.statics.findLatest = function () {
    return this.findOne({
        station: 'xsmb'
    }).sort({ drawDate: -1 });
};

// Instance method để kiểm tra dữ liệu đầy đủ
xsmbSchema.methods.checkCompleteness = function () {
    const requiredFields = [
        'maDB', 'specialPrize', 'firstPrize', 'secondPrize',
        'threePrizes', 'fourPrizes', 'fivePrizes', 'sixPrizes', 'sevenPrizes'
    ];

    for (const field of requiredFields) {
        if (field === 'maDB') {
            if (!this[field] || this[field] === '...' || this[field] === '****') {
                return false;
            }
        } else {
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
    }

    return true;
};

// Instance method để cập nhật trạng thái hoàn thành
xsmbSchema.methods.updateCompleteness = function () {
    this.isComplete = this.checkCompleteness();
    if (this.isComplete) {
        this.scrapedAt = new Date();
    }
    return this.isComplete;
};

module.exports = mongoose.model('XSMB', xsmbSchema);
