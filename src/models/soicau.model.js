/**
 * Soi Cầu Model - Lưu trữ kết quả soi cầu và lịch sử
 */

const mongoose = require('mongoose');

const soicauSchema = new mongoose.Schema({
    // Thông tin cơ bản
    predictionDate: {
        type: Date,
        required: true
    },
    drawDate: {
        type: Date,
        required: true
    },

    // Kết quả soi cầu
    predictions: {
        cdm: {
            de: [{
                number: { type: String, required: true },
                probability: { type: Number, required: true },
                percentage: { type: String, required: true }
            }],
            lo: [{
                number: { type: String, required: true },
                probability: { type: Number, required: true },
                percentage: { type: String, required: true },
                expectedAppearances: { type: Number },
                chanceAppearance: { type: Number }
            }]
        },
        efdm: {
            de: [{
                number: { type: String, required: true },
                probability: { type: Number, required: true },
                percentage: { type: String, required: true }
            }],
            lo: [{
                number: { type: String, required: true },
                probability: { type: Number, required: true },
                percentage: { type: String, required: true },
                expectedAppearances: { type: Number },
                chanceAppearance: { type: Number }
            }]
        },
        collaborativeFiltering: [{
            number: { type: String, required: true },
            probability: { type: Number, required: true },
            percentage: { type: String, required: true }
        }],
        ensemble: [{
            number: { type: String, required: true },
            probability: { type: Number, required: true },
            percentage: { type: String, required: true }
        }]
    },

    // Kết quả thực tế (sau khi có kết quả xổ số)
    actualResults: {
        de: { type: String }, // Số đề thực tế
        lo: [{ type: String }], // Danh sách lô thực tế
        isProcessed: { type: Boolean, default: false }, // Đã xử lý kết quả chưa
        processedAt: { type: Date }
    },

    // Thống kê độ chính xác
    accuracyStats: {
        cdmDe: {
            isCorrect: { type: Boolean, default: false },
            predictedNumber: { type: String },
            actualNumber: { type: String }
        },
        cdmLo: {
            hitCount: { type: Number, default: 0 },
            totalPredicted: { type: Number, default: 0 },
            hitRate: { type: Number, default: 0 },
            hitNumbers: [{ type: String }],
            missNumbers: [{ type: String }]
        },
        efdmDe: {
            isCorrect: { type: Boolean, default: false },
            predictedNumber: { type: String },
            actualNumber: { type: String }
        },
        efdmLo: {
            hitCount: { type: Number, default: 0 },
            totalPredicted: { type: Number, default: 0 },
            hitRate: { type: Number, default: 0 },
            hitNumbers: [{ type: String }],
            missNumbers: [{ type: String }]
        },
        cf: {
            hitCount: { type: Number, default: 0 },
            totalPredicted: { type: Number, default: 0 },
            hitRate: { type: Number, default: 0 },
            hitNumbers: [{ type: String }],
            missNumbers: [{ type: String }]
        },
        ensemble: {
            hitCount: { type: Number, default: 0 },
            totalPredicted: { type: Number, default: 0 },
            hitRate: { type: Number, default: 0 },
            hitNumbers: [{ type: String }],
            missNumbers: [{ type: String }]
        }
    },

    // Metadata
    metadata: {
        dataDays: { type: Number, default: 100 },
        topK: { type: Number, default: 5 },
        algorithm: { type: String, default: 'all' }, // cdm, efdm, cf, ensemble, all
        processingTime: { type: Number }, // Thời gian xử lý (ms)
        cacheHit: { type: Boolean, default: false }
    },

    // Timestamps
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
}, {
    timestamps: true,
    indexes: [
        { predictionDate: 1, drawDate: 1 },
        { drawDate: -1 },
        { 'actualResults.isProcessed': 1 },
        { 'accuracyStats.cdmDe.isCorrect': 1 },
        { 'accuracyStats.efdmDe.isCorrect': 1 },
        // Performance optimization: Compound indexes for common queries
        { predictionDate: 1, 'metadata.status': 1 },
        { drawDate: 1, 'actualResults.isProcessed': 1 },
        // Sparse indexes for better performance
        { 'predictions.ensemble': 1 }, // Sparse index for ensemble predictions
        { 'predictions.cdm.de.number': 1 }, // For number lookups
        { 'predictions.efdm.de.number': 1 }
    ]
});

// Pre-save middleware
soicauSchema.pre('save', function (next) {
    this.updatedAt = new Date();
    next();
});

// Static methods
soicauSchema.statics.findByPredictionDate = function (date) {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    return this.findOne({
        predictionDate: {
            $gte: startOfDay,
            $lte: endOfDay
        }
    });
};

soicauSchema.statics.findByDrawDate = function (date) {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    return this.findOne({
        drawDate: {
            $gte: startOfDay,
            $lte: endOfDay
        }
    });
};

soicauSchema.statics.getAccuracyStats = function (days = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    return this.aggregate([
        {
            $match: {
                'actualResults.isProcessed': true,
                predictionDate: { $gte: startDate }
            }
        },
        {
            $group: {
                _id: null,
                totalPredictions: { $sum: 1 },
                cdmDeAccuracy: {
                    $avg: { $cond: ['$accuracyStats.cdmDe.isCorrect', 1, 0] }
                },
                efdmDeAccuracy: {
                    $avg: { $cond: ['$accuracyStats.efdmDe.isCorrect', 1, 0] }
                },
                avgCdmLoHitRate: { $avg: '$accuracyStats.cdmLo.hitRate' },
                avgEfdmLoHitRate: { $avg: '$accuracyStats.efdmLo.hitRate' },
                avgCfHitRate: { $avg: '$accuracyStats.cf.hitRate' },
                avgEnsembleHitRate: { $avg: '$accuracyStats.ensemble.hitRate' }
            }
        }
    ]);
};

// Instance methods
soicauSchema.methods.calculateAccuracy = function (actualDe, actualLo) {
    // Tính độ chính xác cho đề
    if (actualDe) {
        this.accuracyStats.cdmDe.actualNumber = actualDe;
        this.accuracyStats.cdmDe.isCorrect = this.predictions.cdm.de[0]?.number === actualDe;

        this.accuracyStats.efdmDe.actualNumber = actualDe;
        this.accuracyStats.efdmDe.isCorrect = this.predictions.efdm.de[0]?.number === actualDe;
    }

    // Tính độ chính xác cho lô
    if (actualLo && Array.isArray(actualLo)) {
        // CDM Lo
        const cdmLoPredicted = this.predictions.cdm.lo.map(p => p.number);
        const cdmLoHitNumbers = cdmLoPredicted.filter(num => actualLo.includes(num));
        this.accuracyStats.cdmLo.hitCount = cdmLoHitNumbers.length;
        this.accuracyStats.cdmLo.totalPredicted = cdmLoPredicted.length;
        this.accuracyStats.cdmLo.hitRate = this.accuracyStats.cdmLo.totalPredicted > 0
            ? this.accuracyStats.cdmLo.hitCount / this.accuracyStats.cdmLo.totalPredicted
            : 0;
        this.accuracyStats.cdmLo.hitNumbers = cdmLoHitNumbers;
        this.accuracyStats.cdmLo.missNumbers = cdmLoPredicted.filter(num => !actualLo.includes(num));

        // EFDM Lo
        const efdmLoPredicted = this.predictions.efdm.lo.map(p => p.number);
        const efdmLoHitNumbers = efdmLoPredicted.filter(num => actualLo.includes(num));
        this.accuracyStats.efdmLo.hitCount = efdmLoHitNumbers.length;
        this.accuracyStats.efdmLo.totalPredicted = efdmLoPredicted.length;
        this.accuracyStats.efdmLo.hitRate = this.accuracyStats.efdmLo.totalPredicted > 0
            ? this.accuracyStats.efdmLo.hitCount / this.accuracyStats.efdmLo.totalPredicted
            : 0;
        this.accuracyStats.efdmLo.hitNumbers = efdmLoHitNumbers;
        this.accuracyStats.efdmLo.missNumbers = efdmLoPredicted.filter(num => !actualLo.includes(num));

        // Collaborative Filtering
        const cfPredicted = this.predictions.collaborativeFiltering.map(p => p.number);
        const cfHitNumbers = cfPredicted.filter(num => actualLo.includes(num));
        this.accuracyStats.cf.hitCount = cfHitNumbers.length;
        this.accuracyStats.cf.totalPredicted = cfPredicted.length;
        this.accuracyStats.cf.hitRate = this.accuracyStats.cf.totalPredicted > 0
            ? this.accuracyStats.cf.hitCount / this.accuracyStats.cf.totalPredicted
            : 0;
        this.accuracyStats.cf.hitNumbers = cfHitNumbers;
        this.accuracyStats.cf.missNumbers = cfPredicted.filter(num => !actualLo.includes(num));

        // Ensemble
        const ensemblePredicted = this.predictions.ensemble.map(p => p.number);
        const ensembleHitNumbers = ensemblePredicted.filter(num => actualLo.includes(num));
        this.accuracyStats.ensemble.hitCount = ensembleHitNumbers.length;
        this.accuracyStats.ensemble.totalPredicted = ensemblePredicted.length;
        this.accuracyStats.ensemble.hitRate = this.accuracyStats.ensemble.totalPredicted > 0
            ? this.accuracyStats.ensemble.hitCount / this.accuracyStats.ensemble.totalPredicted
            : 0;
        this.accuracyStats.ensemble.hitNumbers = ensembleHitNumbers;
        this.accuracyStats.ensemble.missNumbers = ensemblePredicted.filter(num => !actualLo.includes(num));
    }

    this.actualResults.isProcessed = true;
    this.actualResults.processedAt = new Date();

    return this;
};

module.exports = mongoose.model('SoiCau', soicauSchema);
