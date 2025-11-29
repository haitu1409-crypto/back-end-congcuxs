const mongoose = require('mongoose');

const positionSoiCauLotoResultSchema = new mongoose.Schema({
    analysisDate: {
        type: String,
        required: true
    },
    analysisDateObj: {
        type: Date,
        required: true
    },
    analysisDays: {
        type: Number,
        required: true
    },
    mode: {
        type: String,
        default: 'loto'
    },
    data: {
        type: mongoose.Schema.Types.Mixed,
        required: true
    },
    lastCalculatedAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

positionSoiCauLotoResultSchema.index({ analysisDate: 1, analysisDays: 1 }, { unique: true });
positionSoiCauLotoResultSchema.index({ analysisDateObj: 1 });

module.exports = mongoose.model('PositionSoiCauLotoResult', positionSoiCauLotoResultSchema);

