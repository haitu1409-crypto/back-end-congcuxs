/**
 * Saved Statistics Model
 * MongoDB model cho dữ liệu thống kê đã lưu của người dùng
 */

const mongoose = require('mongoose');

const savedStatisticsSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true,
        trim: true,
        maxlength: 50
    },
    password: {
        type: String,
        required: true,
        length: 6,
        match: /^\d{6}$/
    },
    userDisplayName: {
        type: String,
        default: '',
        maxlength: 100
    },
    data: {
        type: mongoose.Schema.Types.Mixed,
        required: true
    },
    savedAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true,
    collection: 'saved_statistics'
});

// Compound index cho username và password
savedStatisticsSchema.index({ username: 1, password: 1 }, { unique: true });

// Index cho tìm kiếm nhanh
savedStatisticsSchema.index({ username: 1 });
savedStatisticsSchema.index({ savedAt: -1 });

// Middleware để cập nhật updatedAt
savedStatisticsSchema.pre('save', function (next) {
    this.updatedAt = new Date();
    next();
});

// Static method để tìm theo username và password
savedStatisticsSchema.statics.findByAuth = async function (username, password) {
    return await this.findOne({ username: username.trim(), password });
};

// Static method để lưu hoặc cập nhật
savedStatisticsSchema.statics.saveOrUpdate = async function (username, password, data, userDisplayName) {
    const filter = { username: username.trim(), password };
    const update = {
        data,
        userDisplayName: userDisplayName || '',
        updatedAt: new Date()
    };

    return await this.findOneAndUpdate(
        filter,
        update,
        {
            upsert: true,
            new: true,
            setDefaultsOnInsert: true
        }
    );
};

const SavedStatistics = mongoose.model('SavedStatistics', savedStatisticsSchema);

module.exports = SavedStatistics;
