/**
 * Article Controller - Quản lý bài viết tin tức
 * Tối ưu hiệu suất với caching và pagination
 */

const Article = require('../models/article.model');
const NodeCache = require('node-cache');
const cloudinary = require('cloudinary').v2;

// Cache configuration
const cache = new NodeCache({
    stdTTL: 300, // 5 minutes
    checkperiod: 60 // 1 minute
});

// Configure Cloudinary
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// Admin password
const ADMIN_PASSWORD = '141920';

/**
 * Get all published articles with pagination
 */
const getArticles = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10; // 10 articles per page
        const category = req.query.category;
        const search = req.query.search;
        const sort = req.query.sort || '-publishedAt';

        const cacheKey = `articles_${page}_${limit}_${category || 'all'}_${search || 'none'}_${sort}`;
        const cachedData = cache.get(cacheKey);

        if (cachedData) {
            return res.json({
                success: true,
                data: cachedData,
                cached: true
            });
        }

        // Build query
        let query = { status: 'published' };

        if (category) {
            query.category = category;
        }

        if (search) {
            query.$text = { $search: search };
        }

        // Debug log
        console.log('🔍 Articles API Query:', {
            category: category || 'all',
            page,
            limit,
            sort,
            query
        });

        // Calculate pagination
        const skip = (page - 1) * limit;
        const total = await Article.countDocuments(query);

        // Build sort object
        let sortObj = {};
        if (sort === 'views') {
            sortObj = { views: -1, publishedAt: -1 };
        } else if (sort === 'trending') {
            sortObj = { isTrending: -1, views: -1, publishedAt: -1 };
        } else {
            sortObj = { publishedAt: -1 };
        }

        const articles = await Article.find(query)
            .select('-content') // Exclude full content for list view
            .sort(sortObj)
            .skip(skip)
            .limit(limit)
            .lean();

        const result = {
            articles,
            pagination: {
                currentPage: page,
                totalPages: Math.ceil(total / limit),
                totalArticles: total,
                hasNext: page < Math.ceil(total / limit),
                hasPrev: page > 1
            }
        };

        // Cache the result
        cache.set(cacheKey, result);

        res.json({
            success: true,
            data: result
        });

    } catch (error) {
        console.error('Error getting articles:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy danh sách bài viết',
            error: error.message
        });
    }
};

/**
 * Get single article by slug
 */
const getArticleBySlug = async (req, res) => {
    try {
        const { slug } = req.params;
        const cacheKey = `article_${slug}`;
        const cachedArticle = cache.get(cacheKey);

        if (cachedArticle) {
            // Increment views in background
            Article.findOneAndUpdate(
                { slug },
                { $inc: { views: 1 } },
                { new: true }
            ).exec();

            return res.json({
                success: true,
                data: cachedArticle,
                cached: true
            });
        }

        const article = await Article.findOne({
            slug,
            status: 'published'
        }).lean();

        if (!article) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy bài viết'
            });
        }

        // Increment views (separate query)
        await Article.findOneAndUpdate(
            { slug, status: 'published' },
            { $inc: { views: 1 } }
        );

        // Update article views for response
        article.views = (article.views || 0) + 1;

        // Cache the article (already plain object from .lean())
        cache.set(cacheKey, article);

        res.json({
            success: true,
            data: article
        });

    } catch (error) {
        console.error('Error getting article:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy bài viết',
            error: error.message
        });
    }
};

/**
 * Get featured articles - now returns latest articles from selected category
 */
const getFeaturedArticles = async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 3;
        const category = req.query.category; // Add category parameter

        const cacheKey = `featured_articles_${limit}_${category || 'all'}`;
        const cachedData = cache.get(cacheKey);

        if (cachedData) {
            return res.json({
                success: true,
                data: cachedData,
                cached: true
            });
        }

        // Build query - get featured articles (isFeatured = true) from selected category or all categories
        let query = { 
            status: 'published',
            isFeatured: true // Chỉ lấy bài viết có checkbox "Bài viết nổi bật"
        };
        if (category) {
            query.category = category;
        }

        const articles = await Article.find(query)
            .select('-content') // Exclude full content for list view
            .sort({ publishedAt: -1 }) // Latest first
            .limit(limit)
            .lean();

        // Debug log
        console.log('🌟 Featured Articles API:', {
            category: category || 'all',
            limit,
            articlesCount: articles.length,
            articles: articles.map(a => ({ title: a.title, category: a.category, publishedAt: a.publishedAt }))
        });

        cache.set(cacheKey, articles);

        res.json({
            success: true,
            data: articles
        });

    } catch (error) {
        console.error('Error getting featured articles:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy bài viết nổi bật',
            error: error.message
        });
    }
};

/**
 * Get trending articles
 */
const getTrendingArticles = async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 10;
        const cacheKey = `trending_articles_${limit}`;
        const cachedData = cache.get(cacheKey);

        if (cachedData) {
            return res.json({
                success: true,
                data: cachedData,
                cached: true
            });
        }

        const articles = await Article.findTrending(limit);
        // Convert Mongoose documents to plain objects for caching
        const articlesData = articles.map(article => article.toObject());
        cache.set(cacheKey, articlesData);

        res.json({
            success: true,
            data: articles
        });

    } catch (error) {
        console.error('Error getting trending articles:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy bài viết trending',
            error: error.message
        });
    }
};

/**
 * Get articles by category
 */
const getArticlesByCategory = async (req, res) => {
    try {
        const { category } = req.params;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;

        const cacheKey = `category_${category}_${page}_${limit}`;
        const cachedData = cache.get(cacheKey);

        if (cachedData) {
            return res.json({
                success: true,
                data: cachedData,
                cached: true
            });
        }

        const skip = (page - 1) * limit;
        const total = await Article.countDocuments({
            category,
            status: 'published'
        });

        const articles = await Article.findByCategory(category)
            .select('-content')
            .sort({ publishedAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean();

        const result = {
            articles,
            pagination: {
                currentPage: page,
                totalPages: Math.ceil(total / limit),
                totalArticles: total,
                hasNext: page < Math.ceil(total / limit),
                hasPrev: page > 1
            }
        };

        // Debug log
        console.log('📰 Articles API Response:', {
            category: category || 'all',
            page,
            limit,
            articlesCount: articles.length,
            totalArticles: total,
            totalPages: Math.ceil(total / limit),
            pagination: {
                currentPage: page,
                totalPages: Math.ceil(total / limit),
                hasNext: page < Math.ceil(total / limit),
                hasPrev: page > 1
            },
            heroArticle: articles.length > 0 ? {
                title: articles[0].title,
                category: articles[0].category,
                publishedAt: articles[0].publishedAt
            } : null
        });

        cache.set(cacheKey, result);

        res.json({
            success: true,
            data: result
        });

    } catch (error) {
        console.error('Error getting articles by category:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy bài viết theo danh mục',
            error: error.message
        });
    }
};

/**
 * Search articles
 */
const searchArticles = async (req, res) => {
    try {
        const { q } = req.query;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;

        if (!q || q.trim().length < 2) {
            return res.status(400).json({
                success: false,
                message: 'Từ khóa tìm kiếm phải có ít nhất 2 ký tự'
            });
        }

        const cacheKey = `search_${q}_${page}_${limit}`;
        const cachedData = cache.get(cacheKey);

        if (cachedData) {
            return res.json({
                success: true,
                data: cachedData,
                cached: true
            });
        }

        const skip = (page - 1) * limit;
        const total = await Article.countDocuments({
            $text: { $search: q },
            status: 'published'
        });

        const articles = await Article.search(q)
            .select('-content')
            .skip(skip)
            .limit(limit)
            .lean();

        const result = {
            articles,
            query: q,
            pagination: {
                currentPage: page,
                totalPages: Math.ceil(total / limit),
                totalArticles: total,
                hasNext: page < Math.ceil(total / limit),
                hasPrev: page > 1
            }
        };

        cache.set(cacheKey, result);

        res.json({
            success: true,
            data: result
        });

    } catch (error) {
        console.error('Error searching articles:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi tìm kiếm bài viết',
            error: error.message
        });
    }
};

/**
 * Create new article (Admin only)
 */
const createArticle = async (req, res) => {
    try {
        console.log('📝 Bắt đầu tạo bài viết...');
        console.log('📋 Request body:', req.body);
        console.log('📁 Request files:', req.files);
        console.log('🖼️ FeaturedImage trong request:', req.body.featuredImage);

        const { password } = req.body;

        // Check admin password
        if (password !== ADMIN_PASSWORD) {
            console.log('❌ Mật khẩu không đúng');
            return res.status(401).json({
                success: false,
                message: 'Mật khẩu không đúng'
            });
        }

        const {
            title,
            excerpt,
            content,
            category,
            tags,
            keywords,
            metaDescription,
            author,
            isFeatured,
            isTrending
        } = req.body;

        // Validate required fields
        if (!title || !excerpt || !content || !category) {
            console.log('❌ Thiếu thông tin bắt buộc');
            return res.status(400).json({
                success: false,
                message: 'Vui lòng điền đầy đủ thông tin bắt buộc (tiêu đề, tóm tắt, nội dung, danh mục)'
            });
        }

        // Handle featured image - can be from frontend (already uploaded) or file upload
        let featuredImage = null;

        // Check if featuredImage is already provided in request body (from frontend upload)
        if (req.body.featuredImage) {
            try {
                let frontendImage;

                // Try to parse if it's a string, otherwise use directly
                if (typeof req.body.featuredImage === 'string') {
                    frontendImage = JSON.parse(req.body.featuredImage);
                } else {
                    frontendImage = req.body.featuredImage;
                }

                console.log('🔍 FeaturedImage data:', frontendImage);

                if (frontendImage && frontendImage.url) {
                    featuredImage = {
                        url: frontendImage.url,
                        alt: frontendImage.alt || title,
                        originalname: frontendImage.originalname
                    };
                    console.log('✅ Sử dụng ảnh đại diện từ frontend:', frontendImage.url);
                } else {
                    console.log('⚠️ FeaturedImage không có URL:', frontendImage);
                }
            } catch (parseError) {
                console.log('⚠️ Không thể parse featuredImage từ frontend:', parseError.message);
            }
        }

        // If no featuredImage from frontend, try file upload to Cloudinary
        if (!featuredImage && req.files && req.files.featuredImage) {
            try {
                console.log('📷 Bắt đầu upload ảnh đại diện...');
                const file = req.files.featuredImage;
                console.log('📁 File info:', {
                    fieldname: file.fieldname,
                    originalname: file.originalname,
                    mimetype: file.mimetype,
                    size: file.size,
                    path: file.path
                });

                // Check if file exists
                if (!file.path) {
                    throw new Error('File path not found');
                }

                const result = await cloudinary.uploader.upload(
                    file.path,
                    {
                        folder: 'articles/featured',
                        transformation: [
                            { width: 1200, height: 630, crop: 'fill', quality: 'auto' }
                        ]
                    }
                );

                featuredImage = {
                    url: result.secure_url,
                    publicId: result.public_id,
                    alt: title
                };
                console.log('✅ Upload ảnh đại diện thành công:', result.secure_url);
            } catch (uploadError) {
                console.error('❌ Lỗi upload ảnh đại diện:', uploadError);
                // Don't return error, just log and continue without image
                console.log('⚠️ Tiếp tục tạo bài viết không có ảnh đại diện');
            }
        }

        if (!featuredImage) {
            console.log('⚠️ Không có ảnh đại diện');
        }

        // Handle additional images - can be from frontend (already uploaded) or file upload
        let images = [];

        // Check if images are already provided in request body (from frontend upload)
        if (req.body.images) {
            try {
                const frontendImages = JSON.parse(req.body.images);
                if (Array.isArray(frontendImages)) {
                    images = frontendImages.filter(img => img && img.url);
                    console.log('✅ Sử dụng images từ frontend:', images.length);
                }
            } catch (parseError) {
                console.log('⚠️ Không thể parse images từ frontend:', parseError.message);
            }
        }

        // If no images from frontend, try file upload to Cloudinary
        if (images.length === 0 && req.files && req.files.images) {
            try {
                const imageFiles = Array.isArray(req.files.images)
                    ? req.files.images
                    : [req.files.images];

                for (const imageFile of imageFiles) {
                    if (imageFile.path) {
                        const result = await cloudinary.uploader.upload(
                            imageFile.path,
                            {
                                folder: 'articles/images',
                                transformation: [
                                    { width: 800, height: 600, crop: 'limit', quality: 'auto' }
                                ]
                            }
                        );
                        images.push({
                            url: result.secure_url,
                            publicId: result.public_id,
                            alt: title
                        });
                    }
                }
                console.log('✅ Upload', images.length, 'ảnh bổ sung thành công');
            } catch (uploadError) {
                console.error('❌ Lỗi upload ảnh bổ sung:', uploadError);
                console.log('⚠️ Tiếp tục tạo bài viết không có ảnh bổ sung');
            }
        }

        console.log('💾 Bắt đầu lưu bài viết vào database...');

        // Handle tags and keywords - can be string or array
        const processTags = (tags) => {
            if (!tags) return [];

            // Try to parse if it's a JSON string
            if (typeof tags === 'string') {
                try {
                    const parsed = JSON.parse(tags);
                    if (Array.isArray(parsed)) {
                        return parsed.filter(tag => tag && tag.trim());
                    }
                } catch (e) {
                    // Not JSON, treat as comma-separated
                    return tags.split(',').map(tag => tag.trim()).filter(tag => tag);
                }
            }

            if (Array.isArray(tags)) {
                return tags.filter(tag => tag && tag.trim());
            }

            return [];
        };

        const processKeywords = (keywords) => {
            if (!keywords) return [];

            // Try to parse if it's a JSON string
            if (typeof keywords === 'string') {
                try {
                    const parsed = JSON.parse(keywords);
                    if (Array.isArray(parsed)) {
                        return parsed.filter(keyword => keyword && keyword.trim());
                    }
                } catch (e) {
                    // Not JSON, treat as comma-separated
                    return keywords.split(',').map(keyword => keyword.trim()).filter(keyword => keyword);
                }
            }

            if (Array.isArray(keywords)) {
                return keywords.filter(keyword => keyword && keyword.trim());
            }

            return [];
        };

        // Truncate metaDescription if it's too long
        const processMetaDescription = (description) => {
            if (!description) return '';
            if (description.length <= 160) return description;
            console.log(`⚠️ MetaDescription truncated from ${description.length} to 160 chars`);
            // Truncate to 157 chars and add "..."
            return description.substring(0, 157) + '...';
        };

        // Truncate title if it's too long
        const processTitle = (text) => {
            if (!text) return '';
            if (text.length <= 200) return text;
            console.log(`⚠️ Title truncated from ${text.length} to 200 chars`);
            return text.substring(0, 197) + '...';
        };

        // Truncate excerpt if it's too long
        const processExcerpt = (text) => {
            if (!text) return '';
            if (text.length <= 500) return text;
            console.log(`⚠️ Excerpt truncated from ${text.length} to 500 chars`);
            return text.substring(0, 497) + '...';
        };

        const articleData = {
            title: processTitle(title),
            excerpt: processExcerpt(excerpt),
            content,
            category,
            tags: processTags(tags),
            keywords: processKeywords(keywords),
            metaDescription: processMetaDescription(metaDescription),
            author: author || 'Admin',
            images,
            isFeatured: isFeatured === 'true',
            isTrending: isTrending === 'true',
            status: 'published'
        };

        // Only add featuredImage if it exists
        if (featuredImage && featuredImage.url) {
            articleData.featuredImage = featuredImage;
        }

        const article = new Article(articleData);

        console.log('📄 Article data:', {
            title: article.title,
            category: article.category,
            tags: article.tags,
            hasFeaturedImage: !!article.featuredImage,
            hasImages: article.images.length > 0
        });

        const savedArticle = await article.save();
        console.log('✅ Lưu bài viết thành công! ID:', savedArticle._id);

        // Clear related caches
        cache.flushAll();
        console.log('🗑️ Đã xóa cache');

        res.status(201).json({
            success: true,
            message: 'Tạo bài viết thành công',
            data: savedArticle
        });

    } catch (error) {
        console.error('❌ Error creating article:', error);
        console.error('❌ Error stack:', error.stack);

        // Clean up uploaded files on error
        if (req.files) {
            const fs = require('fs');
            Object.values(req.files).forEach(fileArray => {
                const files = Array.isArray(fileArray) ? fileArray : [fileArray];
                files.forEach(file => {
                    if (file.path && fs.existsSync(file.path)) {
                        try {
                            fs.unlinkSync(file.path);
                            console.log('🗑️ Cleaned up file:', file.path);
                        } catch (cleanupError) {
                            console.error('❌ Error cleaning up file:', cleanupError);
                        }
                    }
                });
            });
        }

        res.status(500).json({
            success: false,
            message: 'Lỗi khi tạo bài viết: ' + error.message,
            error: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
};

/**
 * Get categories - Đồng bộ với front-end, group category cũ thành category mới
 */
const getCategories = async (req, res) => {
    try {
        const cacheKey = 'categories';
        const cachedData = cache.get(cacheKey);

        if (cachedData) {
            return res.json({
                success: true,
                data: cachedData,
                cached: true
            });
        }

        // Lấy thống kê category từ database (category cũ)
        const categoryStats = await Article.aggregate([
            { $match: { status: 'published' } },
            { $group: { _id: '$category', count: { $sum: 1 } } },
            { $sort: { count: -1 } }
        ]);

        // Group category cũ thành category mới (đồng bộ với front-end)
        const groupedCategories = {};
        
        categoryStats.forEach(stat => {
            const oldCategory = stat._id;
            const newCategory = Article.mapOldCategoryToNew(oldCategory);
            
            if (groupedCategories[newCategory]) {
                groupedCategories[newCategory].count += stat.count;
            } else {
                groupedCategories[newCategory] = {
                    key: newCategory,
                    label: Article.getCategoryLabel(newCategory),
                    count: stat.count
                };
            }
        });

        // Trả về theo thứ tự mong muốn (đồng bộ với front-end)
        const order = ['lien-minh-huyen-thoai', 'lien-quan-mobile', 'dau-truong-chan-ly-tft', 'trending'];
        const result = order
            .map(key => groupedCategories[key])
            .filter(cat => cat) // Loại bỏ undefined
            .map(cat => ({
                key: cat.key,
                count: cat.count
            }));

        // Nếu không có category nào, trả về category mới với count = 0
        if (result.length === 0) {
            const newCategoryLabels = {
                'lien-minh-huyen-thoai': 'Liên Minh Huyền Thoại',
                'lien-quan-mobile': 'Liên Quân Mobile',
                'dau-truong-chan-ly-tft': 'Đấu Trường Chân Lý TFT',
                'trending': 'Trending'
            };
            
            result.push(...order.map(key => ({
                key: key,
                count: 0
            })));
        }

        cache.set(cacheKey, result);

        res.json({
            success: true,
            data: result
        });

    } catch (error) {
        console.error('Error getting categories:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy danh mục',
            error: error.message
        });
    }
};

/**
 * Like article
 */
const likeArticle = async (req, res) => {
    try {
        const { slug } = req.params;

        const article = await Article.findOneAndUpdate(
            { slug, status: 'published' },
            { $inc: { likes: 1 } },
            { new: true }
        );

        if (!article) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy bài viết'
            });
        }

        res.json({
            success: true,
            data: { likes: article.likes }
        });

    } catch (error) {
        console.error('Error liking article:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi like bài viết',
            error: error.message
        });
    }
};

/**
 * Share article
 */
const shareArticle = async (req, res) => {
    try {
        const { slug } = req.params;

        const article = await Article.findOneAndUpdate(
            { slug, status: 'published' },
            { $inc: { shares: 1 } },
            { new: true }
        );

        if (!article) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy bài viết'
            });
        }

        res.json({
            success: true,
            data: { shares: article.shares }
        });

    } catch (error) {
        console.error('Error sharing article:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi share bài viết',
            error: error.message
        });
    }
};

/**
 * Delete article (Admin only)
 */
const deleteArticle = async (req, res) => {
    try {
        const { id } = req.params;
        const { password } = req.body;

        // Check admin password
        if (password !== ADMIN_PASSWORD) {
            return res.status(401).json({
                success: false,
                message: 'Mật khẩu không đúng'
            });
        }

        const deletedArticle = await Article.findByIdAndDelete(id);

        if (!deletedArticle) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy bài viết'
            });
        }

        // Clear caches
        cache.flushAll();

        res.json({
            success: true,
            message: 'Xóa bài viết thành công'
        });

    } catch (error) {
        console.error('Error deleting article:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi xóa bài viết',
            error: error.message
        });
    }
};

module.exports = {
    getArticles,
    getArticleBySlug,
    getFeaturedArticles,
    getTrendingArticles,
    getArticlesByCategory,
    searchArticles,
    createArticle,
    getCategories,
    likeArticle,
    shareArticle,
    deleteArticle
};
