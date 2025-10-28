const mongoose = require('mongoose');

const dailySoiCauDataSchema = new mongoose.Schema({
    // Ngày dự đoán
    predictionDate: {
        type: Date,
        required: true,
        unique: true,
        index: true
    },

    // Dữ liệu lịch sử được sử dụng để soi cầu
    historicalData: {
        // Số ngày dữ liệu lịch sử
        days: {
            type: Number,
            required: true
        },

        // Ngày bắt đầu và kết thúc của dữ liệu lịch sử
        startDate: {
            type: Date,
            required: true
        },
        endDate: {
            type: Date,
            required: true
        },

        // Số lượng bản ghi dữ liệu
        recordCount: {
            type: Number,
            required: true
        },

        // Dữ liệu thô (có thể lưu để debug)
        rawData: [{
            drawDate: Date,
            specialPrize: mongoose.Schema.Types.Mixed,
            firstPrize: mongoose.Schema.Types.Mixed,
            secondPrize: [mongoose.Schema.Types.Mixed],
            threePrizes: [mongoose.Schema.Types.Mixed],
            fourPrizes: [mongoose.Schema.Types.Mixed],
            fivePrizes: [mongoose.Schema.Types.Mixed],
            sixPrizes: [mongoose.Schema.Types.Mixed],
            sevenPrizes: [mongoose.Schema.Types.Mixed]
        }]
    },

    // Kết quả soi cầu đã tính toán
    predictions: {
        // CDM predictions
        cdm: {
            de: [{
                number: String,
                probability: mongoose.Schema.Types.Mixed,
                percentage: String
            }],
            lo: [{
                number: String,
                probability: mongoose.Schema.Types.Mixed,
                percentage: String
            }]
        },

        // EFDM predictions
        efdm: {
            de: [{
                number: String,
                probability: mongoose.Schema.Types.Mixed,
                percentage: String
            }],
            lo: [{
                number: String,
                probability: mongoose.Schema.Types.Mixed,
                percentage: String
            }]
        },

        // Collaborative Filtering predictions
        collaborativeFiltering: {
            de: [{
                number: String,
                probability: mongoose.Schema.Types.Mixed,
                percentage: String
            }],
            lo: [{
                number: String,
                probability: mongoose.Schema.Types.Mixed,
                percentage: String
            }]
        },

        // Ensemble predictions
        ensemble: {
            de: [{
                number: String,
                probability: mongoose.Schema.Types.Mixed,
                percentage: String
            }],
            lo: [{
                number: String,
                probability: mongoose.Schema.Types.Mixed,
                percentage: String
            }]
        }
    },

    // Thống kê xác suất
    probabilityStatistics: {
        numberStatistics: mongoose.Schema.Types.Mixed,
        positionStatistics: mongoose.Schema.Types.Mixed,
        dailyStatistics: mongoose.Schema.Types.Mixed,
        monthlyStatistics: mongoose.Schema.Types.Mixed
    },

    // Metadata
    metadata: {
        // Thời gian tạo
        createdAt: {
            type: Date,
            default: Date.now
        },

        // Thời gian cập nhật
        updatedAt: {
            type: Date,
            default: Date.now
        },

        // Phiên bản dữ liệu
        version: {
            type: String,
            default: '1.0'
        },

        // Trạng thái
        status: {
            type: String,
            enum: ['pending', 'completed', 'failed'],
            default: 'pending'
        },

        // Lỗi nếu có
        error: {
            type: String,
            default: null
        }
    }
}, {
    timestamps: true
});

// Index để tối ưu truy vấn
dailySoiCauDataSchema.index({ predictionDate: 1 });
dailySoiCauDataSchema.index({ 'metadata.status': 1 });
dailySoiCauDataSchema.index({ 'metadata.createdAt': 1 });

// Middleware để cập nhật updatedAt
dailySoiCauDataSchema.pre('save', function (next) {
    this.metadata.updatedAt = new Date();
    next();
});

// Method để lấy dữ liệu theo ngày
dailySoiCauDataSchema.statics.getByPredictionDate = function (date) {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    return this.findOne({
        predictionDate: { $gte: startOfDay, $lte: endOfDay }
    });
};

// Method để lấy dữ liệu gần nhất
dailySoiCauDataSchema.statics.getLatest = function () {
    return this.findOne({ 'metadata.status': 'completed' })
        .sort({ predictionDate: -1 });
};

// Method để lấy dữ liệu trong khoảng thời gian
dailySoiCauDataSchema.statics.getByDateRange = function (startDate, endDate) {
    return this.find({
        predictionDate: { $gte: startDate, $lte: endDate },
        'metadata.status': 'completed'
    }).sort({ predictionDate: -1 });
};

// Method để cập nhật predictions
dailySoiCauDataSchema.statics.updatePredictions = function (targetDate, method, type, predictions) {
    const updatePath = `predictions.${method}.${type}`;
    return this.findOneAndUpdate(
        { predictionDate: targetDate },
        {
            $set: {
                [updatePath]: predictions,
                'metadata.lastUpdated': new Date()
            }
        },
        { new: true }
    );
};

module.exports = mongoose.model('DailySoiCauData', dailySoiCauDataSchema);
