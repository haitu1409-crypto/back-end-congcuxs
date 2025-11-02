/**
 * Position Soi Cau Controller
 * Controller cho thuật toán soi cầu dựa trên vị trí số
 */

const positionAnalyzer = require('../services/positionAnalyzer.service');

// Format date to DD/MM/YYYY
const formatDate = (date) => {
    const d = new Date(date);
    const day = d.getDate().toString().padStart(2, '0');
    const month = (d.getMonth() + 1).toString().padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
};

// Parse date from DD/MM/YYYY or DD-MM-YYYY or D/M/YYYY
const parseDate = (dateStr) => {
    let normalizedStr = dateStr;
    if (dateStr.includes('-')) {
        normalizedStr = dateStr.replace(/-/g, '/');
    }
    // Chấp nhận cả DD/MM/YYYY và D/M/YYYY
    if (!normalizedStr || !/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(normalizedStr)) {
        throw new Error('Định dạng ngày không hợp lệ. Vui lòng sử dụng DD/MM/YYYY hoặc D/M/YYYY.');
    }
    const [day, month, year] = normalizedStr.split('/').map(Number);
    if (day < 1 || day > 31 || month < 1 || month > 12 || year < 2000 || year > new Date().getFullYear()) {
        throw new Error('Ngày, tháng hoặc năm không hợp lệ.');
    }
    return new Date(year, month - 1, day);
};

/**
 * Soi cầu dựa trên vị trí số
 */
const getPositionSoiCau = async (req, res) => {
    try {
        const { date, days } = req.query;

        // Validate parameters
        if (!date) {
            return res.status(400).json({
                error: 'Vui lòng cung cấp tham số date (DD/MM/YYYY)'
            });
        }

        const numDays = parseInt(days) || 2;
        if (numDays < 2 || numDays > 30) {
            return res.status(400).json({
                error: 'Số ngày phân tích phải từ 2 đến 30 ngày'
            });
        }

        // Parse và validate ngày
        const parsedDate = parseDate(date);
        const formattedDate = formatDate(parsedDate);

        console.log(`🎯 Bắt đầu soi cầu vị trí cho ngày ${formattedDate}, ${numDays} ngày`);

        // Gọi thuật toán phân tích vị trí
        const result = await positionAnalyzer.analyzePositionSoiCau(formattedDate, numDays);

        console.log(`✅ Hoàn thành soi cầu vị trí: ${result.predictions.length} dự đoán`);

        res.status(200).json(result);

    } catch (error) {
        console.error('❌ Lỗi trong getPositionSoiCau:', error.message);

        if (error.message.includes('không hợp lệ') || error.message.includes('Không đủ dữ liệu')) {
            res.status(400).json({
                error: error.message,
                suggestedDate: formatDate(new Date())
            });
        } else {
            res.status(500).json({
                error: `Lỗi server: ${error.message}`
            });
        }
    }
};

/**
 * Soi cầu vị trí với nhiều ngày
 */
const getPositionSoiCauRange = async (req, res) => {
    try {
        const { startDate, endDate, days } = req.query;

        if (!startDate || !endDate || !days) {
            return res.status(400).json({
                error: 'Vui lòng cung cấp startDate, endDate và days'
            });
        }

        const numDays = parseInt(days);
        if (numDays < 2 || numDays > 30) {
            return res.status(400).json({
                error: 'Số ngày phân tích phải từ 2 đến 30 ngày'
            });
        }

        const parsedStartDate = parseDate(startDate);
        const parsedEndDate = parseDate(endDate);

        if (parsedStartDate > parsedEndDate) {
            return res.status(400).json({
                error: 'startDate phải nhỏ hơn hoặc bằng endDate'
            });
        }

        const maxDays = 7;
        const diffDays = Math.ceil((parsedEndDate - parsedStartDate) / (1000 * 60 * 60 * 24));
        if (diffDays > maxDays) {
            return res.status(400).json({
                error: `Khoảng thời gian không được vượt quá ${maxDays} ngày`
            });
        }

        // Không sử dụng cache, lấy dữ liệu trực tiếp từ database

        const results = [];
        let currentDate = new Date(parsedStartDate);

        while (currentDate <= parsedEndDate) {
            const formattedDate = formatDate(currentDate);
            try {
                const result = await positionAnalyzer.analyzePositionSoiCau(formattedDate, numDays);
                results.push({
                    date: formattedDate,
                    ...result
                });
            } catch (err) {
                console.warn(`⚠️ Không thể phân tích ngày ${formattedDate}:`, err.message);
            }
            currentDate.setDate(currentDate.getDate() + 1);
        }

        if (results.length === 0) {
            return res.status(404).json({
                error: `Không tìm thấy dữ liệu soi cầu từ ${startDate} đến ${endDate}`
            });
        }

        const response = {
            range: {
                startDate,
                endDate,
                analysisDays: numDays,
                totalDays: results.length
            },
            results
        };

        // Không sử dụng cache
        res.status(200).json(response);

    } catch (error) {
        console.error('❌ Lỗi trong getPositionSoiCauRange:', error.message);

        if (error.message.includes('không hợp lệ')) {
            res.status(400).json({ error: error.message });
        } else {
            res.status(500).json({ error: `Lỗi server: ${error.message}` });
        }
    }
};

/**
 * Lấy thống kê pattern vị trí
 */
const getPositionPatternStats = async (req, res) => {
    try {
        const { days = 7 } = req.query;
        const numDays = parseInt(days);

        if (numDays < 2 || numDays > 30) {
            return res.status(400).json({
                error: 'Số ngày phải từ 2 đến 30'
            });
        }

        // Không sử dụng cache, lấy dữ liệu trực tiếp từ database

        const currentDate = new Date();
        const endOfDay = new Date(currentDate);
        endOfDay.setHours(23, 59, 59, 999);
        const startOfPeriod = new Date(endOfDay);
        startOfPeriod.setDate(startOfPeriod.getDate() - numDays);
        startOfPeriod.setHours(0, 0, 0, 0);

        // Lấy dữ liệu các ngày
        const XSMB = require('../models/xsmb.model');
        const results = await XSMB.find({
            drawDate: { $gte: startOfPeriod, $lte: endOfDay },
            station: 'xsmb'
        })
            .select('drawDate specialPrize firstPrize secondPrize threePrizes fourPrizes fivePrizes sixPrizes sevenPrizes')
            .sort({ drawDate: -1 })
            .lean();

        if (results.length < 2) {
            return res.status(404).json({
                error: `Không đủ dữ liệu cho ${numDays} ngày`
            });
        }

        // Phân tích pattern
        const patterns = positionAnalyzer.findPositionPatterns(results, numDays);
        const consistentPatterns = positionAnalyzer.validateConsistentPatterns(patterns);

        // Thống kê
        const stats = {
            analysisDays: numDays,
            totalResults: results.length,
            totalPatterns: patterns.length,
            consistentPatterns: consistentPatterns.length,
            averageSuccessRate: consistentPatterns.length > 0
                ? Math.round(consistentPatterns.reduce((sum, p) => sum + p.successRate, 0) / consistentPatterns.length * 100)
                : 0,
            topPatterns: consistentPatterns.slice(0, 10).map(p => ({
                positionKey: p.positionKey,
                successRate: Math.round(p.successRate * 100),
                totalOccurrences: p.totalOccurrences,
                totalDays: p.totalDays
            })),
            dataFrom: formatDate(results[results.length - 1]?.drawDate),
            dataTo: formatDate(results[0]?.drawDate)
        };

        // Không sử dụng cache
        res.status(200).json(stats);

    } catch (error) {
        console.error('❌ Lỗi trong getPositionPatternStats:', error.message);
        res.status(500).json({ error: `Lỗi server: ${error.message}` });
    }
};

module.exports = {
    getPositionSoiCau,
    getPositionSoiCauRange,
    getPositionPatternStats
};
