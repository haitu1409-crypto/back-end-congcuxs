const mongoose = require('mongoose');

const bachThuDeResultSchema = new mongoose.Schema({
    predictionDate: {
        type: Date,
        required: true
    },
    dataDays: {
        type: Number,
        required: true,
        default: 14
    },
    predictions: [{
        method: {
            type: String,
            required: true
        },
        numbers: [{
            type: String,
            required: true
        }],
        description: {
            type: String,
            required: true
        },
        frame: {
            type: String,
            required: true,
            default: '3 ngày'
        }
    }],
    combinedPrediction: {
        type: String,
        required: true
    },
    history: [{
        date: {
            type: String,
            required: true
        },
        predictions: [{
            method: String,
            numbers: [String],
            frame: String
        }],
        frameInfo: [{
            method: String,
            frame: String,
            numbers: [String]
        }],
        actualNumbers: [{
            type: String
        }],
        isHit: {
            type: Boolean,
            default: false
        },
        hitDay: {
            type: Number
        },
        hitMethod: {
            type: String
        },
        hitFrameInfo: {
            frameDays: Number,
            predictionDate: String,
            hitDate: String
        },
        isWaiting: {
            type: Boolean,
            default: false
        },
        hitNumber: {
            type: String
        },
        hitDate: {
            type: String
        }
    }],
    metadata: {
        predictionFor: String,
        dataFrom: String,
        dataTo: String,
        dataPoints: Number,
        totalMethods: Number,
        specialPrize: String,
        firstPrize: String
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Index để tìm kiếm nhanh
bachThuDeResultSchema.index({ predictionDate: 1, dataDays: 1 });

// Static method để tìm theo ngày dự đoán
bachThuDeResultSchema.statics.findByPredictionDate = function (predictionDate, dataDays = 14) {
    return this.findOne({
        predictionDate: predictionDate,
        dataDays: dataDays
    });
};

// Static method để lấy lịch sử
bachThuDeResultSchema.statics.getHistory = function (limit = 14) {
    return this.find()
        .sort({ predictionDate: -1 })
        .limit(limit)
        .select('predictionDate predictions combinedPrediction metadata history');
};

// Method để cập nhật kết quả thực tế
bachThuDeResultSchema.methods.updateActualResults = function (actualNumbers) {
    // Cập nhật lịch sử với kết quả thực tế
    this.history.forEach(entry => {
        if (entry.date === this.predictionDate.toLocaleDateString('vi-VN')) {
            entry.actualNumbers = actualNumbers;
            // Kiểm tra trúng/trượt
            const predictedNumbers = entry.predictions.map(p => p.numbers).flat();
            entry.isHit = actualNumbers.some(num => predictedNumbers.includes(num));
        }
    });

    this.updatedAt = new Date();
    return this.save();
};

module.exports = mongoose.model('BachThuDeResult', bachThuDeResultSchema);
