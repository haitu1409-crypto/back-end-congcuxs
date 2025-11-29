/**
 * Position Soi Cau Controller
 * Controller cho thuật toán soi cầu dựa trên vị trí số
 */

const positionAnalyzer = require('../services/positionAnalyzerDB.service');
const PositionSoiCauResult = require('../models/positionSoiCauResult.model');

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

        // Kiểm tra xem đã có dữ liệu được tính cho ngày & biên độ này chưa
        const cachedResult = await PositionSoiCauResult.findOne({
            analysisDate: formattedDate,
            analysisDays: numDays
        });

        if (cachedResult?.data) {
            console.log(`♻️ Trả về dữ liệu soi cầu vị trí từ cache DB cho ${formattedDate} (${numDays} ngày)`);
            return res.status(200).json(cachedResult.data);
        }

        console.log(`🎯 Bắt đầu soi cầu vị trí cho ngày ${formattedDate}, ${numDays} ngày`);

        // Gọi thuật toán phân tích vị trí
        const result = await positionAnalyzer.analyzePositionSoiCau(formattedDate, numDays);

        console.log(`✅ Hoàn thành soi cầu vị trí: ${result.predictions.length} dự đoán`);

        const cacheData = structuredClone ? structuredClone(result) : JSON.parse(JSON.stringify(result));
        delete cacheData.detailedAnalysis;
        delete cacheData.patterns;
        delete cacheData.consistentPatterns;

        // Lưu kết quả vào database để tái sử dụng
        await PositionSoiCauResult.findOneAndUpdate(
            {
                analysisDate: formattedDate,
                analysisDays: numDays
            },
            {
                analysisDate: formattedDate,
                analysisDateObj: parsedDate,
                analysisDays: numDays,
                mode: 'special',
                data: cacheData,
                lastCalculatedAt: new Date()
            },
            {
                upsert: true,
                new: true,
                setDefaultsOnInsert: true
            }
        );

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

/**
 * Lấy lịch sử dự đoán soi cầu vị trí
 */
const getPositionSoiCauHistory = async (req, res) => {
    try {
        const { limit = 30, days = 2 } = req.query;
        const numLimit = parseInt(limit);
        const numDays = parseInt(days);

        if (numLimit < 1 || numLimit > 100) {
            return res.status(400).json({
                error: 'Limit phải từ 1 đến 100'
            });
        }

        if (numDays < 2 || numDays > 30) {
            return res.status(400).json({
                error: 'Số ngày phân tích phải từ 2 đến 30'
            });
        }

        // Lấy lịch sử dự đoán gần nhất
        // Lấy tất cả bản ghi trước (không limit ngay), sau đó filter và lấy tối đa có thể
        console.log(`🔍 [Lịch sử] Tìm kiếm với mode=special, yêu cầu limit=${numLimit}`);
        const allHistory = await PositionSoiCauResult.find({
            mode: 'special'
        })
            .sort({ analysisDateObj: -1 })
            .lean();
        
        console.log(`📊 [Lịch sử] Tìm thấy ${allHistory.length} bản ghi tổng cộng`);
        
        // Ưu tiên lấy các bản ghi có analysisDays khớp
        let filteredHistory = [];
        if (allHistory.length > 0) {
            const matchingDays = allHistory.filter(h => h.analysisDays === numDays);
            if (matchingDays.length > 0) {
                // Nếu có bản ghi khớp, lấy tất cả (không giới hạn numLimit nếu ít hơn)
                filteredHistory = matchingDays;
                console.log(`✅ [Lịch sử] Ưu tiên lấy ${filteredHistory.length} bản ghi với analysisDays=${numDays} (tất cả có sẵn)`);
            } else {
                // Nếu không có bản ghi khớp, lấy tất cả các bản ghi có sẵn
                filteredHistory = allHistory;
                console.log(`⚠️ [Lịch sử] Không có bản ghi nào với analysisDays=${numDays}, lấy tất cả ${filteredHistory.length} bản ghi có sẵn`);
            }
        }
        
        // Giới hạn tối đa numLimit, nhưng nếu ít hơn thì lấy tất cả có sẵn
        const finalHistory = filteredHistory.slice(0, Math.min(numLimit, filteredHistory.length));
        console.log(`✅ [Lịch sử] Sử dụng ${finalHistory.length} bản ghi (yêu cầu: ${numLimit}, có sẵn: ${filteredHistory.length})`);

        // Lấy kết quả xổ số để đối chiếu
        const XSMB = require('../models/xsmb.model');
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const historyWithResults = await Promise.all(
            finalHistory.map(async (record) => {
                const analysisDate = new Date(record.analysisDateObj);
                analysisDate.setHours(0, 0, 0, 0);

                // Lấy kết quả xổ số của ngày được dự đoán
                const result = await XSMB.findByDate(analysisDate);
                
                let actualResult = '--';
                let resultClass = 'waiting';
                let matchedNumbers = [];

                // Lấy danh sách dự đoán và loại bỏ trùng
                const predictions = record.data?.predictions || [];
                const predictionsList = predictions
                    .map(p => {
                        const num = p.predictedNumber || p.number || p.value || '';
                        if (!num) return null;
                        const numStr = num.toString().trim();
                        if (!numStr || numStr === 'N/A' || numStr === 'undefined' || numStr === 'null') return null;
                        return numStr.padStart(2, '0');
                    })
                    .filter(p => p && p.length === 2 && /^\d{2}$/.test(p));
                
                // Loại bỏ trùng - chỉ hiển thị các số unique
                const uniquePredictions = [...new Set(predictionsList)];
                const uniquePredictionsCount = uniquePredictions.length;
                const predictionsString = uniquePredictions.sort((a, b) => parseInt(a) - parseInt(b)).join(', ');

                // Lấy 2 số cuối giải đặc biệt
                let specialPrizeLastTwo = null;
                if (result && result.specialPrize && Array.isArray(result.specialPrize) && result.specialPrize.length > 0) {
                    const specialPrize = result.specialPrize[0].toString().trim();
                    if (specialPrize && specialPrize.length >= 2 && specialPrize !== '...' && specialPrize !== '****') {
                        specialPrizeLastTwo = specialPrize.slice(-2);
                    }
                }

                // Kiểm tra xem có kết quả xổ số không
                if (result && specialPrizeLastTwo) {
                    // Kiểm tra xem số dự đoán có trùng với 2 số cuối giải đặc biệt không
                    if (uniquePredictions.includes(specialPrizeLastTwo)) {
                        resultClass = 'hit';
                        matchedNumbers = [specialPrizeLastTwo];
                        actualResult = `Trúng: ${specialPrizeLastTwo} | Tất cả: ${uniquePredictionsCount} số | Trúng 1/${uniquePredictionsCount}`;
                    } else {
                        resultClass = 'miss';
                        actualResult = `${predictionsString} | Trúng 0/${uniquePredictionsCount}`;
                    }
                }

                return {
                    date: record.analysisDate,
                    analysisDays: record.analysisDays,
                    predictionsCount: uniquePredictionsCount,
                    predictions: predictionsString,
                    actualResult,
                    resultClass,
                    matchedNumbers,
                    specialPrizeLastTwo,
                    totalPredictions: predictions.length
                };
            })
        );

        res.status(200).json({
            success: true,
            data: {
                history: historyWithResults,
                total: historyWithResults.length
            }
        });

    } catch (error) {
        console.error('❌ Lỗi trong getPositionSoiCauHistory:', error.message);
        res.status(500).json({
            success: false,
            error: `Lỗi server: ${error.message}`
        });
    }
};

/**
 * Kiểm tra và cập nhật soi cầu vị trí (special)
 * Kiểm tra kết quả ngày hiện tại, nếu đã có thì tính ToMo
 */
const checkAndUpdatePositionSoiCau = async (req, res) => {
    try {
        const XSMB = require('../models/xsmb.model');
        const requestedDays = parseInt(req.query.days) || 2;
        const numDays = Math.min(Math.max(requestedDays, 2), 30);

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const todayResult = await XSMB.findByDate(today);
        if (!todayResult || !todayResult.isComplete) {
            return res.status(200).json({
                success: false,
                message: `Kết quả xổ số ngày ${formatDate(today)} chưa có hoặc chưa đầy đủ`,
                todayDate: formatDate(today),
                hasResult: false,
                mode: 'special'
            });
        }

        console.log(`✅ [Special cập nhật] Đã có kết quả xổ số ngày ${formatDate(today)}`);

        const targetDate = new Date(today);
        targetDate.setDate(targetDate.getDate() + 1);
        const targetFormatted = formatDate(targetDate);

        const existingPrediction = await PositionSoiCauResult.findOne({
            analysisDate: targetFormatted,
            analysisDays: numDays
        });

        if (existingPrediction?.data) {
            console.log(`♻️ [Special cập nhật] Đã có dữ liệu cho ${targetFormatted}`);
            return res.status(200).json({
                success: true,
                message: `Đã có soi cầu cho ngày ${targetFormatted}`,
                todayDate: formatDate(today),
                tomorrowDate: targetFormatted,
                hasResult: true,
                alreadyExists: true,
                prediction: existingPrediction.data,
                mode: 'special'
            });
        }

        console.log(`🎯 [Special cập nhật] Bắt đầu tính toán cho ${targetFormatted} (${numDays} ngày)`);
        const result = await positionAnalyzer.analyzePositionSoiCau(targetFormatted, numDays);
        console.log(`✅ [Special cập nhật] Hoàn thành với ${result.predictions?.length || 0} dự đoán`);

        const cacheData = structuredClone ? structuredClone(result) : JSON.parse(JSON.stringify(result));
        delete cacheData.detailedAnalysis;
        delete cacheData.patterns;
        delete cacheData.consistentPatterns;

        await PositionSoiCauResult.findOneAndUpdate(
            {
                analysisDate: targetFormatted,
                analysisDays: numDays
            },
            {
                analysisDate: targetFormatted,
                analysisDateObj: targetDate,
                analysisDays: numDays,
                mode: 'special',
                data: cacheData,
                lastCalculatedAt: new Date()
            },
            {
                upsert: true,
                new: true,
                setDefaultsOnInsert: true
            }
        );

        return res.status(200).json({
            success: true,
            message: `Đã cập nhật soi cầu cho ngày ${targetFormatted}`,
            todayDate: formatDate(today),
            tomorrowDate: targetFormatted,
            hasResult: true,
            alreadyExists: false,
            prediction: result,
            predictionsCount: result.predictions?.length || 0,
            mode: 'special'
        });
    } catch (error) {
        console.error('❌ Lỗi trong checkAndUpdatePositionSoiCau:', error.message);
        res.status(500).json({
            success: false,
            error: `Lỗi server: ${error.message}`,
            message: 'Không thể cập nhật soi cầu vị trí',
            mode: 'special'
        });
    }
};

module.exports = {
    getPositionSoiCau,
    getPositionSoiCauRange,
    getPositionPatternStats,
    getPositionSoiCauHistory,
    checkAndUpdatePositionSoiCau
};
