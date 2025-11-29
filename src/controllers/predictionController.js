const SpecialDetailedStats = require('../models/stats/specialDetailedStats.model');
const LoGanStats = require('../models/stats/loganStats.model');
const TanSuatLotoStats = require('../models/stats/tanSuatLotoStats.model');
const TanSuatLoCapStats = require('../models/stats/tanSuatLoCapStats.model');
const { findSetsContainingNumber } = require('../utils/specialSets');

/**
 * Dự đoán kết quả dựa trên các thống kê
 * @param {string[]} numbers - Mảng các số 2 chữ số (00-99) cần dự đoán
 * @param {number} days - Số ngày thống kê (30, 60, 90, 365)
 * @param {string} type - Loại dự đoán: 'loto' (2 số cuối tất cả các giải) hoặc 'special' (chỉ giải đặc biệt)
 * @returns {Object} - Kết quả dự đoán với điểm số cho từng số
 */
const predictNumbers = async (req, res) => {
    try {
        const { numbers, days = 365, type = 'special' } = req.body;

        if (!numbers || !Array.isArray(numbers) || numbers.length === 0) {
            return res.status(400).json({ error: 'Mảng numbers là bắt buộc và không được rỗng' });
        }

        if (!['loto', 'special'].includes(type)) {
            return res.status(400).json({ error: 'Type phải là "loto" hoặc "special"' });
        }

        // Validate numbers
        const validNumbers = numbers.filter(num => {
            const numStr = String(num).padStart(2, '0');
            return /^\d{2}$/.test(numStr) && parseInt(numStr) >= 0 && parseInt(numStr) <= 99;
        });

        if (validNumbers.length === 0) {
            return res.status(400).json({ error: 'Không có số hợp lệ trong mảng numbers' });
        }

        // Lấy các thống kê từ database tùy theo loại
        let detailedStats, loGanStats, tanSuatStats, tanSuatLoCapStats;
        
        if (type === 'loto') {
            // Dự đoán Loto: sử dụng thống kê loto (tất cả các giải)
            // Chỉ cần: gan loto, tần suất loto, tần suất lô cặp
            [loGanStats, tanSuatStats, tanSuatLoCapStats] = await Promise.all([
                LoGanStats.findOne({ filterType: days === 60 ? '60' : days === 30 ? '30' : '60' }),
                TanSuatLotoStats.findOne({ days: Number(days) || 30 }),
                TanSuatLoCapStats.findOne({ days: Number(days) || 30 })
            ]);

            if (!tanSuatStats) {
                return res.status(404).json({ error: `Không tìm thấy thống kê tần suất loto cho ${days} ngày. Vui lòng cập nhật thống kê trước.` });
            }
        } else {
            // Dự đoán Đặc biệt: sử dụng thống kê giải đặc biệt
            // Cần: gan đặc biệt, đặc biệt ra nhiều nhất, đầu đặc biệt, đuôi đặc biệt, bộ, chạm, tổng
            [detailedStats, tanSuatStats] = await Promise.all([
                SpecialDetailedStats.findOne({ days: Number(days) }),
                TanSuatLotoStats.findOne({ days: Number(days) || 30 })
            ]);

            if (!detailedStats) {
                return res.status(404).json({ error: `Không tìm thấy thống kê chi tiết cho ${days} ngày. Vui lòng cập nhật thống kê trước.` });
            }
        }

        // Tính điểm cho từng số
        const predictions = validNumbers.map(num => {
            const numStr = String(num).padStart(2, '0');
            const a = parseInt(numStr[0], 10);
            const b = parseInt(numStr[1], 10);
            const sum = (a + b) % 10;
            
            let score = 0;
            const factors = {
                gan: 0,
                hot: 0,
                sum: 0,
                cham: 0,
                bo: 0,
                dau: 0,
                duoi: 0,
                loCap: 0 // Chỉ dùng cho loto
            };

            if (type === 'loto') {
                // Logic dự đoán LOTO (2 số cuối tất cả các giải)
                // CHỈ đối chiếu: gan loto, loto ra nhiều nhất, tần suất lô cặp
                // KHÔNG đối chiếu: chạm, bộ, tổng, đầu, đuôi
                
                // 1. Điểm gan loto từ LoGanStats (lâu chưa ra trong tất cả các giải)
                const loGanItem = loGanStats?.statistics?.find(s => String(s.number).padStart(2, '0') === numStr);
                if (loGanItem) {
                    // Gan càng cao thì điểm càng cao, tối đa 40 điểm
                    factors.gan = Math.min(40, (loGanItem.gapDraws || 0) / 7);
                    score += factors.gan;
                }

                // 2. Điểm tần suất loto (loto ra nhiều nhất) từ TanSuatLotoStats
                const tanSuatItem = tanSuatStats?.statistics?.find(s => s.number === numStr);
                if (tanSuatItem) {
                    // Tần suất càng cao thì điểm càng cao, tối đa 35 điểm
                    factors.hot = Math.min(35, (tanSuatItem.count || 0) * 0.7);
                    score += factors.hot;
                }

                // 3. Điểm tần suất lô cặp từ TanSuatLoCapStats
                // Tìm các cặp số chứa số này (ví dụ: 12 thuộc cặp 12-21, 17-71, 62-26, 67-76)
                if (tanSuatLoCapStats?.statistics) {
                    let loCapScore = 0;
                    // Tìm tất cả các cặp chứa số này
                    tanSuatLoCapStats.statistics.forEach(stat => {
                        if (!stat.pair) return;
                        const [xx, yy] = stat.pair.split('-');
                        if (xx === numStr || yy === numStr) {
                            // Điểm dựa trên tần suất xuất hiện của cặp
                            // Cặp xuất hiện nhiều = số có khả năng cao
                            const pairScore = Math.min(25, (stat.count || 0) * 0.3);
                            loCapScore = Math.max(loCapScore, pairScore);
                        }
                    });
                    // Lưu vào factors.hot (tần suất) hoặc tạo factor mới
                    // Vì đã có factors.hot cho tần suất loto, ta có thể cộng thêm hoặc tạo factor riêng
                    // Tạm thời cộng vào factors.hot hoặc tạo factor mới "loCap"
                    // Để đơn giản, ta sẽ cộng vào score trực tiếp và lưu vào một factor mới
                    factors.loCap = loCapScore;
                    score += loCapScore;
                }

                // KHÔNG tính: tổng, chạm, bộ, đầu, đuôi cho dự đoán loto

            } else {
                // Logic dự đoán ĐẶC BIỆT (chỉ 2 số cuối giải đặc biệt)
                // Đối chiếu: gan đặc biệt, đặc biệt ra nhiều nhất, đầu đặc biệt (gan + ra nhiều), 
                // đuôi đặc biệt (gan + ra nhiều), bộ (gan + ra nhiều), chạm (gan + ra nhiều), tổng (gan + ra nhiều)
                
                // 1. Điểm gan đặc biệt (số lâu chưa ra - càng lâu càng cao điểm)
                const numberGap = detailedStats.numberGaps.find(n => n.number === numStr);
                if (numberGap) {
                    // Gan càng cao (ngày càng nhiều) thì điểm càng cao, tối đa 30 điểm
                    factors.gan = Math.min(30, numberGap.days / 10);
                    score += factors.gan;
                }

                // 2. Điểm đặc biệt ra nhiều nhất (tần suất từ TanSuatLotoStats)
                // Lưu ý: TanSuatLotoStats là tần suất của TẤT CẢ các giải, nhưng ta dùng để tham khảo
                // Trong tương lai có thể có thống kê riêng cho giải đặc biệt
                const tanSuatItem = tanSuatStats?.statistics?.find(s => s.number === numStr);
                if (tanSuatItem) {
                    // Tần suất càng cao thì điểm càng cao, tối đa 25 điểm
                    factors.hot = Math.min(25, (tanSuatItem.count || 0) * 0.5);
                    score += factors.hot;
                }

                // 3. Điểm đầu đặc biệt (gan + ra nhiều)
                const dauGap = detailedStats.dauGaps.find(d => d.digit === a);
                const dauFreq = detailedStats.dauFrequency.find(d => d.digit === a);
                let dauScore = 0;
                if (dauGap) {
                    // Đầu gan càng cao thì điểm càng cao, tối đa 5 điểm
                    dauScore += Math.min(5, dauGap.days / 20);
                }
                if (dauFreq) {
                    // Đầu ra nhiều thì điểm càng cao, tối đa 5 điểm
                    dauScore += Math.min(5, (dauFreq.count || 0) * 0.1);
                }
                factors.dau = dauScore;
                score += dauScore;

                // 4. Điểm đuôi đặc biệt (gan + ra nhiều)
                const duoiGap = detailedStats.duoiGaps.find(d => d.digit === b);
                const duoiFreq = detailedStats.duoiFrequency.find(d => d.digit === b);
                let duoiScore = 0;
                if (duoiGap) {
                    // Đuôi gan càng cao thì điểm càng cao, tối đa 5 điểm
                    duoiScore += Math.min(5, duoiGap.days / 20);
                }
                if (duoiFreq) {
                    // Đuôi ra nhiều thì điểm càng cao, tối đa 5 điểm
                    duoiScore += Math.min(5, (duoiFreq.count || 0) * 0.1);
                }
                factors.duoi = duoiScore;
                score += duoiScore;

                // 5. Điểm bộ (gan + ra nhiều)
                const containingSets = findSetsContainingNumber(numStr);
                let boGapScore = 0;
                let boFreqScore = 0;
                
                containingSets.forEach(setId => {
                    const boGap = detailedStats.boGaps.find(b => b.setId === setId);
                    if (boGap) {
                        // Bộ gan càng cao thì điểm càng cao, tối đa 5 điểm
                        boGapScore = Math.max(boGapScore, Math.min(5, boGap.days / 20));
                    }
                    
                    const boFreq = detailedStats.boFrequency.find(b => b.setId === setId);
                    if (boFreq) {
                        // Bộ ra nhiều thì điểm càng cao, tối đa 5 điểm
                        boFreqScore = Math.max(boFreqScore, Math.min(5, (boFreq.count || 0) * 0.1));
                    }
                });
                
                factors.bo = boGapScore + boFreqScore;
                score += factors.bo;

                // 6. Điểm chạm (gan + ra nhiều)
                const chamGapA = detailedStats.chamGaps.find(c => c.cham === a);
                const chamGapB = detailedStats.chamGaps.find(c => c.cham === b);
                const chamFreqA = detailedStats.chamFrequency?.find(c => c.cham === a);
                const chamFreqB = detailedStats.chamFrequency?.find(c => c.cham === b);
                let chamScore = 0;
                if (chamGapA && chamGapB) {
                    // Chạm gan càng cao thì điểm càng cao, tối đa 5 điểm
                    const avgChamGap = (chamGapA.days + chamGapB.days) / 2;
                    chamScore += Math.min(5, avgChamGap / 20);
                }
                if (chamFreqA && chamFreqB) {
                    // Chạm ra nhiều thì điểm càng cao, tối đa 5 điểm
                    const avgChamFreq = ((chamFreqA.count || 0) + (chamFreqB.count || 0)) / 2;
                    chamScore += Math.min(5, avgChamFreq * 0.05);
                }
                factors.cham = chamScore;
                score += chamScore;

                // 7. Điểm tổng (gan + ra nhiều)
                const sumGap = detailedStats.sumGaps.find(s => s.sum === sum);
                const sumFreq = detailedStats.sumFrequency?.find(s => s.sum === sum);
                let sumScore = 0;
                if (sumGap) {
                    // Tổng gan càng cao thì điểm càng cao, tối đa 7.5 điểm
                    sumScore += Math.min(7.5, sumGap.days / 15);
                }
                if (sumFreq) {
                    // Tổng ra nhiều thì điểm càng cao, tối đa 7.5 điểm
                    sumScore += Math.min(7.5, (sumFreq.count || 0) * 0.15);
                }
                factors.sum = sumScore;
                score += sumScore;
            }

            return {
                number: numStr,
                score: Math.round(score * 100) / 100, // Làm tròn 2 chữ số
                factors,
                rank: 0 // Sẽ được cập nhật sau khi sort
            };
        });

        // Sắp xếp theo điểm giảm dần
        predictions.sort((a, b) => b.score - a.score);
        predictions.forEach((pred, index) => {
            pred.rank = index + 1;
        });

        // Tính toán thống kê tổng quan
        const totalScore = predictions.reduce((sum, p) => sum + p.score, 0);
        const avgScore = totalScore / predictions.length;
        const maxScore = Math.max(...predictions.map(p => p.score));
        const minScore = Math.min(...predictions.map(p => p.score));
        const scoreRange = maxScore - minScore;

        // Phân loại các số theo khả năng xuất hiện
        // Cao nhất: top 33% (điểm cao hơn 2/3 số còn lại)
        // Trung bình: 33% giữa
        // Thấp: 33% cuối (điểm thấp nhất)
        const totalCount = predictions.length;
        const highThreshold = Math.ceil(totalCount * 0.33); // Top 33%
        const mediumThreshold = Math.ceil(totalCount * 0.67); // Top 67% (bao gồm cả high)
        
        // Phân loại dựa trên rank
        const highPredictions = predictions.filter((p, idx) => idx < highThreshold);
        const mediumPredictions = predictions.filter((p, idx) => idx >= highThreshold && idx < mediumThreshold);
        const lowPredictions = predictions.filter((p, idx) => idx >= mediumThreshold);

        // Thêm category vào mỗi prediction
        predictions.forEach((pred, idx) => {
            if (idx < highThreshold) {
                pred.category = 'high'; // Khả năng cao nhất
                pred.categoryLabel = 'Khả năng cao nhất';
            } else if (idx < mediumThreshold) {
                pred.category = 'medium'; // Khả năng trung bình
                pred.categoryLabel = 'Khả năng trung bình';
            } else {
                pred.category = 'low'; // Khả năng thấp
                pred.categoryLabel = 'Khả năng thấp';
            }
        });

        const result = {
            predictions,
            summary: {
                totalNumbers: predictions.length,
                averageScore: Math.round(avgScore * 100) / 100,
                maxScore: Math.round(maxScore * 100) / 100,
                minScore: Math.round(minScore * 100) / 100,
                days: Number(days),
                scoreRange: Math.round(scoreRange * 100) / 100
            },
            categories: {
                high: {
                    count: highPredictions.length,
                    predictions: highPredictions,
                    label: 'Khả năng cao nhất',
                    description: 'Các số có điểm số cao nhất, khả năng xuất hiện cao'
                },
                medium: {
                    count: mediumPredictions.length,
                    predictions: mediumPredictions,
                    label: 'Khả năng trung bình',
                    description: 'Các số có điểm số trung bình, khả năng xuất hiện vừa phải'
                },
                low: {
                    count: lowPredictions.length,
                    predictions: lowPredictions,
                    label: 'Khả năng thấp',
                    description: 'Các số có điểm số thấp nhất, khả năng xuất hiện thấp'
                }
            },
            topPredictions: predictions.slice(0, 10), // Top 10
            metadata: {
                calculatedAt: new Date(),
                type: type,
                statsSource: {
                    detailedStats: detailedStats ? 'available' : 'missing',
                    loGanStats: loGanStats ? 'available' : 'missing',
                    tanSuatStats: tanSuatStats ? 'available' : 'missing',
                    tanSuatLoCapStats: tanSuatLoCapStats ? 'available' : 'missing'
                }
            }
        };

        res.status(200).json(result);
    } catch (error) {
        console.error('Lỗi trong predictNumbers:', error);
        res.status(500).json({ error: `Lỗi máy chủ: ${error.message}` });
    }
};

module.exports = {
    predictNumbers
};

