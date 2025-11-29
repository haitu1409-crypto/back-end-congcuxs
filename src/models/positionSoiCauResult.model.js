const mongoose = require('mongoose');

const positionSoiCauResultSchema = new mongoose.Schema({
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
        default: 'special'
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

positionSoiCauResultSchema.index({ analysisDate: 1, analysisDays: 1 }, { unique: true });
positionSoiCauResultSchema.index({ analysisDateObj: 1 });

module.exports = mongoose.model('PositionSoiCauResult', positionSoiCauResultSchema);






