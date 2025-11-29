const mongoose = require('mongoose');

const PredictionScoreSchema = new mongoose.Schema(
    {
        chatId: { type: String, required: true, index: true },
        userId: { type: String, required: true, index: true },
        username: { type: String },
        displayName: { type: String },
        points: { type: Number, default: 0 },
        history: {
            type: [
                {
                    delta: Number,
                    label: String,
                    reason: String,
                    normalizedDate: String,
                    createdAt: { type: Date, default: Date.now }
                }
            ],
            default: []
        }
    },
    { timestamps: true }
);

PredictionScoreSchema.index({ chatId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model('PredictionScore', PredictionScoreSchema);



