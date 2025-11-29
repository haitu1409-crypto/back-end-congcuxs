const mongoose = require('mongoose');

const UserPredictionSchema = new mongoose.Schema(
    {
        chatId: { type: String, required: true, index: true },
        userId: { type: String, required: true, index: true },
        username: { type: String },
        displayName: { type: String },
        normalizedDate: { type: String, required: true, index: true },
        drawDate: { type: Date, required: true },
        numbers: {
            type: [String],
            default: [],
            validate: {
                validator: (arr) => arr.every(num => /^\d{2}$/.test(num)),
                message: 'Each number must be 2 digits'
            }
        },
        matchedNumbers: { type: [String], default: [] },
        status: {
            type: String,
            enum: ['pending', 'hit', 'miss'],
            default: 'pending'
        },
        resultNotified: {
            type: Boolean,
            default: false
        },
        matchedLabel: { type: String },
        matchedChamLabels: { type: [String], default: [] },
        scoreDelta: { type: Number, default: 0 },
        updateCount: { type: Number, default: 0 },
        groups: {
            type: [
                {
                    label: { type: String },
                    rawLabel: { type: String },
                    count: { type: Number },
                    numbers: {
                        type: [String],
                        default: []
                    },
                    groupType: {
                        type: String,
                        enum: ['default', 'cham'],
                        default: 'default'
                    },
                    chamDigits: {
                        type: [String],
                        default: [],
                        validate: {
                            validator: (arr) => arr.every(digit => /^\d$/.test(digit)),
                            message: 'Cham digits must be single digits'
                        }
                    }
                }
            ],
            default: []
        }
    },
    { timestamps: true }
);

UserPredictionSchema.index({ chatId: 1, normalizedDate: 1 });

module.exports = mongoose.model('UserPrediction', UserPredictionSchema);

