const SpecialDetailedStats = require('../models/stats/specialDetailedStats.model');
const GiaiDacBietStats = require('../models/stats/giaiDacBietStats.model');
const { findSetsContainingNumber } = require('../utils/specialSets');

/**
 * Tính toán và lưu thống kê chi tiết cho giải đặc biệt
 * Bao gồm: gan theo số, tổng, chạm, bộ, đầu đuôi
 */
const calculateAndSaveSpecialDetailedStats = async (days) => {
    try {
        // Lấy dữ liệu giải đặc biệt từ database
        const specialStats = await GiaiDacBietStats.findOne({ days: Number(days) });
        
        if (!specialStats || !specialStats.statistics || specialStats.statistics.length === 0) {
            throw new Error(`Không tìm thấy dữ liệu giải đặc biệt cho ${days} ngày`);
        }

        const records = specialStats.statistics;
        const today = new Date();
        const dayMs = 24 * 60 * 60 * 1000;

        // Map: lastTwo => lastSeenDate (Date)
        const lastSeen = new Map();
        // Map: sumDigit(0-9) => lastSeenDate
        const sumLastSeen = new Map();
        // Map: chamDigit(0-9) => lastSeenDate
        const chamLastSeen = new Map();
        // Map: setId => lastSeenDate
        const boLastSeen = new Map();
        // Map: setId => count
        const boFreq = new Map();
        // Array: dauFreq[0-9] = count
        const dauFreq = Array(10).fill(0);
        const duoiFreq = Array(10).fill(0);
        // Array: dauLastSeen[0-9] = Date
        const dauLastSeen = Array(10).fill(null);
        const duoiLastSeen = Array(10).fill(null);
        // Map: sumDigit => count (tần suất tổng)
        const sumFreq = new Map();
        // Map: chamDigit => count (tần suất chạm)
        const chamFreq = new Map();

        // Xử lý từng record
        records.forEach(r => {
            if (!r?.number || !r?.drawDate) return;
            
            const lastTwo = String(r.number).slice(-2).padStart(2, '0');
            const [d, m, y] = String(r.drawDate).split('/');
            const dateObj = new Date(Number(y), Number(m) - 1, Number(d));
            
            // Gan theo số (00-99)
            const existed = lastSeen.get(lastTwo);
            if (!existed || dateObj > existed) {
                lastSeen.set(lastTwo, dateObj);
            }

            // Tổng: (a + b) % 10
            const a = parseInt(lastTwo[0], 10);
            const b = parseInt(lastTwo[1], 10);
            const sumDigit = (a + b) % 10;
            const sumExist = sumLastSeen.get(sumDigit);
            if (!sumExist || dateObj > sumExist) {
                sumLastSeen.set(sumDigit, dateObj);
            }
            // Đếm tần suất tổng
            sumFreq.set(sumDigit, (sumFreq.get(sumDigit) || 0) + 1);

            // Chạm: mỗi chữ số có mặt trong 2 số cuối
            const digits = new Set([a, b]);
            digits.forEach(dg => {
                const chamExist = chamLastSeen.get(dg);
                if (!chamExist || dateObj > chamExist) {
                    chamLastSeen.set(dg, dateObj);
                }
                // Đếm tần suất chạm
                chamFreq.set(dg, (chamFreq.get(dg) || 0) + 1);
            });

            // Gan theo bộ: đối chiếu với 100 bộ số đặc biệt
            const containingSets = findSetsContainingNumber(lastTwo);
            containingSets.forEach(setId => {
                const existed = boLastSeen.get(setId);
                if (!existed || dateObj > existed) {
                    boLastSeen.set(setId, dateObj);
                }
                boFreq.set(setId, (boFreq.get(setId) || 0) + 1);
            });

            // Đầu đuôi
            dauFreq[a]++;
            duoiFreq[b]++;
            if (!dauLastSeen[a] || dateObj > dauLastSeen[a]) {
                dauLastSeen[a] = dateObj;
            }
            if (!duoiLastSeen[b] || dateObj > duoiLastSeen[b]) {
                duoiLastSeen[b] = dateObj;
            }
        });

        // Tính toán gaps cho số (00-99)
        const numberGaps = [];
        for (let i = 0; i < 100; i++) {
            const num = String(i).padStart(2, '0');
            const dt = lastSeen.get(num);
            const daysGap = dt ? Math.max(0, Math.round((today - dt) / dayMs)) : days;
            numberGaps.push({
                number: num,
                days: daysGap,
                lastDate: dt ? dt.toLocaleDateString('vi-VN') : null
            });
        }
        numberGaps.sort((a, b) => b.days - a.days);

        // Tính toán gaps cho tổng (0-9)
        const sumGaps = [];
        for (let s = 0; s <= 9; s++) {
            const dt = sumLastSeen.get(s);
            const daysGap = dt ? Math.max(0, Math.round((today - dt) / dayMs)) : days;
            sumGaps.push({
                sum: s,
                days: daysGap,
                lastDate: dt ? dt.toLocaleDateString('vi-VN') : null
            });
        }
        sumGaps.sort((a, b) => b.days - a.days);

        // Tính toán tần suất cho tổng (0-9)
        const totalSum = Array.from(sumFreq.values()).reduce((sum, val) => sum + val, 0);
        const sumFrequency = [];
        for (let s = 0; s <= 9; s++) {
            const count = sumFreq.get(s) || 0;
            sumFrequency.push({
                sum: s,
                count,
                percentage: totalSum > 0 ? `${((count / totalSum) * 100).toFixed(2)}%` : '0%'
            });
        }
        sumFrequency.sort((a, b) => (b.count || 0) - (a.count || 0));

        // Tính toán gaps cho chạm (0-9)
        const chamGaps = [];
        for (let c = 0; c <= 9; c++) {
            const dt = chamLastSeen.get(c);
            const daysGap = dt ? Math.max(0, Math.round((today - dt) / dayMs)) : days;
            chamGaps.push({
                cham: c,
                days: daysGap,
                lastDate: dt ? dt.toLocaleDateString('vi-VN') : null
            });
        }
        chamGaps.sort((a, b) => b.days - a.days);

        // Tính toán tần suất cho chạm (0-9)
        const totalCham = Array.from(chamFreq.values()).reduce((sum, val) => sum + val, 0);
        const chamFrequency = [];
        for (let c = 0; c <= 9; c++) {
            const count = chamFreq.get(c) || 0;
            chamFrequency.push({
                cham: c,
                count,
                percentage: totalCham > 0 ? `${((count / totalCham) * 100).toFixed(2)}%` : '0%'
            });
        }
        chamFrequency.sort((a, b) => (b.count || 0) - (a.count || 0));

        // Tính toán gaps cho bộ (00-99)
        const boGaps = [];
        for (let i = 0; i < 100; i++) {
            const setId = String(i).padStart(2, '0');
            const dt = boLastSeen.get(setId);
            const daysGap = dt ? Math.max(0, Math.round((today - dt) / dayMs)) : days;
            boGaps.push({
                setId,
                days: daysGap,
                lastDate: dt ? dt.toLocaleDateString('vi-VN') : null
            });
        }
        boGaps.sort((a, b) => b.days - a.days);

        // Tính toán tần suất cho bộ
        const totalBo = Array.from(boFreq.values()).reduce((sum, val) => sum + val, 0);
        const boFrequency = [];
        for (let i = 0; i < 100; i++) {
            const setId = String(i).padStart(2, '0');
            const count = boFreq.get(setId) || 0;
            boFrequency.push({
                setId,
                count,
                percentage: totalBo > 0 ? `${((count / totalBo) * 100).toFixed(2)}%` : '0%'
            });
        }
        boFrequency.sort((a, b) => (b.count || 0) - (a.count || 0));

        // Tính toán gaps cho đầu (0-9)
        const dauGaps = dauLastSeen.map((date, digit) => {
            const daysGap = date ? Math.max(0, Math.round((today - date) / dayMs)) : days;
            return {
                digit,
                days: daysGap,
                lastDate: date ? date.toLocaleDateString('vi-VN') : null
            };
        }).sort((a, b) => (b.days || 0) - (a.days || 0));

        // Tính toán gaps cho đuôi (0-9)
        const duoiGaps = duoiLastSeen.map((date, digit) => {
            const daysGap = date ? Math.max(0, Math.round((today - date) / dayMs)) : days;
            return {
                digit,
                days: daysGap,
                lastDate: date ? date.toLocaleDateString('vi-VN') : null
            };
        }).sort((a, b) => (b.days || 0) - (a.days || 0));

        // Tính toán tần suất cho đầu
        const totalDau = dauFreq.reduce((sum, val) => sum + val, 0);
        const dauFrequency = dauFreq.map((count, digit) => ({
            digit,
            count,
            percentage: totalDau > 0 ? `${((count / totalDau) * 100).toFixed(2)}%` : '0%'
        })).sort((a, b) => (b.count || 0) - (a.count || 0));

        // Tính toán tần suất cho đuôi
        const totalDuoi = duoiFreq.reduce((sum, val) => sum + val, 0);
        const duoiFrequency = duoiFreq.map((count, digit) => ({
            digit,
            count,
            percentage: totalDuoi > 0 ? `${((count / totalDuoi) * 100).toFixed(2)}%` : '0%'
        })).sort((a, b) => (b.count || 0) - (a.count || 0));

        // Lưu vào database
        const detailedStats = {
            days: Number(days),
            numberGaps,
            sumGaps,
            sumFrequency,
            chamGaps,
            chamFrequency,
            boGaps,
            boFrequency,
            dauGaps,
            duoiGaps,
            dauFrequency,
            duoiFrequency,
            metadata: {
                startDate: specialStats.metadata?.startDate,
                endDate: specialStats.metadata?.endDate,
                totalDraws: specialStats.metadata?.totalDraws,
                calculatedAt: new Date()
            },
            lastUpdated: new Date()
        };

        await SpecialDetailedStats.findOneAndUpdate(
            { days: Number(days) },
            detailedStats,
            { upsert: true, new: true }
        );

        console.log(`✅ Đã tính toán và lưu thống kê chi tiết cho ${days} ngày`);
        return detailedStats;
    } catch (error) {
        console.error('Lỗi trong calculateAndSaveSpecialDetailedStats:', error);
        throw error;
    }
};

/**
 * Lấy thống kê chi tiết từ database
 */
const getSpecialDetailedStats = async (days) => {
    try {
        const stats = await SpecialDetailedStats.findOne({ days: Number(days) });
        return stats;
    } catch (error) {
        console.error('Lỗi trong getSpecialDetailedStats:', error);
        throw error;
    }
};

module.exports = {
    calculateAndSaveSpecialDetailedStats,
    getSpecialDetailedStats
};

