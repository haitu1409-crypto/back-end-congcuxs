const mongoose = require('mongoose');
const XSMB = require('../models/xsmb.model');
const LoGanStats = require('../models/stats/loganStats.model');
const GiaiDacBietStats = require('../models/stats/giaiDacBietStats.model');
const GiaiDacBietTuanStats = require('../models/stats/giaiDacBietTuanStats.model');
const DauDuoiStats = require('../models/stats/dauDuoiStats.model');
const TanSuatLotoStats = require('../models/stats/tanSuatLotoStats.model');
const TanSuatLoCapStats = require('../models/stats/tanSuatLoCapStats.model');
const memoryCache = require('../utils/memoryCache');

// Hàm trích xuất 2 số cuối
const getLastTwoDigits = (number) => {
    if (!number || typeof number !== 'string' || !/^\d+$/.test(number)) return null;
    const str = number.toString();
    return str.length >= 2 ? parseInt(str.slice(-2)) : parseInt(str);
};

// Hàm định dạng ngày
const formatDate = (date) => {
    const d = new Date(date);
    const day = d.getDate().toString().padStart(2, '0');
    const month = (d.getMonth() + 1).toString().padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
};

// Hàm tính số ngày giữa 2 ngày
const getDaysBetween = (start, end) => {
    const oneDay = 24 * 60 * 60 * 1000;
    return Math.round(Math.abs((end - start) / oneDay));
};

// Hàm xác định khoảng lọc dựa trên days
const getFilterRange = (days, type = 'specialPrize') => {
    const specialPrizeRanges = {
        10: { maxDays: 10, description: '10 ngày' },
        20: { maxDays: 20, description: '20 ngày' },
        30: { maxDays: 30, description: '30 ngày' },
        60: { maxDays: 60, description: '2 tháng' },
        90: { maxDays: 90, description: '3 tháng' },
        100: { maxDays: 100, description: '100 ngày' },
        120: { maxDays: 120, description: '4 tháng' },
        150: { maxDays: 150, description: '5 tháng' },
        180: { maxDays: 180, description: '6 tháng' },
        270: { maxDays: 270, description: '9 tháng' },
        365: { maxDays: 365, description: '1 năm' },
    };

    const loGanRanges = {
        6: { minDays: 3, maxDays: 6, description: 'Dưới 7 ngày' },
        7: { minDays: 7, maxDays: 14, description: 'Từ 7 đến 14 ngày' },
        14: { minDays: 14, maxDays: 29, description: 'Từ 14 đến 28 ngày' },
        30: { minDays: 3, maxDays: 30, description: 'Trong 30 ngày' },
        60: { minDays: 3, maxDays: 60, description: 'Trong 60 ngày' },
    };

    if (type === 'loGan') {
        return loGanRanges[days] || { minDays: 3, maxDays: days, description: `${days} ngày` };
    } else {
        return specialPrizeRanges[days] || { maxDays: days, description: `${days} ngày` };
    }
};

// Hàm tính toán giải đặc biệt theo tuần
const calculateSpecialPrizeStatsByWeek = async (month, year) => {
    try {
        const monthNum = Number(month);
        const yearNum = Number(year);

        if (!month || !year || isNaN(monthNum) || isNaN(yearNum)) {
            throw new Error('Tham số month và year là bắt buộc và phải là số.');
        }
        if (monthNum < 1 || monthNum > 12) {
            throw new Error('Tham số month không hợp lệ. Giá trị hợp lệ: 1-12.');
        }
        if (yearNum < 2000 || yearNum > new Date().getFullYear()) {
            throw new Error(`Tham số year không hợp lệ. Giá trị hợp lệ: 2000 - ${new Date().getFullYear()}.`);
        }

        const startDate = new Date(yearNum, monthNum - 1, 1);
        const endDate = new Date(yearNum, monthNum, 0, 23, 59, 59, 999);

        console.log(`Tham số: month=${monthNum}, year=${yearNum}`);
        console.log(`Phạm vi ngày: ${formatDate(startDate)} đến ${formatDate(endDate)}`);

        let query = {
            drawDate: { $gte: startDate, $lte: endDate },
        };

        console.log(`Query MongoDB:`, JSON.stringify(query));

        const results = await XSMB.find(query)
            .select('drawDate specialPrize dayOfWeek')
            .sort({ drawDate: -1 })
            .lean();

        console.log(`Số lượng bản ghi tìm thấy: ${results.length}`);
        if (results.length === 0) {
            console.warn(`Không tìm thấy dữ liệu cho XSMB trong tháng ${monthNum}/${yearNum}.`);
            return {
                statistics: [],
                metadata: {
                    startDate: formatDate(startDate),
                    endDate: formatDate(endDate),
                    totalDraws: 0,
                    month: monthNum,
                    year: yearNum,
                    totalNumbers: 0,
                    message: `Không tìm thấy dữ liệu trong cơ sở dữ liệu cho XSMB trong tháng ${monthNum}/${yearNum}.`
                }
            };
        }

        console.log('Ngày xổ số gần nhất:', formatDate(results[0].drawDate));

        const specialPrizes = [];
        for (const result of results) {
            const drawDate = new Date(result.drawDate);
            const specialPrize = result.specialPrize || [];

            if (specialPrize.length === 0) {
                console.log(`Không có giải đặc biệt cho ngày ${formatDate(drawDate)}`);
                continue;
            }

            const day = drawDate.getDate();
            const week = Math.ceil(day / 7);

            specialPrize.forEach(prize => {
                if (prize && typeof prize === 'string' && /^\d+$/.test(prize)) {
                    const entry = {
                        number: prize,
                        drawDate: formatDate(drawDate),
                        week: week,
                        dayOfWeek: result.dayOfWeek || 'Không xác định',
                    };
                    specialPrizes.push(entry);
                }
            });
        }

        console.log('Danh sách giải đặc biệt theo tuần:', specialPrizes);

        const response = {
            statistics: specialPrizes,
            metadata: {
                startDate: formatDate(startDate),
                endDate: formatDate(endDate),
                totalDraws: results.length,
                month: monthNum,
                year: yearNum,
                totalNumbers: specialPrizes.length,
                message: specialPrizes.length === 0 ? `Không tìm thấy giải đặc biệt nào trong tháng ${monthNum}/${yearNum}.` : undefined,
            },
        };

        console.log('Response cuối cùng:', JSON.stringify(response, null, 2));
        return response;
    } catch (error) {
        console.error(`Lỗi trong calculateSpecialPrizeStatsByWeek:`, error.message);
        throw error;
    }
};

// Controller cho giải đặc biệt theo tuần
const getSpecialPrizeStatsByWeek = async (req, res) => {
    const { month, year } = req.query;
    try {
        if (!month || !year || isNaN(month) || isNaN(year)) {
            throw new Error('Tham số month và year là bắt buộc và phải là số.');
        }

        // Lấy từ database model trước
        const dbStats = await GiaiDacBietTuanStats.findOne({ 
            month: Number(month), 
            year: Number(year) 
        });
        
        if (dbStats) {
            console.log(`✅ Trả về dữ liệu từ database model: month=${month}, year=${year}`);
            const result = {
                statistics: dbStats.statistics,
                metadata: dbStats.metadata
            };
            return res.status(200).json(result);
        }

        // Nếu không có trong database, tính toán mới và lưu vào database
        console.log(`⚠️ Không có dữ liệu trong database, đang tính toán...`);
        const result = await calculateSpecialPrizeStatsByWeek(month, year);
        
        // Tự động lưu vào database để lần sau không phải tính lại
        await GiaiDacBietTuanStats.findOneAndUpdate(
            { month: Number(month), year: Number(year) },
            {
                month: Number(month),
                year: Number(year),
                statistics: result.statistics,
                metadata: result.metadata,
                lastUpdated: new Date()
            },
            { upsert: true, new: true }
        );
        console.log(`✅ Đã tự động lưu thống kê Giải Đặc Biệt Tuần vào database: month=${month}, year=${year}`);
        
        res.status(200).json(result);
    } catch (error) {
        console.error('Lỗi trong getSpecialPrizeStatsByWeek:', error.message);
        if (error.message.includes('Không tìm thấy dữ liệu')) {
            res.status(404).json({ error: error.message });
        } else if (error.message.includes('Invalid') || error.message.includes('required')) {
            res.status(400).json({ error: error.message });
        } else {
            res.status(500).json({ error: `Lỗi máy chủ nội bộ: ${error.message}` });
        }
    }
};

// Hàm tính toán lô gan
const calculateLoGan = async (days) => {
    try {
        const validDaysOptions = [6, 7, 14, 30, 60];
        const daysNum = Number(days);
        if (!validDaysOptions.includes(daysNum)) {
            throw new Error('Tham số days không hợp lệ. Các giá trị hợp lệ: 6, 7, 14, 30, 60.');
        }

        const { minDays, maxDays, description } = getFilterRange(daysNum, 'loGan');

        const endDate = new Date();
        const startDate = new Date(endDate);
        startDate.setDate(endDate.getDate() - maxDays);

        console.log(`Tham số: days=${daysNum}, filterRange=${description}`);
        console.log(`Phạm vi ngày: ${formatDate(startDate)} đến ${formatDate(endDate)}`);

        let query = {};

        const allResults = await XSMB.find(query)
            .select('drawDate specialPrize firstPrize secondPrize threePrizes fourPrizes fivePrizes sixPrizes sevenPrizes eightPrizes')
            .sort({ drawDate: -1 })
            .limit(1000)
            .lean();
        if (allResults.length === 0) {
            throw new Error(`Không tìm thấy dữ liệu trong cơ sở dữ liệu cho XSMB.`);
        }
        console.log('Ngày xổ số gần nhất:', formatDate(allResults[0].drawDate));

        const stats = Array(100).fill().map((_, index) => ({
            number: index,
            lastAppeared: null,
            maxGap: 0,
            gaps: [],
            hasAppeared: false,
        }));

        let lastDrawDate = null;
        for (const result of allResults) {
            const drawDate = new Date(result.drawDate);
            const allPrizes = [
                ...(result.specialPrize || []),
                ...(result.firstPrize || []),
                ...(result.secondPrize || []),
                ...(result.threePrizes || []),
                ...(result.fourPrizes || []),
                ...(result.fivePrizes || []),
                ...(result.sixPrizes || []),
                ...(result.sevenPrizes || []),
                ...(result.eightPrizes || []),
            ];

            if (allPrizes.length === 0) {
                console.log(`Không có dữ liệu giải thưởng cho ngày ${formatDate(drawDate)}`);
            } else {
                console.log(`Dữ liệu giải thưởng ngày ${formatDate(drawDate)}:`, allPrizes);
            }

            const numbers = [...new Set(
                allPrizes
                    .map(prize => getLastTwoDigits(prize))
                    .filter(num => num !== null && num >= 0 && num <= 99)
            )];
            console.log(`Số tìm thấy ngày ${formatDate(drawDate)}:`, numbers);

            numbers.forEach(num => {
                stats[num].hasAppeared = true;
                if (stats[num].lastAppeared && lastDrawDate) {
                    const gap = getDaysBetween(drawDate, stats[num].lastAppeared);
                    stats[num].gaps.push(gap);
                }
                if (!stats[num].lastAppeared || drawDate > stats[num].lastAppeared) {
                    stats[num].lastAppeared = drawDate;
                }
            });
            lastDrawDate = drawDate;
        }

        stats.forEach(stat => {
            if (stat.hasAppeared) {
                const daysSinceLastAppeared = getDaysBetween(stat.lastAppeared, endDate);
                stat.gapDraws = daysSinceLastAppeared;
                stat.maxGap = stat.gaps.length > 0 ? Math.max(...stat.gaps) : daysSinceLastAppeared;
            }
        });

        const appearedStats = stats.filter(stat => stat.hasAppeared);
        console.log('Tổng số đã xuất hiện (trước lọc):', appearedStats.length);

        const filteredStats = appearedStats
            .filter(stat => {
                const daysSinceLastAppeared = getDaysBetween(stat.lastAppeared, endDate);
                const passesFilter = daysSinceLastAppeared >= minDays && daysSinceLastAppeared <= maxDays;
                if (passesFilter) {
                    console.log(`Số ${stat.number} qua bộ lọc: gapDraws=${daysSinceLastAppeared}, lastAppeared=${formatDate(stat.lastAppeared)}`);
                }
                return passesFilter;
            })
            .sort((a, b) => b.gapDraws - a.gapDraws);

        console.log('Số đã lọc:', filteredStats.map(stat => ({
            number: stat.number,
            gapDraws: stat.gapDraws,
            lastAppeared: formatDate(stat.lastAppeared),
        })));

        const response = {
            statistics: filteredStats.map(stat => ({
                number: Number(stat.number.toString().padStart(2, '0')),
                lastAppeared: formatDate(stat.lastAppeared),
                gapDraws: stat.gapDraws,
                maxGap: stat.maxGap,
            })),
            metadata: {
                startDate: formatDate(startDate),
                endDate: formatDate(endDate),
                totalDraws: allResults.length,
                days: daysNum,
                filterType: description,
                totalNumbers: filteredStats.length,
                message: filteredStats.length === 0 ? 'Không tìm thấy số nào trong khoảng thời gian đã chọn.' : undefined,
            },
        };

        console.log('Response cuối cùng:', JSON.stringify(response, null, 2));
        return response;
    } catch (error) {
        throw error;
    }
};

// Hàm lấy danh sách giải đặc biệt
const calculateSpecialPrizeStats = async (days) => {
    try {
        const validDaysOptions = [10, 20, 30, 60, 90, 100, 120, 150, 180, 270, 365];
        const daysNum = Number(days);
        if (!validDaysOptions.includes(daysNum)) {
            throw new Error('Tham số days không hợp lệ. Các giá trị hợp lệ: 10, 20, 30, 60, 90, 100, 120, 150, 180, 270, 365.');
        }

        const { maxDays, description } = getFilterRange(daysNum, 'specialPrize');

        const endDate = new Date();
        const startDate = new Date(endDate);
        startDate.setDate(endDate.getDate() - maxDays);

        console.log(`Tham số: days=${daysNum}, filterRange=${description}, maxDays=${maxDays}`);
        console.log(`Phạm vi ngày: ${formatDate(startDate)} đến ${formatDate(endDate)}`);

        let query = {
            drawDate: { $gte: startDate, $lte: endDate },
        };

        const results = await XSMB.find(query)
            .select('drawDate specialPrize dayOfWeek')
            .sort({ drawDate: -1 })
            .lean();
        if (results.length === 0) {
            throw new Error(`Không tìm thấy dữ liệu trong cơ sở dữ liệu cho XSMB.`);
        }
        console.log('Ngày xổ số gần nhất:', formatDate(results[0].drawDate));
        console.log('Số lượng bản ghi tìm thấy:', results.length);

        const specialPrizes = [];
        for (const result of results) {
            const drawDate = new Date(result.drawDate);
            const specialPrize = result.specialPrize || [];

            if (specialPrize.length === 0) {
                console.log(`Không có giải đặc biệt cho ngày ${formatDate(drawDate)}`);
                continue;
            }

            specialPrize.forEach(prize => {
                if (prize && typeof prize === 'string' && /^\d+$/.test(prize)) {
                    const entry = {
                        number: prize,
                        drawDate: formatDate(drawDate),
                        dayOfWeek: result.dayOfWeek || 'Không xác định',
                    };
                    specialPrizes.push(entry);
                }
            });
        }

        console.log('Danh sách giải đặc biệt:', specialPrizes);

        const response = {
            statistics: specialPrizes,
            metadata: {
                startDate: formatDate(startDate),
                endDate: formatDate(endDate),
                totalDraws: results.length,
                days: daysNum,
                filterType: description,
                totalNumbers: specialPrizes.length,
                message: specialPrizes.length === 0 ? 'Không tìm thấy giải đặc biệt nào trong khoảng thời gian đã chọn.' : undefined,
            },
        };

        console.log('Response cuối cùng:', JSON.stringify(response, null, 2));
        return response;
    } catch (error) {
        throw error;
    }
};

// Hàm trích xuất Đầu và Đuôi từ 2 số cuối
const extractDauDuoi = (number) => {
    if (!number || typeof number !== 'string' || !/^\d+$/.test(number)) return null;
    const str = number.toString();
    const lastTwo = str.length >= 2 ? str.slice(-2) : str.padStart(2, '0');
    const dau = parseInt(lastTwo[0]);
    const duoi = parseInt(lastTwo[1]);
    return { dau, duoi };
};

// Hàm tính toán Đầu/Đuôi
const calculateDauDuoiStats = async (days) => {
    try {
        const validDaysOptions = [30, 60, 90, 120, 180, 365];
        const daysNum = Number(days);
        if (!validDaysOptions.includes(daysNum)) {
            throw new Error('Tham số days không hợp lệ. Các giá trị hợp lệ: 30, 60, 90, 120, 180, 365.');
        }

        const { maxDays, description } = getFilterRange(daysNum, 'specialPrize');

        const endDate = new Date();
        const startDate = new Date(endDate);
        startDate.setDate(endDate.getDate() - maxDays);

        console.log(`Tham số: days=${daysNum}, filterRange=${description}`);
        console.log(`Phạm vi ngày: ${formatDate(startDate)} đến ${formatDate(endDate)}`);

        let query = {
            drawDate: { $gte: startDate, $lte: endDate },
        };

        const results = await XSMB.find(query)
            .select('drawDate specialPrize firstPrize secondPrize threePrizes fourPrizes fivePrizes sixPrizes sevenPrizes eightPrizes')
            .sort({ drawDate: -1 })
            .lean();
        if (results.length === 0) {
            throw new Error(`Không tìm thấy dữ liệu trong cơ sở dữ liệu cho XSMB.`);
        }
        console.log('Ngày xổ số gần nhất:', formatDate(results[0].drawDate));
        console.log('Số lượng bản ghi tìm thấy:', results.length);

        const dauStats = Array(10).fill(0);
        const duoiStats = Array(10).fill(0);
        let totalDauDuoi = 0;

        const specialDauStats = Array(10).fill(0);
        const specialDuoiStats = Array(10).fill(0);
        let totalSpecialDauDuoi = 0;

        for (const result of results) {
            const drawDate = new Date(result.drawDate);
            const allPrizes = [
                ...(result.specialPrize || []),
                ...(result.firstPrize || []),
                ...(result.secondPrize || []),
                ...(result.threePrizes || []),
                ...(result.fourPrizes || []),
                ...(result.fivePrizes || []),
                ...(result.sixPrizes || []),
                ...(result.sevenPrizes || []),
                ...(result.eightPrizes || []),
            ];

            if (allPrizes.length === 0) {
                console.log(`Không có dữ liệu giải thưởng cho ngày ${formatDate(drawDate)}`);
                continue;
            }

            allPrizes.forEach(prize => {
                const dauDuoi = extractDauDuoi(prize);
                if (dauDuoi) {
                    dauStats[dauDuoi.dau]++;
                    duoiStats[dauDuoi.duoi]++;
                    totalDauDuoi++;
                }
            });

            const specialPrize = result.specialPrize && result.specialPrize.length > 0 ? result.specialPrize[0] : null;
            if (specialPrize) {
                const specialDauDuoi = extractDauDuoi(specialPrize);
                if (specialDauDuoi) {
                    specialDauStats[specialDauDuoi.dau]++;
                    specialDuoiStats[specialDauDuoi.duoi]++;
                    totalSpecialDauDuoi++;
                }
            }
        }

        const dauStatsWithPercentage = dauStats.map((count, index) => ({
            number: index,
            count,
            percentage: totalDauDuoi > 0 ? ((count / totalDauDuoi) * 100).toFixed(2) + '%' : '0.00%',
        }));

        const duoiStatsWithPercentage = duoiStats.map((count, index) => ({
            number: index,
            count,
            percentage: totalDauDuoi > 0 ? ((count / totalDauDuoi) * 100).toFixed(2) + '%' : '0.00%',
        }));

        const specialDauStatsWithPercentage = specialDauStats.map((count, index) => ({
            dau: index,
            count,
            percentage: totalSpecialDauDuoi > 0 ? ((count / totalSpecialDauDuoi) * 100).toFixed(2) + '%' : '0.00%',
        }));

        const specialDuoiStatsWithPercentage = specialDuoiStats.map((count, index) => ({
            duoi: index,
            count,
            percentage: totalSpecialDauDuoi > 0 ? ((count / totalSpecialDauDuoi) * 100).toFixed(2) + '%' : '0.00%',
        }));

        const specialDauDuoiStats = Array.from({ length: 10 }, (_, index) => ({
            number: index,
            dauCount: specialDauStatsWithPercentage[index].count,
            dauPercentage: specialDauStatsWithPercentage[index].percentage,
            duoiCount: specialDuoiStatsWithPercentage[index].count,
            duoiPercentage: specialDuoiStatsWithPercentage[index].percentage,
        }));

        const response = {
            dauStats: dauStatsWithPercentage,
            duoiStats: duoiStatsWithPercentage,
            specialDauDuoiStats: specialDauDuoiStats,
            metadata: {
                startDate: formatDate(startDate),
                endDate: formatDate(endDate),
                totalDraws: results.length,
                days: daysNum,
                filterType: description,
                totalDauDuoi,
                totalSpecialDauDuoi,
                message: totalDauDuoi === 0 ? 'Không tìm thấy dữ liệu Đầu Đuôi trong khoảng thời gian đã chọn.' : undefined,
            },
        };

        console.log('Response cuối cùng:', JSON.stringify(response, null, 2));
        return response;
    } catch (error) {
        throw error;
    }
};

// Hàm tính toán Đầu/Đuôi theo ngày
const calculateDauDuoiStatsByDate = async (days) => {
    try {
        const validDaysOptions = [30, 60, 90, 120, 180, 365];
        const daysNum = Number(days);
        if (!validDaysOptions.includes(daysNum)) {
            throw new Error('Tham số days không hợp lệ. Các giá trị hợp lệ: 30, 60, 90, 120, 180, 365.');
        }

        const { maxDays, description } = getFilterRange(daysNum, 'specialPrize');

        const endDate = new Date();
        const startDate = new Date(endDate);
        startDate.setDate(endDate.getDate() - maxDays);

        console.log(`Tham số: days=${daysNum}, filterRange=${description}`);
        console.log(`Phạm vi ngày: ${formatDate(startDate)} đến ${formatDate(endDate)}`);

        let query = {
            drawDate: { $gte: startDate, $lte: endDate },
        };

        const results = await XSMB.find(query)
            .select('drawDate specialPrize firstPrize secondPrize threePrizes fourPrizes fivePrizes sixPrizes sevenPrizes eightPrizes')
            .sort({ drawDate: -1 })
            .lean();
        if (results.length === 0) {
            throw new Error(`Không tìm thấy dữ liệu trong cơ sở dữ liệu cho XSMB.`);
        }
        console.log('Ngày xổ số gần nhất:', formatDate(results[0].drawDate));
        console.log('Số lượng bản ghi tìm thấy:', results.length);

        const dauStatsByDate = {};
        const duoiStatsByDate = {};

        for (const result of results) {
            const drawDate = new Date(result.drawDate);
            const dateKey = formatDate(drawDate);

            const allPrizes = [
                ...(result.specialPrize || []),
                ...(result.firstPrize || []),
                ...(result.secondPrize || []),
                ...(result.threePrizes || []),
                ...(result.fourPrizes || []),
                ...(result.fivePrizes || []),
                ...(result.sixPrizes || []),
                ...(result.sevenPrizes || []),
                ...(result.eightPrizes || []),
            ];

            if (allPrizes.length === 0) {
                console.log(`Không có dữ liệu giải thưởng cho ngày ${dateKey}`);
                continue;
            }

            if (!dauStatsByDate[dateKey]) {
                dauStatsByDate[dateKey] = Array(10).fill(0);
                duoiStatsByDate[dateKey] = Array(10).fill(0);
            }

            allPrizes.forEach(prize => {
                const dauDuoi = extractDauDuoi(prize);
                if (dauDuoi) {
                    dauStatsByDate[dateKey][dauDuoi.dau]++;
                    duoiStatsByDate[dateKey][dauDuoi.duoi]++;
                }
            });
        }

        const response = {
            dauStatsByDate,
            duoiStatsByDate,
            metadata: {
                startDate: formatDate(startDate),
                endDate: formatDate(endDate),
                totalDraws: results.length,
                days: daysNum,
                filterType: description,
                message: Object.keys(dauStatsByDate).length === 0 ? 'Không tìm thấy dữ liệu Đầu Đuôi trong khoảng thời gian đã chọn.' : undefined,
            },
        };

        console.log('Response cuối cùng:', JSON.stringify(response, null, 2));
        return response;
    } catch (error) {
        throw error;
    }
};

// Controller cho lô gan
const getLoGanStats = async (req, res) => {
    const { days } = req.query;
    try {
        if (!days || isNaN(days)) {
            throw new Error('Tham số days là bắt buộc và phải là số. Các giá trị hợp lệ: 6, 7, 14, 30, 60.');
        }

        // Lấy từ database model trước
        const filterType = days === 6 ? 'below-7' : 
                          days === 7 ? '7-14' : 
                          days === 14 ? '14-28' :
                          days === 30 ? '30' : '60';

        const dbStats = await LoGanStats.findOne({ filterType });
        
        if (dbStats) {
            console.log(`✅ Trả về dữ liệu từ database model: ${filterType}`);
            const result = {
                statistics: dbStats.statistics,
                metadata: dbStats.metadata
            };
            return res.status(200).json(result);
        }

        // Nếu không có trong database, tính toán mới và lưu vào database
        console.log(`⚠️ Không có dữ liệu trong database, đang tính toán...`);
        const result = await calculateLoGan(days);
        
        // Tự động lưu vào database để lần sau không phải tính lại
        await LoGanStats.findOneAndUpdate(
            { filterType },
            {
                filterType,
                description: result.metadata?.description || `${days} ngày`,
                statistics: result.statistics,
                metadata: result.metadata,
                lastUpdated: new Date()
            },
            { upsert: true, new: true }
        );
        console.log(`✅ Đã tự động lưu thống kê Lô Gan vào database: ${filterType}`);
        
        res.status(200).json(result);
    } catch (error) {
        console.error('Lỗi trong getLoGanStats:', error.message);
        if (error.message.includes('Không tìm thấy dữ liệu')) {
            res.status(404).json({ error: error.message });
        } else if (error.message.includes('Invalid') || error.message.includes('required')) {
            res.status(400).json({ error: error.message });
        } else {
            res.status(500).json({ error: `Lỗi máy chủ nội bộ: ${error.message}` });
        }
    }
};

// Controller cho giải đặc biệt
const getSpecialPrizeStats = async (req, res) => {
    const { days } = req.query;
    try {
        if (!days || isNaN(days)) {
            throw new Error('Tham số days là bắt buộc và phải là số. Các giá trị hợp lệ: 10, 20, 30, 60, 90, 180, 270, 365.');
        }

        // Lấy từ database model trước
        const dbStats = await GiaiDacBietStats.findOne({ days: Number(days) });
        
        if (dbStats) {
            console.log(`✅ Trả về dữ liệu từ database model: days=${days}`);
            const result = {
                statistics: dbStats.statistics,
                metadata: dbStats.metadata
            };
            return res.status(200).json(result);
        }

        // Nếu không có trong database, tính toán mới và lưu vào database
        console.log(`⚠️ Không có dữ liệu trong database, đang tính toán...`);
        const result = await calculateSpecialPrizeStats(days);
        
        // Tự động lưu vào database để lần sau không phải tính lại
        await GiaiDacBietStats.findOneAndUpdate(
            { days: Number(days) },
            {
                days: Number(days),
                statistics: result.statistics,
                metadata: result.metadata,
                lastUpdated: new Date()
            },
            { upsert: true, new: true }
        );
        console.log(`✅ Đã tự động lưu thống kê Giải Đặc Biệt vào database: days=${days}`);
        
        res.status(200).json(result);
    } catch (error) {
        console.error('Lỗi trong getSpecialPrizeStats:', error.message);
        if (error.message.includes('Không tìm thấy dữ liệu')) {
            res.status(404).json({ error: error.message });
        } else if (error.message.includes('Invalid') || error.message.includes('required')) {
            res.status(400).json({ error: error.message });
        } else {
            res.status(500).json({ error: `Lỗi máy chủ nội bộ: ${error.message}` });
        }
    }
};

// Controller cho thống kê Đầu Đuôi
const getDauDuoiStats = async (req, res) => {
    const { days } = req.query;
    try {
        if (!days || isNaN(days)) {
            throw new Error('Tham số days là bắt buộc và phải là số. Các giá trị hợp lệ: 30, 60, 90, 120, 180, 365.');
        }

        // Lấy từ database model trước
        const dbStats = await DauDuoiStats.findOne({ days: Number(days) });
        
        if (dbStats) {
            console.log(`✅ Trả về dữ liệu từ database model: days=${days}`);
            const result = {
                dauStats: dbStats.dauStats,
                duoiStats: dbStats.duoiStats,
                specialDauDuoiStats: dbStats.specialDauDuoiStats,
                metadata: dbStats.metadata
            };
            return res.status(200).json(result);
        }

        // Nếu không có trong database, tính toán mới và lưu vào database
        console.log(`⚠️ Không có dữ liệu trong database, đang tính toán...`);
        const result = await calculateDauDuoiStats(days);
        
        // Tự động lưu vào database để lần sau không phải tính lại
        await DauDuoiStats.findOneAndUpdate(
            { days: Number(days) },
            {
                days: Number(days),
                dauStats: result.dauStats,
                duoiStats: result.duoiStats,
                specialDauDuoiStats: result.specialDauDuoiStats,
                metadata: result.metadata,
                lastUpdated: new Date()
            },
            { upsert: true, new: true }
        );
        console.log(`✅ Đã tự động lưu thống kê Đầu Đuôi vào database: days=${days}`);
        
        res.status(200).json(result);
    } catch (error) {
        console.error('Lỗi trong getDauDuoiStats:', error.message);
        if (error.message.includes('Không tìm thấy dữ liệu')) {
            res.status(404).json({ error: error.message });
        } else if (error.message.includes('Invalid') || error.message.includes('required')) {
            res.status(400).json({ error: error.message });
        } else {
            res.status(500).json({ error: `Lỗi máy chủ nội bộ: ${error.message}` });
        }
    }
};

// Controller cho thống kê Đầu Đuôi theo ngày
const getDauDuoiStatsByDate = async (req, res) => {
    const { days } = req.query;
    try {
        if (!days || isNaN(days)) {
            throw new Error('Tham số days là bắt buộc và phải là số. Các giá trị hợp lệ: 30, 60, 90, 120, 180, 365.');
        }

        const cacheKey = `dauDuoiByDate:${days}`;
        
        const cached = memoryCache.get(cacheKey);
        if (cached) {
            console.log(`Trả về dữ liệu từ cache: ${cacheKey}`);
            return res.status(200).json(cached);
        }

        const result = await calculateDauDuoiStatsByDate(days);
        memoryCache.set(cacheKey, result, 7200);
        console.log(`Đã cache dữ liệu: ${cacheKey}`);

        res.status(200).json(result);
    } catch (error) {
        console.error('Lỗi trong getDauDuoiStatsByDate:', error.message);
        if (error.message.includes('Không tìm thấy dữ liệu')) {
            res.status(404).json({ error: error.message });
        } else if (error.message.includes('Invalid') || error.message.includes('required')) {
            res.status(400).json({ error: error.message });
        } else {
            res.status(500).json({ error: `Lỗi máy chủ nội bộ: ${error.message}` });
        }
    }
};

// Hàm tính toán Tần Suất Loto
const calculateTanSuatLoto = async (days) => {
    try {
        const validDaysOptions = [30, 60, 90, 120, 180, 365];
        const daysNum = Number(days);
        if (!validDaysOptions.includes(daysNum)) {
            throw new Error('Tham số days không hợp lệ. Các giá trị hợp lệ: 30, 60, 90, 120, 180, 365.');
        }

        const { maxDays, description } = getFilterRange(daysNum, 'specialPrize');
        const endDate = new Date();
        const startDate = new Date(endDate);
        startDate.setDate(endDate.getDate() - maxDays);

        console.log(`Tham số: days=${daysNum}, filterRange=${description}`);
        console.log(`Phạm vi ngày: ${formatDate(startDate)} đến ${formatDate(endDate)}`);

        let query = {
            drawDate: { $gte: startDate, $lte: endDate },
        };

        const results = await XSMB.find(query)
            .select('drawDate specialPrize firstPrize secondPrize threePrizes fourPrizes fivePrizes sixPrizes sevenPrizes eightPrizes')
            .sort({ drawDate: -1 })
            .lean();

        if (results.length === 0) {
            throw new Error(`Không tìm thấy dữ liệu trong cơ sở dữ liệu cho XSMB.`);
        }

        console.log('Ngày xổ số gần nhất:', formatDate(results[0].drawDate));
        console.log('Số lượng bản ghi tìm thấy:', results.length);

        const lotoStats = Array(100).fill(0);
        let totalLoto = 0;

        for (const result of results) {
            const drawDate = new Date(result.drawDate);
            const allPrizes = [
                ...(result.specialPrize || []),
                ...(result.firstPrize || []),
                ...(result.secondPrize || []),
                ...(result.threePrizes || []),
                ...(result.fourPrizes || []),
                ...(result.fivePrizes || []),
                ...(result.sixPrizes || []),
                ...(result.sevenPrizes || []),
                ...(result.eightPrizes || []),
            ];

            if (allPrizes.length === 0) {
                console.log(`Không có dữ liệu giải thưởng cho ngày ${formatDate(drawDate)}`);
                continue;
            }

            allPrizes.forEach(prize => {
                const loto = getLastTwoDigits(prize);
                if (loto !== null && loto >= 0 && loto <= 99) {
                    lotoStats[loto]++;
                    totalLoto++;
                }
            });
        }

        const statsWithPercentage = lotoStats.map((count, index) => ({
            number: index.toString().padStart(2, '0'),
            count,
            percentage: totalLoto > 0 ? ((count / totalLoto) * 100).toFixed(2) + '%' : '0.00%',
        }));

        const response = {
            statistics: statsWithPercentage,
            metadata: {
                startDate: formatDate(startDate),
                endDate: formatDate(endDate),
                totalDraws: results.length,
                days: daysNum,
                filterType: description,
                totalNumbers: totalLoto,
                message: totalLoto === 0 ? 'Không tìm thấy dữ liệu Loto trong khoảng thời gian đã chọn.' : undefined,
            },
        };

        console.log('Response cuối cùng:', JSON.stringify(response, null, 2));
        return response;
    } catch (error) {
        throw error;
    }
};

// Controller cho thống kê Tần Suất Loto
const getTanSuatLotoStats = async (req, res) => {
    const { days } = req.query;
    try {
        if (!days || isNaN(days)) {
            throw new Error('Tham số days là bắt buộc và phải là số. Các giá trị hợp lệ: 30, 60, 90, 120, 180, 365.');
        }

        // Lấy từ database model trước
        const dbStats = await TanSuatLotoStats.findOne({ days: Number(days) });
        
        if (dbStats) {
            console.log(`✅ Trả về dữ liệu từ database model: days=${days}`);
            const result = {
                statistics: dbStats.statistics,
                metadata: dbStats.metadata
            };
            return res.status(200).json(result);
        }

        // Nếu không có trong database, tính toán mới và lưu vào database
        console.log(`⚠️ Không có dữ liệu trong database, đang tính toán...`);
        const result = await calculateTanSuatLoto(days);
        
        // Tự động lưu vào database để lần sau không phải tính lại
        await TanSuatLotoStats.findOneAndUpdate(
            { days: Number(days) },
            {
                days: Number(days),
                statistics: result.statistics,
                metadata: result.metadata,
                lastUpdated: new Date()
            },
            { upsert: true, new: true }
        );
        console.log(`✅ Đã tự động lưu thống kê Tần Suất Lô Tô vào database: days=${days}`);
        
        res.status(200).json(result);
    } catch (error) {
        console.error('Lỗi trong getTanSuatLotoStats:', error.message);
        if (error.message.includes('Không tìm thấy dữ liệu')) {
            res.status(404).json({ error: error.message });
        } else if (error.message.includes('Invalid') || error.message.includes('required')) {
            res.status(400).json({ error: error.message });
        } else {
            res.status(500).json({ error: `Lỗi máy chủ nội bộ: ${error.message}` });
        }
    }
};

// Danh sách các cặp lô cần thống kê
const predefinedLoCapPairs = [
    "00-55", "01-10", "02-20", "03-30", "04-40", "05-50", "06-60", "07-70", "08-80", "09-90",
    "11-66", "12-21", "13-31", "14-41", "15-51", "16-61", "17-71", "18-81", "19-91",
    "22-77", "23-32", "24-42", "25-52", "26-62", "27-72", "28-82", "29-92",
    "33-88", "34-43", "35-53", "36-63", "37-73", "38-83", "39-93",
    "44-99", "45-54", "46-64", "47-74", "48-84", "49-94",
    "55-00", "56-65", "57-75", "58-85", "59-95",
    "66-11", "67-76", "68-86", "69-96",
    "77-22", "78-87", "79-97",
    "88-33", "89-98",
];

// Hàm tính toán Tần Suất Lô Cặp
const calculateTanSuatLoCap = async (days) => {
    try {
        const validDaysOptions = [30, 60, 90, 120, 180, 365];
        const daysNum = Number(days);
        if (!validDaysOptions.includes(daysNum)) {
            throw new Error('Tham số days không hợp lệ. Các giá trị hợp lệ: 30, 60, 90, 120, 180, 365.');
        }

        const { maxDays, description } = getFilterRange(daysNum, 'specialPrize');
        const endDate = new Date();
        const startDate = new Date(endDate);
        startDate.setDate(endDate.getDate() - maxDays);

        console.log(`Tham số: days=${daysNum}, filterRange=${description}`);

        let query = {
            drawDate: { $gte: startDate, $lte: endDate },
        };

        console.log(`Query MongoDB:`, JSON.stringify(query));
        const results = await XSMB.find(query)
            .select('drawDate specialPrize firstPrize secondPrize threePrizes fourPrizes fivePrizes sixPrizes sevenPrizes eightPrizes')
            .sort({ drawDate: -1 })
            .lean();

        if (results.length === 0) {
            throw new Error(`Không tìm thấy dữ liệu trong cơ sở dữ liệu cho XSMB.`);
        }

        console.log(`Số lượng bản ghi tìm thấy: ${results.length}`);
        console.log(`Ngày xổ số gần nhất: ${formatDate(results[0].drawDate)}`);

        // Khởi tạo mảng thống kê cho từng số từ 00 đến 99
        const numberStats = Array(100).fill(0); // Đếm số lần xuất hiện của từng số (00-99)

        // Duyệt qua dữ liệu để đếm tần suất của từng số
        for (const result of results) {
            const drawDate = new Date(result.drawDate);
            const allPrizes = [
                ...(result.specialPrize || []),
                ...(result.firstPrize || []),
                ...(result.secondPrize || []),
                ...(result.threePrizes || []),
                ...(result.fourPrizes || []),
                ...(result.fivePrizes || []),
                ...(result.sixPrizes || []),
                ...(result.sevenPrizes || []),
                ...(result.eightPrizes || []),
            ];

            if (allPrizes.length === 0) {
                console.log(`Không có dữ liệu giải thưởng cho ngày ${formatDate(drawDate)}`);
                continue;
            }

            // Lấy tất cả các số loto (2 số cuối)
            const numbers = allPrizes
                .map(prize => getLastTwoDigits(prize))
                .filter(num => num !== null && num >= 0 && num <= 99);

            if (numbers.length === 0) {
                console.log(`Không tìm thấy số loto hợp lệ cho ngày ${formatDate(drawDate)}`);
                continue;
            }

            console.log(`Số loto ngày ${formatDate(drawDate)}:`, numbers);

            // Đếm tần suất của từng số
            numbers.forEach(num => {
                numberStats[num]++;
            });
        }

        // Khởi tạo mảng thống kê cho các cặp lô
        const loCapStats = predefinedLoCapPairs.reduce((acc, pair) => {
            const [xx, yy] = pair.split('-');
            const xxNum = parseInt(xx);
            const yyNum = parseInt(yy);
            const xxCount = numberStats[xxNum]; // Số lần xuất hiện của xx
            const yyCount = numberStats[yyNum]; // Số lần xuất hiện của yy
            const totalCount = xxCount + yyCount; // Tổng số lần xuất hiện của cặp

            acc[pair] = {
                pair,
                xxCount, // Số lần xuất hiện của số đầu tiên
                yyCount, // Số lần xuất hiện của số thứ hai
                count: totalCount, // Tổng số lần xuất hiện
                percentage: '0.00%' // Sẽ được tính sau
            };
            return acc;
        }, {});

        // Tính tổng số lần xuất hiện của tất cả các cặp (để tính phần trăm)
        let totalLoCap = 0;
        Object.values(loCapStats).forEach(stat => {
            totalLoCap += stat.count;
        });

        // Tính tỷ lệ phần trăm
        Object.values(loCapStats).forEach(stat => {
            const percentage = totalLoCap > 0 ? ((stat.count / totalLoCap) * 100).toFixed(2) : '0.00';
            stat.percentage = percentage + '%';
        });

        // Chuyển đổi thành mảng và sắp xếp theo tổng số lần xuất hiện giảm dần
        const sortedStats = Object.values(loCapStats).sort((a, b) => b.count - a.count || a.pair.localeCompare(b.pair));

        const response = {
            statistics: sortedStats,
            metadata: {
                startDate: formatDate(startDate),
                endDate: formatDate(endDate),
                totalDraws: results.length,
                days: daysNum,
                filterType: description,
                totalPairs: totalLoCap,
                message: totalLoCap === 0 ? 'Không tìm thấy dữ liệu Lô Cặp trong khoảng thời gian đã chọn.' : undefined,
            },
        };

        console.log('Response cuối cùng:', JSON.stringify(response, null, 2));
        return response;
    } catch (error) {
        console.error('Lỗi trong calculateTanSuatLoCap:', error.message);
        throw error;
    }
};

// Controller cho thống kê Tần Suất Lô Cặp
const getTanSuatLoCapStats = async (req, res) => {
    const { days } = req.query;
    try {
        if (!days || isNaN(days)) {
            throw new Error('Tham số days là bắt buộc và phải là số. Các giá trị hợp lệ: 30, 60, 90, 120, 180, 365.');
        }

        // Lấy từ database model trước
        const dbStats = await TanSuatLoCapStats.findOne({ days: Number(days) });
        
        if (dbStats) {
            console.log(`✅ Trả về dữ liệu từ database model: days=${days}`);
            const result = {
                statistics: dbStats.statistics,
                metadata: dbStats.metadata
            };
            return res.status(200).json(result);
        }

        // Nếu không có trong database, tính toán mới và lưu vào database
        console.log(`⚠️ Không có dữ liệu trong database, đang tính toán...`);
        const result = await calculateTanSuatLoCap(days);
        
        // Tự động lưu vào database để lần sau không phải tính lại
        await TanSuatLoCapStats.findOneAndUpdate(
            { days: Number(days) },
            {
                days: Number(days),
                statistics: result.statistics,
                metadata: result.metadata,
                lastUpdated: new Date()
            },
            { upsert: true, new: true }
        );
        console.log(`✅ Đã tự động lưu thống kê Tần Suất Lô Cặp vào database: days=${days}`);
        
        res.status(200).json(result);
    } catch (error) {
        console.error('Lỗi trong getTanSuatLoCapStats:', error.message);
        if (error.message.includes('Không tìm thấy dữ liệu')) {
            res.status(404).json({ error: error.message });
        } else if (error.message.includes('Invalid') || error.message.includes('required')) {
            res.status(400).json({ error: error.message });
        } else {
            res.status(500).json({ error: `Lỗi máy chủ nội bộ: ${error.message}` });
        }
    }
};

module.exports = {
    getLoGanStats,
    getSpecialPrizeStats,
    getSpecialPrizeStatsByWeek,
    getDauDuoiStats,
    getDauDuoiStatsByDate,
    getTanSuatLotoStats,
    getTanSuatLoCapStats,
    // Export calculate functions for stats update
    calculateLoGanStats: calculateLoGan,
    calculateSpecialPrizeStats,
    calculateSpecialPrizeStatsByWeek,
    calculateDauDuoiStats,
    calculateTanSuatLotoStats: calculateTanSuatLoto,
    calculateTanSuatLoCapStats: calculateTanSuatLoCap
};
