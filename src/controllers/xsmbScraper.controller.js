const xsmbScraperService = require('../services/xsmbScraper.service');
const XSMB = require('../models/xsmb.model');

class XSMBScraperController {
    /**
     * Cào dữ liệu XSMB cho ngày hiện tại
     */
    async scrapeToday(req, res) {
        try {
            console.log('🚀 Bắt đầu cào XSMB cho ngày hiện tại...');

            const result = await xsmbScraperService.scrapeToday();

            res.status(200).json({
                success: true,
                message: 'Cào dữ liệu XSMB thành công',
                data: {
                    isComplete: result.isComplete,
                    result: result.result,
                    stats: result.stats
                }
            });
        } catch (error) {
            console.error('❌ Lỗi khi cào XSMB ngày hiện tại:', error.message);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi cào dữ liệu XSMB',
                error: error.message
            });
        }
    }

    /**
     * Cào dữ liệu XSMB cho ngày cụ thể
     */
    async scrapeSpecificDate(req, res) {
        try {
            const { date } = req.params;

            if (!date) {
                return res.status(400).json({
                    success: false,
                    message: 'Vui lòng cung cấp ngày (format: DD/MM/YYYY)'
                });
            }

            // Validate date format
            const dateRegex = /^\d{2}\/\d{2}\/\d{4}$/;
            if (!dateRegex.test(date)) {
                return res.status(400).json({
                    success: false,
                    message: 'Định dạng ngày không hợp lệ. Vui lòng sử dụng DD/MM/YYYY'
                });
            }

            console.log(`🚀 Bắt đầu cào XSMB cho ngày ${date}...`);

            const result = await xsmbScraperService.scrapeSpecificDate(date);

            res.status(200).json({
                success: true,
                message: `Cào dữ liệu XSMB cho ngày ${date} thành công`,
                data: {
                    date,
                    isComplete: result.isComplete,
                    result: result.result,
                    stats: result.stats
                }
            });
        } catch (error) {
            console.error(`❌ Lỗi khi cào XSMB ngày ${req.params.date}:`, error.message);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi cào dữ liệu XSMB',
                error: error.message
            });
        }
    }

    /**
     * Lấy danh sách kết quả XSMB
     */
    async getResults(req, res) {
        try {
            const {
                page = 1,
                limit = 10,
                date,
                sortBy = 'drawDate',
                sortOrder = 'desc'
            } = req.query;

            const query = { station: 'xsmb' };

            // Filter by date
            if (date) {
                const startOfDay = new Date(date);
                startOfDay.setHours(0, 0, 0, 0);
                const endOfDay = new Date(date);
                endOfDay.setHours(23, 59, 59, 999);

                query.drawDate = {
                    $gte: startOfDay,
                    $lte: endOfDay
                };
            }

            const sortOptions = {};
            sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

            const results = await XSMB.find(query)
                .sort(sortOptions)
                .limit(limit * 1)
                .skip((page - 1) * limit)
                .lean();

            const total = await XSMB.countDocuments(query);

            res.status(200).json({
                success: true,
                data: {
                    results,
                    pagination: {
                        currentPage: parseInt(page),
                        totalPages: Math.ceil(total / limit),
                        totalResults: total,
                        limit: parseInt(limit)
                    }
                }
            });
        } catch (error) {
            console.error('❌ Lỗi khi lấy danh sách kết quả XSMB:', error.message);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi lấy danh sách kết quả XSMB',
                error: error.message
            });
        }
    }

    /**
     * Lấy kết quả XSMB theo ngày
     */
    async getResultByDate(req, res) {
        try {
            let { date } = req.params;

            if (!date) {
                return res.status(400).json({
                    success: false,
                    message: 'Vui lòng cung cấp ngày (format: YYYY-MM-DD hoặc DD-MM-YYYY)'
                });
            }

            // Convert DD-MM-YYYY to Date object if needed
            let targetDate;
            if (date.includes('-')) {
                // Handle DD-MM-YYYY format
                const parts = date.split('-');
                if (parts.length === 3) {
                    // Check if it's DD-MM-YYYY
                    const day = parts[0];
                    const month = parts[1];
                    const year = parts[2];
                    if (day.length === 2 && month.length === 2 && year.length === 4) {
                        // It's DD-MM-YYYY, convert to YYYY-MM-DD
                        targetDate = `${year}-${month}-${day}`;
                        console.log(`📅 Converted ${date} to ${targetDate}`);
                    } else {
                        // Assume YYYY-MM-DD
                        targetDate = date;
                    }
                } else {
                    targetDate = date;
                }
            } else {
                targetDate = date;
            }

            const result = await XSMB.findByDate(targetDate);

            if (!result) {
                return res.status(404).json({
                    success: false,
                    message: 'Không tìm thấy kết quả XSMB cho ngày này'
                });
            }

            res.status(200).json({
                success: true,
                data: result
            });
        } catch (error) {
            console.error('❌ Lỗi khi lấy kết quả XSMB theo ngày:', error.message);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi lấy kết quả XSMB',
                error: error.message
            });
        }
    }

    /**
     * Lấy kết quả XSMB mới nhất
     */
    async getLatestResult(req, res) {
        try {
            const result = await XSMB.findLatest();

            if (!result) {
                return res.status(404).json({
                    success: false,
                    message: 'Không tìm thấy kết quả XSMB nào'
                });
            }

            res.status(200).json({
                success: true,
                data: result
            });
        } catch (error) {
            console.error('❌ Lỗi khi lấy kết quả XSMB mới nhất:', error.message);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi lấy kết quả XSMB mới nhất',
                error: error.message
            });
        }
    }

    /**
     * Lấy kết quả XSMB với phân trang
     */
    // ✅ Performance: Add caching headers for getLatest10Results
    async getLatest10Results(req, res) {
        try {
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 10;

            // Query to get total count (without isComplete filter since some records don't have this field)
            const totalCount = await XSMB.countDocuments({
                station: 'xsmb'
            });

            console.log('📊 Total documents:', totalCount);
            console.log('📄 Page:', page, 'Limit:', limit);

            // Get sample dates
            const sampleDocs = await XSMB.find({ station: 'xsmb' })
                .sort({ drawDate: -1 })
                .limit(10)
                .select('drawDate isComplete')
                .lean();

            console.log('📅 Sample dates:', sampleDocs.map(d => ({
                date: d.drawDate,
                complete: d.isComplete || 'undefined'
            })));

            // Calculate pagination
            const totalPages = Math.ceil(totalCount / limit);
            const skip = (page - 1) * limit;

            const results = await XSMB.find({
                station: 'xsmb'
            })
                .sort({ drawDate: -1 })
                .skip(skip)
                .limit(limit)
                .lean();

            console.log('📋 Fetched results:', results.length);

            // ✅ Performance: Add caching headers to reduce server load
            // Cache for 2 minutes (120 seconds) - balance between freshness and performance
            res.set({
                'Cache-Control': 'public, max-age=120, s-maxage=120, stale-while-revalidate=300',
                'ETag': `"${Date.now()}-${results.length}"`,
                'X-Content-Type-Options': 'nosniff'
            });

            res.status(200).json({
                success: true,
                data: results,
                pagination: {
                    currentPage: page,
                    totalPages: totalPages,
                    totalResults: totalCount,
                    perPage: limit,
                    hasNextPage: page < totalPages,
                    hasPrevPage: page > 1
                }
            });
        } catch (error) {
            console.error('❌ Lỗi khi lấy kết quả XSMB với phân trang:', error.message);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi lấy kết quả XSMB',
                error: error.message
            });
        }
    }

    /**
     * Kiểm tra trạng thái scraper
     */
    async getScraperStatus(req, res) {
        try {
            const status = xsmbScraperService.getStatus();

            res.status(200).json({
                success: true,
                data: status
            });
        } catch (error) {
            console.error('❌ Lỗi khi lấy trạng thái scraper:', error.message);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi lấy trạng thái scraper',
                error: error.message
            });
        }
    }

    /**
     * Xóa kết quả XSMB theo ngày
     */
    async deleteResultByDate(req, res) {
        try {
            const { date } = req.params;

            if (!date) {
                return res.status(400).json({
                    success: false,
                    message: 'Vui lòng cung cấp ngày (format: YYYY-MM-DD)'
                });
            }

            const result = await XSMB.findOneAndDelete({
                drawDate: {
                    $gte: new Date(date + 'T00:00:00.000Z'),
                    $lte: new Date(date + 'T23:59:59.999Z')
                },
                station: 'xsmb'
            });

            if (!result) {
                return res.status(404).json({
                    success: false,
                    message: 'Không tìm thấy kết quả XSMB để xóa'
                });
            }

            res.status(200).json({
                success: true,
                message: 'Xóa kết quả XSMB thành công',
                data: result
            });
        } catch (error) {
            console.error('❌ Lỗi khi xóa kết quả XSMB:', error.message);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi xóa kết quả XSMB',
                error: error.message
            });
        }
    }

    /**
     * Thống kê dữ liệu XSMB
     */
    async getStatistics(req, res) {
        try {
            const { startDate, endDate } = req.query;

            const matchQuery = { station: 'xsmb' };

            if (startDate && endDate) {
                matchQuery.drawDate = {
                    $gte: new Date(startDate),
                    $lte: new Date(endDate)
                };
            }

            const stats = await XSMB.aggregate([
                { $match: matchQuery },
                {
                    $group: {
                        _id: null,
                        totalResults: { $sum: 1 },
                        completeResults: {
                            $sum: { $cond: ['$isComplete', 1, 0] }
                        },
                        incompleteResults: {
                            $sum: { $cond: ['$isComplete', 0, 1] }
                        },
                        latestDate: { $max: '$drawDate' },
                        earliestDate: { $min: '$drawDate' }
                    }
                }
            ]);

            const result = stats[0] || {
                totalResults: 0,
                completeResults: 0,
                incompleteResults: 0,
                latestDate: null,
                earliestDate: null
            };

            res.status(200).json({
                success: true,
                data: {
                    ...result,
                    completionRate: result.totalResults > 0
                        ? ((result.completeResults / result.totalResults) * 100).toFixed(2) + '%'
                        : '0%'
                }
            });
        } catch (error) {
            console.error('❌ Lỗi khi lấy thống kê XSMB:', error.message);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi lấy thống kê XSMB',
                error: error.message
            });
        }
    }
}

module.exports = new XSMBScraperController();
