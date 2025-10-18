/**
 * Prediction Controller - Quản lý bài viết dự đoán xổ số
 * Tối ưu hiệu suất với caching và pagination
 */

const Prediction = require('../models/prediction.model');
const NodeCache = require('node-cache');

// Cache configuration
const cache = new NodeCache({
    stdTTL: 300, // 5 minutes
    checkperiod: 60 // 1 minute
});

// Admin password
const ADMIN_PASSWORD = '141920';

/**
 * Get all published predictions with pagination
 */
const getPredictions = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const sort = req.query.sort || '-predictionDate';

        const cacheKey = `predictions_${page}_${limit}_${sort}`;
        const cachedData = cache.get(cacheKey);

        if (cachedData) {
            return res.json({
                success: true,
                data: cachedData,
                cached: true
            });
        }

        // Build query
        const query = { status: 'published' };

        // Calculate pagination
        const skip = (page - 1) * limit;
        const total = await Prediction.countDocuments(query);

        // Build sort object
        let sortObj = {};
        if (sort === 'views') {
            sortObj = { views: -1, predictionDate: -1 };
        } else {
            sortObj = { predictionDate: -1 };
        }

        const predictions = await Prediction.find(query)
            .sort(sortObj)
            .skip(skip)
            .limit(limit)
            .lean();

        const result = {
            predictions,
            pagination: {
                currentPage: page,
                totalPages: Math.ceil(total / limit),
                totalPredictions: total,
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
        console.error('Error getting predictions:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy danh sách dự đoán',
            error: error.message
        });
    }
};

/**
 * Get prediction by ID
 */
const getPredictionById = async (req, res) => {
    try {
        const { id } = req.params;

        const prediction = await Prediction.findById(id);

        if (!prediction) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy dự đoán'
            });
        }

        res.json({
            success: true,
            data: prediction
        });

    } catch (error) {
        console.error('Error getting prediction by ID:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy dự đoán',
            error: error.message
        });
    }
};

/**
 * Get prediction by date
 */
const getPredictionByDate = async (req, res) => {
    try {
        const { date } = req.params; // Format: YYYY-MM-DD
        const cacheKey = `prediction_${date}`;
        const cachedPrediction = cache.get(cacheKey);

        if (cachedPrediction) {
            // Increment views in background
            Prediction.findByDate(new Date(date)).then(prediction => {
                if (prediction) {
                    prediction.incrementViews();
                }
            });

            return res.json({
                success: true,
                data: cachedPrediction,
                cached: true
            });
        }

        const prediction = await Prediction.findByDate(new Date(date));

        if (!prediction) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy dự đoán cho ngày này'
            });
        }

        // Increment views
        await prediction.incrementViews();

        // Cache the prediction
        cache.set(cacheKey, prediction);

        res.json({
            success: true,
            data: prediction
        });

    } catch (error) {
        console.error('Error getting prediction:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy dự đoán',
            error: error.message
        });
    }
};

/**
 * Get today's prediction (fallback to latest if no prediction for today)
 */
const getTodayPrediction = async (req, res) => {
    try {
        const today = new Date();
        const dateStr = today.toISOString().split('T')[0];
        const cacheKey = `prediction_today_${dateStr}`;
        const cachedData = cache.get(cacheKey);

        if (cachedData) {
            return res.json({
                success: true,
                data: cachedData,
                cached: true,
                isToday: true
            });
        }

        // Try to get today's prediction first
        let prediction = await Prediction.findToday();
        let isToday = true;

        // If no prediction for today, get the latest one
        if (!prediction) {
            console.log('⚠️ Không có dự đoán cho hôm nay, lấy bài mới nhất...');
            const latestPredictions = await Prediction.findLatest(1);
            prediction = latestPredictions[0];
            isToday = false;
        }

        if (!prediction) {
            return res.status(404).json({
                success: false,
                message: 'Chưa có dự đoán nào'
            });
        }

        // Increment views in background
        prediction.incrementViews().catch(err => console.error('Error incrementing views:', err));

        // Cache the result
        cache.set(cacheKey, prediction, 300); // Cache for 5 minutes

        res.json({
            success: true,
            data: prediction,
            isToday: isToday
        });

    } catch (error) {
        console.error('Error getting today prediction:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy dự đoán hôm nay',
            error: error.message
        });
    }
};

/**
 * Get latest predictions
 */
const getLatestPredictions = async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 10;
        const cacheKey = `latest_predictions_${limit}`;
        const cachedData = cache.get(cacheKey);

        if (cachedData) {
            return res.json({
                success: true,
                data: cachedData,
                cached: true
            });
        }

        const predictions = await Prediction.findLatest(limit);
        cache.set(cacheKey, predictions);

        res.json({
            success: true,
            data: predictions
        });

    } catch (error) {
        console.error('Error getting latest predictions:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi lấy dự đoán mới nhất',
            error: error.message
        });
    }
};

/**
 * Create new prediction (Admin only)
 */
const createPrediction = async (req, res) => {
    try {
        console.log('📝 Bắt đầu tạo bài dự đoán...');
        console.log('📋 Request body:', req.body);

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
            predictionDate,
            lottoContent,
            specialContent,
            doubleJumpContent,
            topTableContent,
            wukongContent,
            author,
            status
        } = req.body;

        // Validate required fields
        if (!predictionDate || !lottoContent || !specialContent || !doubleJumpContent || !topTableContent || !wukongContent) {
            console.log('❌ Thiếu thông tin bắt buộc');
            return res.status(400).json({
                success: false,
                message: 'Vui lòng điền đầy đủ thông tin cho cả 5 loại dự đoán'
            });
        }

        // Check if prediction for this date already exists
        const existingPrediction = await Prediction.findByDate(new Date(predictionDate));
        if (existingPrediction) {
            return res.status(400).json({
                success: false,
                message: 'Đã có dự đoán cho ngày này. Vui lòng chọn ngày khác hoặc cập nhật dự đoán hiện tại.'
            });
        }

        const predictionData = {
            predictionDate: new Date(predictionDate),
            lottoContent,
            specialContent,
            doubleJumpContent,
            topTableContent,
            wukongContent,
            author: author || 'Admin',
            status: status || 'published'
        };

        const prediction = new Prediction(predictionData);

        console.log('📄 Prediction data:', {
            predictionDate: prediction.predictionDate,
            author: prediction.author,
            status: prediction.status
        });

        const savedPrediction = await prediction.save();
        console.log('✅ Lưu dự đoán thành công! ID:', savedPrediction._id);

        // Clear related caches
        cache.flushAll();
        console.log('🗑️ Đã xóa cache');

        res.status(201).json({
            success: true,
            message: 'Tạo dự đoán thành công',
            data: savedPrediction
        });

    } catch (error) {
        console.error('❌ Error creating prediction:', error);
        console.error('❌ Error stack:', error.stack);

        res.status(500).json({
            success: false,
            message: 'Lỗi khi tạo dự đoán: ' + error.message,
            error: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
};

/**
 * Update prediction (Admin only)
 */
const updatePrediction = async (req, res) => {
    try {
        console.log('📝 Bắt đầu cập nhật dự đoán...');
        const { id } = req.params;
        const { password } = req.body;

        // Check admin password
        if (password !== ADMIN_PASSWORD) {
            return res.status(401).json({
                success: false,
                message: 'Mật khẩu không đúng'
            });
        }

        const {
            lottoContent,
            specialContent,
            doubleJumpContent,
            topTableContent,
            wukongContent,
            author,
            status
        } = req.body;

        const updateData = {};
        if (lottoContent) updateData.lottoContent = lottoContent;
        if (specialContent) updateData.specialContent = specialContent;
        if (doubleJumpContent) updateData.doubleJumpContent = doubleJumpContent;
        if (topTableContent) updateData.topTableContent = topTableContent;
        if (wukongContent) updateData.wukongContent = wukongContent;
        if (author) updateData.author = author;
        if (status) updateData.status = status;

        const updatedPrediction = await Prediction.findByIdAndUpdate(
            id,
            updateData,
            { new: true, runValidators: true }
        );

        if (!updatedPrediction) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy dự đoán'
            });
        }

        // Clear caches
        cache.flushAll();

        res.json({
            success: true,
            message: 'Cập nhật dự đoán thành công',
            data: updatedPrediction
        });

    } catch (error) {
        console.error('Error updating prediction:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi cập nhật dự đoán',
            error: error.message
        });
    }
};

/**
 * Delete prediction (Admin only)
 */
const deletePrediction = async (req, res) => {
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

        const deletedPrediction = await Prediction.findByIdAndDelete(id);

        if (!deletedPrediction) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy dự đoán'
            });
        }

        // Clear caches
        cache.flushAll();

        res.json({
            success: true,
            message: 'Xóa dự đoán thành công'
        });

    } catch (error) {
        console.error('Error deleting prediction:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi xóa dự đoán',
            error: error.message
        });
    }
};

/**
 * Like prediction
 */
const likePrediction = async (req, res) => {
    try {
        const { id } = req.params;

        const prediction = await Prediction.findById(id);

        if (!prediction) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy dự đoán'
            });
        }

        await prediction.incrementLikes();

        res.json({
            success: true,
            data: { likes: prediction.likes }
        });

    } catch (error) {
        console.error('Error liking prediction:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi like dự đoán',
            error: error.message
        });
    }
};

/**
 * Share prediction
 */
const sharePrediction = async (req, res) => {
    try {
        const { id } = req.params;

        const prediction = await Prediction.findById(id);

        if (!prediction) {
            return res.status(404).json({
                success: false,
                message: 'Không tìm thấy dự đoán'
            });
        }

        await prediction.incrementShares();

        res.json({
            success: true,
            data: { shares: prediction.shares }
        });

    } catch (error) {
        console.error('Error sharing prediction:', error);
        res.status(500).json({
            success: false,
            message: 'Lỗi khi share dự đoán',
            error: error.message
        });
    }
};

module.exports = {
    getPredictions,
    getPredictionById,
    getPredictionByDate,
    getTodayPrediction,
    getLatestPredictions,
    createPrediction,
    updatePrediction,
    deletePrediction,
    likePrediction,
    sharePrediction
};

