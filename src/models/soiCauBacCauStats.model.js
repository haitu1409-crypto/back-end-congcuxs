const mongoose = require('mongoose');

/**
 * Model lưu trữ thống kê Soi Cầu Bắc Cầu
 * Mỗi bản ghi chứa định vị chính xác từng chữ số trong mỗi ô theo số ngày
 * Với 90 ngày: mỗi ô có vị trí đặc biệt duy nhất cho từng chữ số
 */
const soiCauBacCauStatsSchema = new mongoose.Schema({
    days: {
        type: Number,
        required: true,
        enum: [90, 120, 150, 180], // Số ngày cố định
        default: 90
    },
    // Thống kê theo từng ngày với định vị chính xác
    statistics: [{
        drawDate: {
            type: String,
            required: true,
            // Format: DD/MM/YYYY
        },
        // Định vị chính xác từng số trong từng giải
        prizes: {
            // Giải đặc biệt
            specialPrize: [{
                number: { type: String, required: true }, // Số đầy đủ 5 chữ số
                positions: [{ // Định vị từng chữ số
                    digit: { type: String, required: true }, // Chữ số (0-9)
                    position: { type: String, required: true }, // Format: (0-0-0) đến (0-0-4)
                    globalIndex: { type: Number, required: true }, // Index toàn cục trong bảng 90 ngày
                    cellPosition: { // Vị trí trong ô bảng
                        weekIndex: { type: Number, required: true }, // Dòng trong bảng (hàng) - Số tuần (0-based)
                        dayIndex: { type: Number, required: true }, // Cột trong bảng (ngang) - Thứ trong tuần (0-6, Thứ 2=0)
                        numberIndex: { type: Number, default: 0 }, // Thứ tự số trong toàn bộ ô (0, 1, 2, ...)
                        rowIndexInCell: { type: Number }, // Hàng trong ô (0 = hàng đầu, 1 = hàng 2, ...)
                        colIndexInCell: { type: Number }, // Cột trong ô (0 = cột đầu, 1 = cột 2, ...)
                        digitIndex: { type: Number, required: true } // Vị trí chữ số trong số (0-4)
                    }
                }]
            }],
            // Giải nhất
            firstPrize: [{
                number: { type: String, required: true },
                positions: [{
                    digit: { type: String, required: true },
                    position: { type: String, required: true }, // Format: (1-0-0) đến (1-0-4)
                    globalIndex: { type: Number, required: true },
                    cellPosition: {
                        weekIndex: { type: Number, required: true },
                        dayIndex: { type: Number, required: true },
                        numberIndex: { type: Number, default: 0 },
                        digitIndex: { type: Number, required: true }
                    }
                }]
            }],
            // Giải nhì (2 số)
            secondPrize: [{
                number: { type: String, required: true },
                elementIndex: { type: Number, required: true }, // 0 hoặc 1
                positions: [{
                    digit: { type: String, required: true },
                    position: { type: String, required: true }, // Format: (2-0-0) hoặc (2-1-0)
                    globalIndex: { type: Number, required: true },
                    cellPosition: {
                        weekIndex: { type: Number, required: true },
                        dayIndex: { type: Number, required: true },
                        numberIndex: { type: Number, required: true }, // Index trong ô
                        digitIndex: { type: Number, required: true }
                    }
                }]
            }],
            // Giải ba (6 số)
            threePrizes: [{
                number: { type: String, required: true },
                elementIndex: { type: Number, required: true }, // 0-5
                positions: [{
                    digit: { type: String, required: true },
                    position: { type: String, required: true }, // Format: (3-0-0) đến (3-5-4)
                    globalIndex: { type: Number, required: true },
                    cellPosition: {
                        weekIndex: { type: Number, required: true },
                        dayIndex: { type: Number, required: true },
                        numberIndex: { type: Number, required: true },
                        digitIndex: { type: Number, required: true }
                    }
                }]
            }],
            // Giải tư (4 số)
            fourPrizes: [{
                number: { type: String, required: true },
                elementIndex: { type: Number, required: true }, // 0-3
                positions: [{
                    digit: { type: String, required: true },
                    position: { type: String, required: true }, // Format: (4-0-0) đến (4-3-4)
                    globalIndex: { type: Number, required: true },
                    cellPosition: {
                        weekIndex: { type: Number, required: true },
                        dayIndex: { type: Number, required: true },
                        numberIndex: { type: Number, required: true },
                        digitIndex: { type: Number, required: true }
                    }
                }]
            }],
            // Giải năm (6 số)
            fivePrizes: [{
                number: { type: String, required: true },
                elementIndex: { type: Number, required: true }, // 0-5
                positions: [{
                    digit: { type: String, required: true },
                    position: { type: String, required: true }, // Format: (5-0-0) đến (5-5-4)
                    globalIndex: { type: Number, required: true },
                    cellPosition: {
                        weekIndex: { type: Number, required: true },
                        dayIndex: { type: Number, required: true },
                        numberIndex: { type: Number, required: true },
                        digitIndex: { type: Number, required: true }
                    }
                }]
            }],
            // Giải sáu (3 số)
            sixPrizes: [{
                number: { type: String, required: true },
                elementIndex: { type: Number, required: true }, // 0-2
                positions: [{
                    digit: { type: String, required: true },
                    position: { type: String, required: true }, // Format: (6-0-0) đến (6-2-4)
                    globalIndex: { type: Number, required: true },
                    cellPosition: {
                        weekIndex: { type: Number, required: true },
                        dayIndex: { type: Number, required: true },
                        numberIndex: { type: Number, required: true },
                        digitIndex: { type: Number, required: true }
                    }
                }]
            }],
            // Giải bảy (4 số)
            sevenPrizes: [{
                number: { type: String, required: true },
                elementIndex: { type: Number, required: true }, // 0-3
                positions: [{
                    digit: { type: String, required: true },
                    position: { type: String, required: true }, // Format: (7-0-0) đến (7-3-4)
                    globalIndex: { type: Number, required: true },
                    cellPosition: {
                        weekIndex: { type: Number, required: true },
                        dayIndex: { type: Number, required: true },
                        numberIndex: { type: Number, required: true },
                        digitIndex: { type: Number, required: true }
                    }
                }]
            }]
        },
        // Thông tin tổng hợp
        info: {
            lastTwoDigits: { type: String }, // 2 số cuối giải đặc biệt
            dayOfWeek: { type: Number }, // 0-6 (Chủ nhật=0, Thứ 2=1, ...)
            dayOfWeekName: { type: String } // "Thứ 2", "Thứ 3", ...
        }
    }],
    // Metadata
    metadata: {
        startDate: { type: String },
        endDate: { type: String },
        totalDays: { type: Number },
        totalCells: { type: Number }, // Tổng số ô trong bảng
        lastUpdated: { type: Date, default: Date.now }
    },
    lastUpdated: { type: Date, default: Date.now }
}, {
    timestamps: true,
    indexes: [
        { days: 1 },
        { lastUpdated: -1 },
        { 'metadata.startDate': 1 },
        { 'metadata.endDate': 1 }
    ]
});

// Static method để tìm theo số ngày
soiCauBacCauStatsSchema.statics.findByDays = function (days) {
    return this.findOne({ days }).sort({ lastUpdated: -1 });
};

// Static method để tạo hoặc cập nhật
soiCauBacCauStatsSchema.statics.createOrUpdate = async function (days, data) {
    const existing = await this.findOne({ days });
    if (existing) {
        existing.statistics = data.statistics;
        existing.metadata = data.metadata;
        existing.lastUpdated = new Date();
        return existing.save();
    } else {
        return this.create({
            days,
            statistics: data.statistics,
            metadata: data.metadata
        });
    }
};

module.exports = mongoose.model('SoiCauBacCauStats', soiCauBacCauStatsSchema);

