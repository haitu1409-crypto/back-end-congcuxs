/**
 * Prediction Model - Quản lý bài viết dự đoán xổ số
 * Lưu trữ 4 loại dự đoán: Lotto, Đặc biệt, Bảng lô top, Dự đoán wukong
 */

const mongoose = require('mongoose');

const predictionSchema = new mongoose.Schema({
    // Ngày dự đoán
    predictionDate: {
        type: Date,
        required: [true, 'Ngày dự đoán là bắt buộc'],
        index: true,
        unique: true // Mỗi ngày chỉ có 1 bài dự đoán
    },

    // Cầu Lotto đẹp nhất hôm này
    lottoContent: {
        type: String,
        required: [true, 'Nội dung cầu Lotto là bắt buộc'],
        trim: true
    },

    // Cầu Đặc biệt đẹp nhất hôm nay
    specialContent: {
        type: String,
        required: [true, 'Nội dung cầu Đặc biệt là bắt buộc'],
        trim: true
    },

    // Cầu 2 nháy đẹp nhất hôm nay
    doubleJumpContent: {
        type: String,
        required: [true, 'Nội dung cầu 2 nháy là bắt buộc'],
        trim: true
    },

    // Bảng lô top
    topTableContent: {
        type: String,
        required: [true, 'Nội dung Bảng lô top là bắt buộc'],
        trim: true
    },

    // Dự đoán wukong
    wukongContent: {
        type: String,
        required: [true, 'Nội dung Dự đoán wukong là bắt buộc'],
        trim: true
    },

    // Metadata
    author: {
        type: String,
        default: 'Admin',
        trim: true
    },

    status: {
        type: String,
        enum: ['draft', 'published', 'archived'],
        default: 'draft',
        index: true
    },

    publishedAt: {
        type: Date,
        index: true
    },

    views: {
        type: Number,
        default: 0,
        index: true
    },

    likes: {
        type: Number,
        default: 0
    },

    shares: {
        type: Number,
        default: 0
    },

    // SEO Metadata
    metaDescription: {
        type: String,
        default: function () {
            const date = new Date(this.predictionDate);
            const formatted = `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
            return `Dự đoán xổ số miền bắc hôm nay ${formatted}: Cầu lotto đẹp, cầu đặc biệt, bảng lô top, dự đoán wukong chính xác nhất từ chuyên gia`;
        }
    },

    keywords: {
        type: [String],
        default: ['dự đoán xsmb', 'cầu lotto', 'cầu đặc biệt', 'bảng lô top', 'dự đoán wukong', 'xổ số miền bắc', 'dàn đề wukong']
    }
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Indexes for performance
predictionSchema.index({ predictionDate: -1, status: 1 });
predictionSchema.index({ status: 1, publishedAt: -1 });

// Virtual for formatted date
predictionSchema.virtual('formattedDate').get(function () {
    const date = new Date(this.predictionDate);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
});

// Pre-save middleware
predictionSchema.pre('save', async function (next) {
    // Set publishedAt when status changes to published
    if (this.isModified('status') && this.status === 'published' && !this.publishedAt) {
        this.publishedAt = new Date();
    }
    next();
});

// Static methods
predictionSchema.statics.findPublished = function () {
    return this.find({ status: 'published' });
};

predictionSchema.statics.findByDate = function (date) {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    return this.findOne({
        predictionDate: {
            $gte: startOfDay,
            $lte: endOfDay
        },
        status: 'published'
    });
};

predictionSchema.statics.findLatest = function (limit = 10) {
    return this.find({
        status: 'published'
    }).sort({ predictionDate: -1 }).limit(limit);
};

predictionSchema.statics.findToday = function () {
    const today = new Date();
    return this.findByDate(today);
};

// Instance methods
predictionSchema.methods.incrementViews = async function () {
    this.views = (this.views || 0) + 1;
    return this.save();
};

predictionSchema.methods.incrementLikes = async function () {
    this.likes = (this.likes || 0) + 1;
    return this.save();
};

predictionSchema.methods.incrementShares = async function () {
    this.shares = (this.shares || 0) + 1;
    return this.save();
};

module.exports = mongoose.model('Prediction', predictionSchema);

