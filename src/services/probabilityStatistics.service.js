/**
 * Probability Statistics Service - Tính toán và lưu thống kê xác suất chi tiết
 */

const XSMB = require('../models/xsmb.model');
const SoiCau = require('../models/soicau.model');

class ProbabilityStatisticsService {
    constructor() {
        console.log('✅ ProbabilityStatisticsService initialized');
    }

    /**
     * Tính toán và lưu thống kê xác suất chi tiết cho một ngày
     * @param {Date} targetDate - Ngày cần tính toán
     * @returns {Object} Kết quả thống kê
     */
    async calculateAndSaveProbabilityStatistics(targetDate) {
        try {
            console.log(`📊 Calculating probability statistics for ${targetDate.toISOString().split('T')[0]}`);

            // Lấy dữ liệu lịch sử 100 ngày gần nhất
            const historicalData = await this.getHistoricalData(targetDate, 100);

            // Tính toán thống kê cho từng số
            const statistics = this.calculateNumberStatistics(historicalData);

            // Tính toán thống kê theo vị trí
            const positionStatistics = this.calculatePositionStatistics(historicalData);

            // Tính toán thống kê theo ngày trong tuần
            const dayOfWeekStatistics = this.calculateDayOfWeekStatistics(historicalData);

            // Tính toán thống kê theo tháng
            const monthlyStatistics = this.calculateMonthlyStatistics(historicalData);

            // Tạo document thống kê
            const statisticsData = {
                targetDate: targetDate,
                historicalDays: historicalData.length,
                numberStatistics: statistics,
                positionStatistics: positionStatistics,
                dayOfWeekStatistics: dayOfWeekStatistics,
                monthlyStatistics: monthlyStatistics,
                calculatedAt: new Date()
            };

            // Lưu vào database (có thể tạo model riêng hoặc lưu vào collection khác)
            // Ở đây tôi sẽ log ra để debug, có thể implement lưu database sau
            console.log(`📈 Probability statistics calculated for ${targetDate.toISOString().split('T')[0]}`);
            console.log(`📊 Processed ${historicalData.length} historical records`);

            return statisticsData;

        } catch (error) {
            console.error('❌ Error calculating probability statistics:', error);
            throw error;
        }
    }

    /**
     * Lấy dữ liệu lịch sử
     * @param {Date} targetDate - Ngày đích
     * @param {number} days - Số ngày lịch sử
     * @returns {Array} Dữ liệu lịch sử
     */
    async getHistoricalData(targetDate, days) {
        try {
            const startDate = new Date(targetDate);
            startDate.setDate(startDate.getDate() - days);

            const historicalData = await XSMB.find({
                date: { $gte: startDate, $lt: targetDate }
            }).sort({ date: -1 }).lean();

            return historicalData;
        } catch (error) {
            console.error('❌ Error getting historical data:', error);
            throw error;
        }
    }

    /**
     * Tính toán thống kê cho từng số
     * @param {Array} historicalData - Dữ liệu lịch sử
     * @returns {Object} Thống kê theo số
     */
    calculateNumberStatistics(historicalData) {
        const statistics = {};

        // Khởi tạo thống kê cho tất cả số từ 00-99
        for (let i = 0; i < 100; i++) {
            const num = i.toString().padStart(2, '0');
            statistics[num] = {
                deAppearances: 0,
                loAppearances: 0,
                totalAppearances: 0,
                frequency: 0,
                lastAppearance: null,
                averageGap: 0,
                maxGap: 0,
                minGap: Infinity
            };
        }

        // Tính toán thống kê
        historicalData.forEach((record, index) => {
            const recordDate = new Date(record.date);

            // Đếm số đặc biệt
            if (record.specialPrize && record.specialPrize.length > 0) {
                record.specialPrize.forEach(prize => {
                    if (prize && prize.length >= 2) {
                        const deNumber = prize.slice(-2);
                        if (statistics[deNumber]) {
                            statistics[deNumber].deAppearances++;
                            statistics[deNumber].totalAppearances++;
                            statistics[deNumber].lastAppearance = recordDate;
                        }
                    }
                });
            }

            // Đếm tất cả các giải (lô)
            const allPrizes = [
                ...(record.specialPrize || []),
                ...(record.firstPrize || []),
                ...(record.secondPrize || []),
                ...(record.threePrizes || []),
                ...(record.fourPrizes || []),
                ...(record.fivePrizes || []),
                ...(record.sixPrizes || []),
                ...(record.sevenPrizes || [])
            ];

            allPrizes.forEach(prize => {
                if (prize && prize.length >= 2) {
                    const loNumber = prize.slice(-2);
                    if (statistics[loNumber]) {
                        statistics[loNumber].loAppearances++;
                        statistics[loNumber].totalAppearances++;
                        statistics[loNumber].lastAppearance = recordDate;
                    }
                }
            });
        });

        // Tính toán frequency và gaps
        Object.keys(statistics).forEach(num => {
            const stat = statistics[num];
            stat.frequency = stat.totalAppearances / historicalData.length;

            // Tính gap (khoảng cách giữa các lần xuất hiện)
            const appearances = [];
            historicalData.forEach((record, index) => {
                const recordDate = new Date(record.date);

                // Kiểm tra số đặc biệt
                if (record.specialPrize && record.specialPrize.length > 0) {
                    record.specialPrize.forEach(prize => {
                        if (prize && prize.length >= 2 && prize.slice(-2) === num) {
                            appearances.push(index);
                        }
                    });
                }

                // Kiểm tra tất cả các giải
                const allPrizes = [
                    ...(record.specialPrize || []),
                    ...(record.firstPrize || []),
                    ...(record.secondPrize || []),
                    ...(record.threePrizes || []),
                    ...(record.fourPrizes || []),
                    ...(record.fivePrizes || []),
                    ...(record.sixPrizes || []),
                    ...(record.sevenPrizes || [])
                ];

                allPrizes.forEach(prize => {
                    if (prize && prize.length >= 2 && prize.slice(-2) === num) {
                        appearances.push(index);
                    }
                });
            });

            // Tính gap statistics
            if (appearances.length > 1) {
                const gaps = [];
                for (let i = 1; i < appearances.length; i++) {
                    gaps.push(appearances[i] - appearances[i - 1]);
                }

                stat.averageGap = gaps.reduce((sum, gap) => sum + gap, 0) / gaps.length;
                stat.maxGap = Math.max(...gaps);
                stat.minGap = Math.min(...gaps);
            } else if (appearances.length === 1) {
                stat.averageGap = historicalData.length - appearances[0];
                stat.maxGap = historicalData.length - appearances[0];
                stat.minGap = historicalData.length - appearances[0];
            } else {
                stat.averageGap = historicalData.length;
                stat.maxGap = historicalData.length;
                stat.minGap = historicalData.length;
            }
        });

        return statistics;
    }

    /**
     * Tính toán thống kê theo vị trí
     * @param {Array} historicalData - Dữ liệu lịch sử
     * @returns {Object} Thống kê theo vị trí
     */
    calculatePositionStatistics(historicalData) {
        const positionStats = {
            specialPrize: {},
            firstPrize: {},
            secondPrize: {},
            threePrizes: {},
            fourPrizes: {},
            fivePrizes: {},
            sixPrizes: {},
            sevenPrizes: {}
        };

        // Khởi tạo thống kê cho từng vị trí
        Object.keys(positionStats).forEach(prizeType => {
            for (let i = 0; i < 100; i++) {
                const num = i.toString().padStart(2, '0');
                positionStats[prizeType][num] = {
                    appearances: 0,
                    frequency: 0,
                    lastAppearance: null
                };
            }
        });

        // Tính toán thống kê
        historicalData.forEach(record => {
            const recordDate = new Date(record.date);

            // Đặc biệt
            if (record.specialPrize && record.specialPrize.length > 0) {
                record.specialPrize.forEach(prize => {
                    if (prize && prize.length >= 2) {
                        const num = prize.slice(-2);
                        if (positionStats.specialPrize[num]) {
                            positionStats.specialPrize[num].appearances++;
                            positionStats.specialPrize[num].lastAppearance = recordDate;
                        }
                    }
                });
            }

            // Giải nhất
            if (record.firstPrize && record.firstPrize.length > 0) {
                record.firstPrize.forEach(prize => {
                    if (prize && prize.length >= 2) {
                        const num = prize.slice(-2);
                        if (positionStats.firstPrize[num]) {
                            positionStats.firstPrize[num].appearances++;
                            positionStats.firstPrize[num].lastAppearance = recordDate;
                        }
                    }
                });
            }

            // Các giải khác tương tự...
            // (Có thể implement chi tiết hơn cho từng loại giải)
        });

        // Tính frequency
        Object.keys(positionStats).forEach(prizeType => {
            Object.keys(positionStats[prizeType]).forEach(num => {
                positionStats[prizeType][num].frequency =
                    positionStats[prizeType][num].appearances / historicalData.length;
            });
        });

        return positionStats;
    }

    /**
     * Tính toán thống kê theo ngày trong tuần
     * @param {Array} historicalData - Dữ liệu lịch sử
     * @returns {Object} Thống kê theo ngày trong tuần
     */
    calculateDayOfWeekStatistics(historicalData) {
        const dayStats = {
            '0': { name: 'Chủ nhật', totalDraws: 0, deNumbers: {}, loNumbers: {} },
            '1': { name: 'Thứ hai', totalDraws: 0, deNumbers: {}, loNumbers: {} },
            '2': { name: 'Thứ ba', totalDraws: 0, deNumbers: {}, loNumbers: {} },
            '3': { name: 'Thứ tư', totalDraws: 0, deNumbers: {}, loNumbers: {} },
            '4': { name: 'Thứ năm', totalDraws: 0, deNumbers: {}, loNumbers: {} },
            '5': { name: 'Thứ sáu', totalDraws: 0, deNumbers: {}, loNumbers: {} },
            '6': { name: 'Thứ bảy', totalDraws: 0, deNumbers: {}, loNumbers: {} }
        };

        historicalData.forEach(record => {
            const recordDate = new Date(record.date);
            const dayOfWeek = recordDate.getDay().toString();

            if (dayStats[dayOfWeek]) {
                dayStats[dayOfWeek].totalDraws++;

                // Đếm số đặc biệt
                if (record.specialPrize && record.specialPrize.length > 0) {
                    record.specialPrize.forEach(prize => {
                        if (prize && prize.length >= 2) {
                            const num = prize.slice(-2);
                            dayStats[dayOfWeek].deNumbers[num] = (dayStats[dayOfWeek].deNumbers[num] || 0) + 1;
                        }
                    });
                }

                // Đếm tất cả số (lô)
                const allPrizes = [
                    ...(record.specialPrize || []),
                    ...(record.firstPrize || []),
                    ...(record.secondPrize || []),
                    ...(record.threePrizes || []),
                    ...(record.fourPrizes || []),
                    ...(record.fivePrizes || []),
                    ...(record.sixPrizes || []),
                    ...(record.sevenPrizes || [])
                ];

                allPrizes.forEach(prize => {
                    if (prize && prize.length >= 2) {
                        const num = prize.slice(-2);
                        dayStats[dayOfWeek].loNumbers[num] = (dayStats[dayOfWeek].loNumbers[num] || 0) + 1;
                    }
                });
            }
        });

        return dayStats;
    }

    /**
     * Tính toán thống kê theo tháng
     * @param {Array} historicalData - Dữ liệu lịch sử
     * @returns {Object} Thống kê theo tháng
     */
    calculateMonthlyStatistics(historicalData) {
        const monthlyStats = {};

        historicalData.forEach(record => {
            const recordDate = new Date(record.date);
            const monthKey = `${recordDate.getFullYear()}-${(recordDate.getMonth() + 1).toString().padStart(2, '0')}`;

            if (!monthlyStats[monthKey]) {
                monthlyStats[monthKey] = {
                    totalDraws: 0,
                    deNumbers: {},
                    loNumbers: {}
                };
            }

            monthlyStats[monthKey].totalDraws++;

            // Đếm số đặc biệt
            if (record.specialPrize && record.specialPrize.length > 0) {
                record.specialPrize.forEach(prize => {
                    if (prize && prize.length >= 2) {
                        const num = prize.slice(-2);
                        monthlyStats[monthKey].deNumbers[num] = (monthlyStats[monthKey].deNumbers[num] || 0) + 1;
                    }
                });
            }

            // Đếm tất cả số (lô)
            const allPrizes = [
                ...(record.specialPrize || []),
                ...(record.firstPrize || []),
                ...(record.secondPrize || []),
                ...(record.threePrizes || []),
                ...(record.fourPrizes || []),
                ...(record.fivePrizes || []),
                ...(record.sixPrizes || []),
                ...(record.sevenPrizes || [])
            ];

            allPrizes.forEach(prize => {
                if (prize && prize.length >= 2) {
                    const num = prize.slice(-2);
                    monthlyStats[monthKey].loNumbers[num] = (monthlyStats[monthKey].loNumbers[num] || 0) + 1;
                }
            });
        });

        return monthlyStats;
    }

    /**
     * Lấy thống kê xác suất cho một ngày cụ thể
     * @param {Date} targetDate - Ngày cần lấy thống kê
     * @returns {Object} Thống kê xác suất
     */
    async getProbabilityStatistics(targetDate) {
        try {
            // Có thể implement logic để lấy thống kê đã được tính toán từ database
            // Hoặc tính toán real-time
            console.log(`📊 Getting probability statistics for ${targetDate.toISOString().split('T')[0]}`);

            // Placeholder - có thể implement logic lấy từ database
            return {
                targetDate: targetDate,
                message: 'Probability statistics service is working',
                calculatedAt: new Date()
            };
        } catch (error) {
            console.error('❌ Error getting probability statistics:', error);
            throw error;
        }
    }
}

module.exports = ProbabilityStatisticsService;







