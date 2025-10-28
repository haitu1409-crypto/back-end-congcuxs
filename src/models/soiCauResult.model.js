const mongoose = require('mongoose');

const soiCauResultSchema = new mongoose.Schema({
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
        number: {
            type: String,
            required: true
        },
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
    additionalSuggestions: [{
        type: String
    }],
    history: [{
        date: {
            type: String,
            required: true
        },
        predictions: [{
            method: String,
            number: String,
            frame: String
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
soiCauResultSchema.index({ predictionDate: 1, dataDays: 1 });

// Static method để tìm theo ngày dự đoán
soiCauResultSchema.statics.findByPredictionDate = function (predictionDate, dataDays = 14) {
    return this.findOne({
        predictionDate: predictionDate,
        dataDays: dataDays
    });
};

// Static method để lấy lịch sử
soiCauResultSchema.statics.getHistory = function (limit = 14) {
    return this.find()
        .sort({ predictionDate: -1 })
        .limit(limit)
        .select('predictionDate predictions combinedPrediction metadata history');
};

// Method để cập nhật kết quả thực tế
soiCauResultSchema.methods.updateActualResults = function (actualNumbers) {
    // Cập nhật lịch sử với kết quả thực tế
    this.history.forEach(entry => {
        if (entry.date === this.predictionDate.toLocaleDateString('vi-VN')) {
            entry.actualNumbers = actualNumbers;
            // Kiểm tra trúng/trượt
            const predictedNumbers = entry.predictions.map(p => p.number);
            entry.isHit = actualNumbers.some(num => predictedNumbers.includes(num));
        }
    });

    this.updatedAt = new Date();
    return this.save();
};

module.exports = mongoose.model('SoiCauResult', soiCauResultSchema);
