const XSMN = require('../models/xsmn.models');
const rateLimit = require('express-rate-limit');

// Rate limiter cho các endpoint thông thường
const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 100,
    message: { error: 'Quá nhiều yêu cầu API, vui lòng thử lại sau một phút.' },
});

// Hàm ánh xạ từ không dấu sang có dấu
const mapDayOfWeek = (dayOfWeekNoAccent) => {
    const dayMap = {
        'thu-2': 'Thứ 2',
        'thu-3': 'Thứ 3',
        'thu-4': 'Thứ 4',
        'thu-5': 'Thứ 5',
        'thu-6': 'Thứ 6',
        'thu-7': 'Thứ 7',
        'chu-nhat': 'Chủ nhật'
    };
    return dayMap[dayOfWeekNoAccent.toLowerCase()] || dayOfWeekNoAccent;
};

class XSMNResultController {
    /**
     * Lấy tất cả dữ liệu XSMN với pagination theo ngày
     * GET /api/xsmn-result/xsmn
     * Query: page, daysPerPage
     */
    async getAllResults(req, res) {
        try {
            const page = parseInt(req.query.page) || 1;
            const daysPerPage = parseInt(req.query.daysPerPage) || 3;

            // Lấy tất cả unique dates để tính toán pagination theo ngày
            const uniqueDates = await XSMN.distinct('drawDate', { station: 'xsmn' });
            
            // Normalize dates to start of day for grouping
            const normalizedDates = uniqueDates.map(date => {
                const d = new Date(date);
                d.setHours(0, 0, 0, 0);
                return d.getTime();
            });
            
            // Get unique normalized dates và sắp xếp theo thứ tự mới nhất
            const uniqueNormalizedDates = [...new Set(normalizedDates)]
                .map(timestamp => new Date(timestamp))
                .sort((a, b) => b - a); // Sort descending (newest first)

            // Tính toán skip cho pagination theo ngày
            const skipDays = (page - 1) * daysPerPage;
            const selectedDates = uniqueNormalizedDates.slice(skipDays, skipDays + daysPerPage);

            if (selectedDates.length === 0) {
                return res.status(404).json({ error: 'Result not found' });
            }

            // Lấy tất cả documents của các ngày đã chọn
            // Sử dụng range query để đảm bảo lấy tất cả documents trong mỗi ngày
            const results = [];
            for (const date of selectedDates) {
                const startOfDay = new Date(date);
                startOfDay.setHours(0, 0, 0, 0);
                const endOfDay = new Date(date);
                endOfDay.setHours(23, 59, 59, 999);

                const dayResults = await XSMN.find({
                    station: 'xsmn',
                    drawDate: {
                        $gte: startOfDay,
                        $lte: endOfDay
                    }
                })
                    .lean()
                    .sort({ drawDate: -1, tentinh: 1 });

                results.push(...dayResults);
            }

            res.status(200).json(results);
        } catch (error) {
            console.error('❌ Lỗi fetch XSMN data:', error);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    }

    /**
     * Lấy dữ liệu XSMN theo tỉnh
     * GET /api/xsmn-result/xsmn/tinh/:tinh
     */
    async getResultsByProvince(req, res) {
        try {
            const { tinh } = req.params;

            if (!tinh || tinh.trim() === '') {
                return res.status(400).json({ error: 'Tinh cannot be empty' });
            }

            const results = await XSMN.find({
                tinh: tinh,
                station: 'xsmn'
            })
                .lean()
                .sort({ drawDate: -1 });

            if (!results || results.length === 0) {
                return res.status(404).json({ error: 'Result not found' });
            }

            res.status(200).json(results);
        } catch (error) {
            console.error('❌ Lỗi lấy KQXS theo tỉnh:', error.message);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    }

    /**
     * Lấy dữ liệu XSMN theo thứ trong tuần
     * GET /api/xsmn-result/xsmn/:dayOfWeek
     */
    async getResultsByDayOfWeek(req, res) {
        try {
            const { dayOfWeek } = req.params;

            if (!dayOfWeek || dayOfWeek.trim() === '') {
                return res.status(400).json({ error: 'dayOfWeek cannot be empty' });
            }

            const mappedDayOfWeek = mapDayOfWeek(dayOfWeek);
            const results = await XSMN.find({
                dayOfWeek: mappedDayOfWeek,
                station: 'xsmn'
            })
                .lean()
                .sort({ drawDate: -1 });

            if (!results || results.length === 0) {
                return res.status(404).json({ error: 'No results found for this day' });
            }

            res.status(200).json(results);
        } catch (error) {
            console.error('❌ Lỗi lấy KQXS theo dayOfWeek:', error.message);
            res.status(500).json({ error: 'Internal Server Error' });
        }
    }
}

module.exports = new XSMNResultController();
module.exports.apiLimiter = apiLimiter;

