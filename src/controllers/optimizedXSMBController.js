/**
 * Optimized XSMB Controller
 * Tối ưu hóa hiệu suất cho API kết quả xổ số
 */

const XSMBModel = require('../models/xsmb.model');
const { optimizeQuery, cacheMiddleware } = require('../middleware/performance');

class OptimizedXSMBController {
    /**
     * Lấy kết quả mới nhất với caching
     */
    async getLatestResults(req, res) {
        try {
            const { limit = 10, page = 1 } = req.query;
            const skip = (page - 1) * limit;

            const query = optimizeQuery({
                limit: parseInt(limit),
                skip: parseInt(skip),
                sort: { drawDate: -1 }
            });

            const [results, totalCount] = await Promise.all([
                XSMBModel.find({}, null, query),
                XSMBModel.countDocuments()
            ]);

            const pagination = {
                currentPage: parseInt(page),
                totalPages: Math.ceil(totalCount / limit),
                totalResults: totalCount,
                hasNext: page < Math.ceil(totalCount / limit),
                hasPrev: page > 1
            };

            res.json({
                success: true,
                data: results,
                pagination,
                meta: {
                    timestamp: new Date().toISOString(),
                    version: '1.0'
                }
            });
        } catch (error) {
            console.error('Error fetching latest results:', error);
            res.status(500).json({
                success: false,
                error: 'Lỗi server khi lấy kết quả mới nhất'
            });
        }
    }

    /**
     * Lấy kết quả theo ngày với caching dài hạn
     */
    async getResultsByDate(req, res) {
        try {
            const { date } = req.params;
            const { format = 'YYYY-MM-DD' } = req.query;

            // Parse date based on format
            let queryDate;
            if (format === 'DD-MM-YYYY') {
                const [day, month, year] = date.split('-');
                queryDate = new Date(year, month - 1, day);
            } else {
                queryDate = new Date(date);
            }

            const startOfDay = new Date(queryDate);
            startOfDay.setHours(0, 0, 0, 0);

            const endOfDay = new Date(queryDate);
            endOfDay.setHours(23, 59, 59, 999);

            const result = await XSMBModel.findOne({
                drawDate: {
                    $gte: startOfDay,
                    $lte: endOfDay
                }
            }).lean();

            if (!result) {
                return res.status(404).json({
                    success: false,
                    error: 'Không tìm thấy kết quả cho ngày này'
                });
            }

            res.json({
                success: true,
                data: result,
                meta: {
                    date: date,
                    timestamp: new Date().toISOString()
                }
            });
        } catch (error) {
            console.error('Error fetching results by date:', error);
            res.status(500).json({
                success: false,
                error: 'Lỗi server khi lấy kết quả theo ngày'
            });
        }
    }

    /**
     * Lấy kết quả trong khoảng thời gian
     */
    async getResultsByDateRange(req, res) {
        try {
            const { startDate, endDate, limit = 50 } = req.query;

            const start = new Date(startDate);
            const end = new Date(endDate);
            end.setHours(23, 59, 59, 999);

            const query = optimizeQuery({
                limit: parseInt(limit),
                filter: {
                    drawDate: {
                        $gte: start,
                        $lte: end
                    }
                },
                sort: { drawDate: -1 }
            });

            const results = await XSMBModel.find(query.filter, null, query).lean();

            res.json({
                success: true,
                data: results,
                meta: {
                    startDate,
                    endDate,
                    count: results.length,
                    timestamp: new Date().toISOString()
                }
            });
        } catch (error) {
            console.error('Error fetching results by date range:', error);
            res.status(500).json({
                success: false,
                error: 'Lỗi server khi lấy kết quả theo khoảng thời gian'
            });
        }
    }

    /**
     * Tìm kiếm kết quả với full-text search
     */
    async searchResults(req, res) {
        try {
            const { q, limit = 20, page = 1 } = req.query;

            if (!q || q.trim().length < 2) {
                return res.status(400).json({
                    success: false,
                    error: 'Từ khóa tìm kiếm phải có ít nhất 2 ký tự'
                });
            }

            const skip = (page - 1) * limit;

            // Create search index if not exists
            await XSMBModel.collection.createIndex({
                "specialPrize": "text",
                "firstPrize": "text",
                "secondPrize": "text",
                "threePrizes": "text"
            });

            const query = {
                $text: { $search: q },
                ...optimizeQuery({
                    limit: parseInt(limit),
                    skip: parseInt(skip)
                })
            };

            const [results, totalCount] = await Promise.all([
                XSMBModel.find(query).lean(),
                XSMBModel.countDocuments(query)
            ]);

            res.json({
                success: true,
                data: results,
                pagination: {
                    currentPage: parseInt(page),
                    totalPages: Math.ceil(totalCount / limit),
                    totalResults: totalCount
                },
                meta: {
                    query: q,
                    timestamp: new Date().toISOString()
                }
            });
        } catch (error) {
            console.error('Error searching results:', error);
            res.status(500).json({
                success: false,
                error: 'Lỗi server khi tìm kiếm kết quả'
            });
        }
    }

    /**
     * Lấy thống kê nhanh
     */
    async getQuickStats(req, res) {
        try {
            const stats = await XSMBModel.aggregate([
                {
                    $group: {
                        _id: null,
                        totalResults: { $sum: 1 },
                        latestDate: { $max: "$drawDate" },
                        oldestDate: { $min: "$drawDate" }
                    }
                }
            ]);

            const result = stats[0] || {
                totalResults: 0,
                latestDate: null,
                oldestDate: null
            };

            res.json({
                success: true,
                data: result,
                meta: {
                    timestamp: new Date().toISOString()
                }
            });
        } catch (error) {
            console.error('Error fetching quick stats:', error);
            res.status(500).json({
                success: false,
                error: 'Lỗi server khi lấy thống kê'
            });
        }
    }
}

module.exports = new OptimizedXSMBController();
