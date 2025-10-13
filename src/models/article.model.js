/**
 * Article Model - Quản lý bài viết tin tức
 * Tối ưu cho SEO và hiệu suất
 */

const mongoose = require('mongoose');
const slugify = require('slugify');

const articleSchema = new mongoose.Schema({
    title: {
        type: String,
        required: [true, 'Tiêu đề bài viết là bắt buộc'],
        trim: true,
        maxlength: [200, 'Tiêu đề không được vượt quá 200 ký tự'],
        index: true
    },
    slug: {
        type: String,
        unique: true,
        lowercase: true,
        index: true
    },
    excerpt: {
        type: String,
        required: [true, 'Tóm tắt bài viết là bắt buộc'],
        trim: true,
        maxlength: [500, 'Tóm tắt không được vượt quá 500 ký tự']
    },
    content: {
        type: String,
        required: [true, 'Nội dung bài viết là bắt buộc'],
        trim: true
    },
    featuredImage: {
        url: {
            type: String,
            required: false
        },
        publicId: {
            type: String,
            required: false
        },
        alt: {
            type: String,
            default: ''
        }
    },
    images: [{
        url: String,
        publicId: String,
        alt: String,
        caption: String
    }],
    category: {
        type: String,
        required: [true, 'Danh mục là bắt buộc'],
        enum: [
            'du-doan-ket-qua-xo-so',
            'dan-de-chuyen-nghiep',
            'thong-ke-xo-so',
            'giai-ma-giac-mo',
            'tin-tuc-xo-so',
            'kinh-nghiem-choi-lo-de',
            'meo-vat-xo-so',
            'phuong-phap-soi-cau',
            'huong-dan-choi'
        ],
        index: true
    },
    tags: [{
        type: String,
        trim: true,
        lowercase: true
    }],
    keywords: [{
        type: String,
        trim: true
    }],
    metaDescription: {
        type: String,
        maxlength: [160, 'Meta description không được vượt quá 160 ký tự']
    },
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
    readingTime: {
        type: Number, // in minutes
        default: 1
    },
    isFeatured: {
        type: Boolean,
        default: false,
        index: true
    },
    isTrending: {
        type: Boolean,
        default: false,
        index: true
    },
    seoScore: {
        type: Number,
        default: 0,
        min: 0,
        max: 100
    }
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Indexes for performance
articleSchema.index({ title: 'text', content: 'text', excerpt: 'text' });
articleSchema.index({ category: 1, status: 1, publishedAt: -1 });
articleSchema.index({ tags: 1, status: 1 });
articleSchema.index({ views: -1, publishedAt: -1 });
articleSchema.index({ isFeatured: 1, status: 1, publishedAt: -1 });

// Virtual for URL
articleSchema.virtual('url').get(function () {
    return `/tin-tuc/${this.slug}`;
});

// Pre-save middleware
articleSchema.pre('save', async function (next) {
    // Generate slug from title
    if (this.isModified('title')) {
        let baseSlug = slugify(this.title, {
            lower: true,
            strict: true,
            remove: /[*+~.()'"!:@]/g
        });

        // Check for duplicate slugs and add number if needed
        let slug = baseSlug;
        let counter = 1;

        while (true) {
            const existingArticle = await this.constructor.findOne({
                slug: slug,
                _id: { $ne: this._id } // Exclude current document
            });

            if (!existingArticle) {
                this.slug = slug;
                break;
            }

            // If duplicate found, add counter
            slug = `${baseSlug}-${counter}`;
            counter++;

            console.log(`⚠️ Slug duplicate found, trying: ${slug}`);
        }
    }

    // Set publishedAt when status changes to published
    if (this.isModified('status') && this.status === 'published' && !this.publishedAt) {
        this.publishedAt = new Date();
    }

    // Calculate reading time (average 200 words per minute)
    if (this.isModified('content')) {
        const wordCount = this.content.split(/\s+/).length;
        this.readingTime = Math.max(1, Math.ceil(wordCount / 200));
    }

    // Generate meta description if not provided
    if (!this.metaDescription && this.excerpt) {
        this.metaDescription = this.excerpt.length > 160
            ? this.excerpt.substring(0, 157) + '...'
            : this.excerpt;
    }

    next();
});

// Static methods
articleSchema.statics.findPublished = function () {
    return this.find({ status: 'published' });
};

articleSchema.statics.findByCategory = function (category) {
    return this.find({ category, status: 'published' });
};

articleSchema.statics.findTrending = function (limit = 10) {
    return this.find({
        status: 'published',
        isTrending: true
    }).sort({ views: -1, publishedAt: -1 }).limit(limit);
};

articleSchema.statics.findFeatured = function (limit = 5) {
    return this.find({
        status: 'published',
        isFeatured: true
    }).sort({ publishedAt: -1 }).limit(limit);
};

articleSchema.statics.search = function (query) {
    return this.find({
        $text: { $search: query },
        status: 'published'
    }, {
        score: { $meta: 'textScore' }
    }).sort({ score: { $meta: 'textScore' } });
};

// Instance methods
articleSchema.methods.incrementViews = async function () {
    this.views = (this.views || 0) + 1;
    return this.save();
};

articleSchema.methods.incrementLikes = async function () {
    this.likes = (this.likes || 0) + 1;
    return this.save();
};

articleSchema.methods.incrementShares = async function () {
    this.shares = (this.shares || 0) + 1;
    return this.save();
};

// Category labels
articleSchema.statics.getCategoryLabels = function () {
    return {
        'du-doan-ket-qua-xo-so': 'Dự Đoán Kết Quả Xổ Số',
        'dan-de-chuyen-nghiep': 'Dàn Đề Chuyên Nghiệp',
        'thong-ke-xo-so': 'Thống Kê Xổ Số',
        'giai-ma-giac-mo': 'Giải Mã Giấc Mơ',
        'tin-tuc-xo-so': 'Tin Tức Xổ Số',
        'kinh-nghiem-choi-lo-de': 'Kinh Nghiệm Chơi Lô Đề',
        'meo-vat-xo-so': 'Mẹo Vặt Xổ Số',
        'phuong-phap-soi-cau': 'Phương Pháp Soi Cầu',
        'huong-dan-choi': 'Hướng Dẫn Chơi'
    };
};

module.exports = mongoose.model('Article', articleSchema);
