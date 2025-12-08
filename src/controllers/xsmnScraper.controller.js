const xsmnScraperService = require('../services/xsmnScraper.service');
const XSMN = require('../models/xsmn.models');

class XSMNScraperController {
    /**
     * Cào dữ liệu XSMN cho ngày hiện tại
     */
    async scrapeToday(req, res) {
        try {
            console.log('🚀 Bắt đầu cào XSMN cho ngày hiện tại...');

            const result = await xsmnScraperService.scrapeToday();

            res.status(200).json({
                success: true,
                message: 'Cào dữ liệu XSMN thành công',
                data: {
                    isComplete: result.isComplete,
                    provinces: result.provinces,
                    stats: result.stats
                }
            });
        } catch (error) {
            console.error('❌ Lỗi khi cào XSMN ngày hiện tại:', error.message);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi cào dữ liệu XSMN',
                error: error.message
            });
        }
    }

    /**
     * Cào dữ liệu XSMN cho ngày cụ thể
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

            console.log(`🚀 Bắt đầu cào XSMN cho ngày ${date}...`);

            const result = await xsmnScraperService.scrapeSpecificDate(date);

            res.status(200).json({
                success: true,
                message: `Cào dữ liệu XSMN cho ngày ${date} thành công`,
                data: {
                    date,
                    isComplete: result.isComplete,
                    provinces: result.provinces,
                    stats: result.stats
                }
            });
        } catch (error) {
            console.error(`❌ Lỗi khi cào XSMN ngày ${req.params.date}:`, error.message);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi cào dữ liệu XSMN',
                error: error.message
            });
        }
    }

    /**
     * Lấy danh sách kết quả XSMN
     */
    async getResults(req, res) {
        try {
            const {
                page = 1,
                limit = 10,
                date,
                tentinh,
                sortBy = 'drawDate',
                sortOrder = 'desc'
            } = req.query;

            const query = { station: 'xsmn' };

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

            // Filter by province
            if (tentinh) {
                query.tentinh = tentinh;
            }

            const sortOptions = {};
            sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

            const results = await XSMN.find(query)
                .sort(sortOptions)
                .limit(limit * 1)
                .skip((page - 1) * limit)
                .lean();

            const total = await XSMN.countDocuments(query);

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
            console.error('❌ Lỗi khi lấy danh sách kết quả XSMN:', error.message);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi lấy danh sách kết quả XSMN',
                error: error.message
            });
        }
    }

    /**
     * Lấy kết quả XSMN theo ngày (tất cả tỉnh)
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
                const parts = date.split('-');
                if (parts.length === 3) {
                    const day = parts[0];
                    const month = parts[1];
                    const year = parts[2];
                    if (day.length === 2 && month.length === 2 && year.length === 4) {
                        targetDate = `${year}-${month}-${day}`;
                        console.log(`📅 Converted ${date} to ${targetDate}`);
                    } else {
                        targetDate = date;
                    }
                } else {
                    targetDate = date;
                }
            } else {
                targetDate = date;
            }

            const results = await XSMN.findByDate(targetDate);

            if (!results || results.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: 'Không tìm thấy kết quả XSMN cho ngày này'
                });
            }

            res.status(200).json({
                success: true,
                data: results
            });
        } catch (error) {
            console.error('❌ Lỗi khi lấy kết quả XSMN theo ngày:', error.message);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi lấy kết quả XSMN',
                error: error.message
            });
        }
    }

    /**
     * Lấy kết quả XSMN theo ngày và tỉnh
     */
    async getResultByDateAndProvince(req, res) {
        try {
            let { date, tentinh } = req.params;

            if (!date || !tentinh) {
                return res.status(400).json({
                    success: false,
                    message: 'Vui lòng cung cấp ngày và tên tỉnh'
                });
            }

            // Convert DD-MM-YYYY to Date object if needed
            let targetDate;
            if (date.includes('-')) {
                const parts = date.split('-');
                if (parts.length === 3) {
                    const day = parts[0];
                    const month = parts[1];
                    const year = parts[2];
                    if (day.length === 2 && month.length === 2 && year.length === 4) {
                        targetDate = `${year}-${month}-${day}`;
                    } else {
                        targetDate = date;
                    }
                } else {
                    targetDate = date;
                }
            } else {
                targetDate = date;
            }

            const result = await XSMN.findByDateAndProvince(targetDate, tentinh);

            if (!result) {
                return res.status(404).json({
                    success: false,
                    message: `Không tìm thấy kết quả XSMN cho ngày ${date} và tỉnh ${tentinh}`
                });
            }

            res.status(200).json({
                success: true,
                data: result
            });
        } catch (error) {
            console.error('❌ Lỗi khi lấy kết quả XSMN theo ngày và tỉnh:', error.message);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi lấy kết quả XSMN',
                error: error.message
            });
        }
    }

    /**
     * Lấy kết quả XSMN mới nhất cho một tỉnh
     */
    async getLatestResultByProvince(req, res) {
        try {
            const { tentinh } = req.params;

            if (!tentinh) {
                return res.status(400).json({
                    success: false,
                    message: 'Vui lòng cung cấp tên tỉnh'
                });
            }

            const result = await XSMN.findLatestByProvince(tentinh);

            if (!result) {
                return res.status(404).json({
                    success: false,
                    message: `Không tìm thấy kết quả XSMN nào cho tỉnh ${tentinh}`
                });
            }

            res.status(200).json({
                success: true,
                data: result
            });
        } catch (error) {
            console.error('❌ Lỗi khi lấy kết quả XSMN mới nhất:', error.message);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi lấy kết quả XSMN mới nhất',
                error: error.message
            });
        }
    }

    /**
     * Lấy kết quả XSMN với phân trang theo ngày (lấy 10 ngày gần nhất)
     */
    async getLatest10Results(req, res) {
        try {
            const page = parseInt(req.query.page) || 1;
            const daysPerPage = parseInt(req.query.limit) || 10; // Số ngày mỗi trang
            const { tentinh } = req.query;

            const baseQuery = { station: 'xsmn' };
            if (tentinh) {
                baseQuery.tentinh = tentinh;
            }

            // Lấy các ngày unique, sắp xếp theo drawDate giảm dần
            const uniqueDates = await XSMN.distinct('drawDate', baseQuery);
            
            // Normalize dates to start of day for grouping
            const normalizedDates = uniqueDates.map(date => {
                const d = new Date(date);
                d.setHours(0, 0, 0, 0);
                return d.getTime();
            });
            
            // Get unique normalized dates
            const uniqueNormalizedDates = [...new Set(normalizedDates)]
                .map(timestamp => new Date(timestamp))
                .sort((a, b) => b - a); // Sort descending (newest first)

            // Calculate pagination for days
            const totalDays = uniqueNormalizedDates.length;
            const totalPages = Math.ceil(totalDays / daysPerPage);
            const skip = (page - 1) * daysPerPage;
            const selectedDates = uniqueNormalizedDates.slice(skip, skip + daysPerPage);

            console.log('📊 Total unique days:', totalDays);
            console.log('📄 Page:', page, 'Days per page:', daysPerPage);
            console.log('📅 Selected dates:', selectedDates.length);

            // Lấy tất cả documents của các ngày đã chọn
            const results = [];
            for (const date of selectedDates) {
                const startOfDay = new Date(date);
                startOfDay.setHours(0, 0, 0, 0);
                const endOfDay = new Date(date);
                endOfDay.setHours(23, 59, 59, 999);

                const dayQuery = {
                    ...baseQuery,
                    drawDate: {
                        $gte: startOfDay,
                        $lte: endOfDay
                    }
                };

                const dayResults = await XSMN.find(dayQuery)
                    .sort({ drawDate: -1, tentinh: 1 })
                    .lean();

                results.push(...dayResults);
            }

            console.log('📋 Fetched results:', results.length, 'documents from', selectedDates.length, 'days');

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
                    totalDays: totalDays,
                    daysPerPage: daysPerPage,
                    totalResults: results.length,
                    hasNextPage: page < totalPages,
                    hasPrevPage: page > 1
                }
            });
        } catch (error) {
            console.error('❌ Lỗi khi lấy kết quả XSMN với phân trang:', error.message);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi lấy kết quả XSMN',
                error: error.message
            });
        }
    }

    /**
     * Kiểm tra trạng thái scraper
     */
    async getScraperStatus(req, res) {
        try {
            const status = xsmnScraperService.getStatus();

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
     * Xóa kết quả XSMN theo ngày và tỉnh
     */
    async deleteResultByDateAndProvince(req, res) {
        try {
            const { date, tentinh } = req.params;

            if (!date || !tentinh) {
                return res.status(400).json({
                    success: false,
                    message: 'Vui lòng cung cấp ngày và tên tỉnh'
                });
            }

            const result = await XSMN.findOneAndDelete({
                drawDate: {
                    $gte: new Date(date + 'T00:00:00.000Z'),
                    $lte: new Date(date + 'T23:59:59.999Z')
                },
                station: 'xsmn',
                tentinh: tentinh
            });

            if (!result) {
                return res.status(404).json({
                    success: false,
                    message: 'Không tìm thấy kết quả XSMN để xóa'
                });
            }

            res.status(200).json({
                success: true,
                message: 'Xóa kết quả XSMN thành công',
                data: result
            });
        } catch (error) {
            console.error('❌ Lỗi khi xóa kết quả XSMN:', error.message);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi xóa kết quả XSMN',
                error: error.message
            });
        }
    }

    /**
     * Lấy dữ liệu ban đầu (initial data) cho một tỉnh cụ thể
     * Tương tự endpoint /initial trong xsmnLive.routes.js nhưng dùng MongoDB thay vì Redis
     */
    async getInitialData(req, res) {
        try {
            const { date, tinh } = req.query;

            // Parse date hoặc dùng ngày hiện tại
            let targetDate;
            let dateStr;
            if (date && /^\d{2}-\d{2}-\d{4}$/.test(date)) {
                const [day, month, year] = date.split('-').map(Number);
                targetDate = new Date(year, month - 1, day);
                dateStr = date;
            } else {
                const now = new Date();
                targetDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                dateStr = now.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-');
            }

            if (!tinh) {
                return res.status(400).json({
                    success: false,
                    message: 'Vui lòng cung cấp tên tỉnh (tinh)'
                });
            }

            // Tạo start và end của ngày
            const startOfDay = new Date(targetDate);
            startOfDay.setHours(0, 0, 0, 0);
            const endOfDay = new Date(targetDate);
            endOfDay.setHours(23, 59, 59, 999);

            // Lấy kết quả từ MongoDB
            const result = await XSMN.findOne({
                drawDate: {
                    $gte: startOfDay,
                    $lte: endOfDay
                },
                station: 'xsmn',
                tinh: tinh
            }).lean();

            // Format dữ liệu giống như xsmnLive.routes.js
            const initialData = {
                eightPrizes_0: '...',
                sevenPrizes_0: '...',
                sixPrizes_0: '...',
                sixPrizes_1: '...',
                sixPrizes_2: '...',
                fivePrizes_0: '...',
                fourPrizes_0: '...',
                fourPrizes_1: '...',
                fourPrizes_2: '...',
                fourPrizes_3: '...',
                fourPrizes_4: '...',
                fourPrizes_5: '...',
                fourPrizes_6: '...',
                threePrizes_0: '...',
                threePrizes_1: '...',
                secondPrize_0: '...',
                firstPrize_0: '...',
                specialPrize_0: '...',
                drawDate: dateStr,
                station: 'xsmn',
                tentinh: result?.tentinh || '',
                tinh: tinh,
                year: result?.year || new Date().getFullYear(),
                month: result?.month || (new Date().getMonth() + 1),
                dayOfWeek: targetDate.toLocaleString('vi-VN', { weekday: 'long' }),
                lastUpdated: result?.updatedAt?.getTime() || result?.createdAt?.getTime() || 0,
            };

            // Nếu có dữ liệu từ MongoDB, cập nhật vào initialData
            if (result) {
                if (Array.isArray(result.eightPrizes) && result.eightPrizes.length > 0) {
                    initialData.eightPrizes_0 = result.eightPrizes[0];
                }
                if (Array.isArray(result.sevenPrizes) && result.sevenPrizes.length > 0) {
                    initialData.sevenPrizes_0 = result.sevenPrizes[0];
                }
                if (Array.isArray(result.sixPrizes)) {
                    initialData.sixPrizes_0 = result.sixPrizes[0] || '...';
                    initialData.sixPrizes_1 = result.sixPrizes[1] || '...';
                    initialData.sixPrizes_2 = result.sixPrizes[2] || '...';
                }
                if (Array.isArray(result.fivePrizes) && result.fivePrizes.length > 0) {
                    initialData.fivePrizes_0 = result.fivePrizes[0];
                }
                if (Array.isArray(result.fourPrizes)) {
                    for (let i = 0; i < 7; i++) {
                        initialData[`fourPrizes_${i}`] = result.fourPrizes[i] || '...';
                    }
                }
                if (Array.isArray(result.threePrizes)) {
                    initialData.threePrizes_0 = result.threePrizes[0] || '...';
                    initialData.threePrizes_1 = result.threePrizes[1] || '...';
                }
                if (Array.isArray(result.secondPrize) && result.secondPrize.length > 0) {
                    initialData.secondPrize_0 = result.secondPrize[0];
                }
                if (Array.isArray(result.firstPrize) && result.firstPrize.length > 0) {
                    initialData.firstPrize_0 = result.firstPrize[0];
                }
                if (Array.isArray(result.specialPrize) && result.specialPrize.length > 0) {
                    initialData.specialPrize_0 = result.specialPrize[0];
                }
                initialData.tentinh = result.tentinh;
                initialData.lastUpdated = result.updatedAt?.getTime() || result.createdAt?.getTime() || Date.now();
            }

            res.status(200).json({
                success: true,
                data: initialData
            });
        } catch (error) {
            console.error('❌ Lỗi khi lấy initial data XSMN:', error.message);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi lấy dữ liệu ban đầu XSMN',
                error: error.message
            });
        }
    }

    /**
     * Thống kê dữ liệu XSMN
     */
    async getStatistics(req, res) {
        try {
            const { startDate, endDate, tentinh } = req.query;

            const matchQuery = { station: 'xsmn' };
            if (tentinh) {
                matchQuery.tentinh = tentinh;
            }

            if (startDate && endDate) {
                matchQuery.drawDate = {
                    $gte: new Date(startDate),
                    $lte: new Date(endDate)
                };
            }

            const stats = await XSMN.aggregate([
                { $match: matchQuery },
                {
                    $group: {
                        _id: tentinh ? null : '$tentinh',
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

            res.status(200).json({
                success: true,
                data: {
                    stats: stats.map(stat => ({
                        province: stat._id || 'All',
                        ...stat,
                        completionRate: stat.totalResults > 0
                            ? ((stat.completeResults / stat.totalResults) * 100).toFixed(2) + '%'
                            : '0%'
                    }))
                }
            });
        } catch (error) {
            console.error('❌ Lỗi khi lấy thống kê XSMN:', error.message);
            res.status(500).json({
                success: false,
                message: 'Lỗi khi lấy thống kê XSMN',
                error: error.message
            });
        }
    }
}

module.exports = new XSMNScraperController();

