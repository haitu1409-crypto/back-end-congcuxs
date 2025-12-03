/**
 * Position Soi Cau Controller
 * Controller cho thuật toán soi cầu dựa trên vị trí số
 */

const positionAnalyzer = require('../services/positionAnalyzerLoto.service');
const PositionSoiCauLotoResult = require('../models/positionSoiCauLotoResult.model');

// ✅ GIAI ĐOẠN 1: Request Deduplication Map
// Tránh tính toán trùng lặp khi nhiều users cùng request
const pendingRequests = new Map();

// ✅ GIAI ĐOẠN 1: Redis Client (nếu có)
let redisClient = null;
try {
    if (process.env.REDIS_URL) {
        const redis = require('redis');
        redisClient = redis.createClient({
            url: process.env.REDIS_URL,
            socket: {
                reconnectStrategy: (retries) => retries > 3 ? false : retries * 100,
                connectTimeout: 2000
            }
        });
        redisClient.on('error', (err) => console.warn('⚠️ Redis error:', err.message));
        redisClient.connect().catch(() => console.warn('⚠️ Redis not available, using DB cache only'));
    }
} catch (error) {
    console.warn('⚠️ Redis setup failed, using DB cache only');
}

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
 * Soi cầu lô tô dựa trên vị trí số
 */
const getPositionSoiCauLoto = async (req, res) => {
    let numDays;
    try {
        const { date, days } = req.query;

        // Validate parameters
        if (!date) {
            return res.status(400).json({
                error: 'Vui lòng cung cấp tham số date (DD/MM/YYYY)'
            });
        }

        numDays = parseInt(days) || 4;
        if (numDays < 2 || numDays > 30) {
            return res.status(400).json({
                error: 'Số ngày phân tích phải từ 2 đến 30 ngày'
            });
        }

        // Parse và validate ngày
        const parsedDate = parseDate(date);
        const formattedDate = formatDate(parsedDate);

        // ✅ GIAI ĐOẠN 1.1: Check Redis Cache TRƯỚC (nếu có)
        const redisKey = `soicau:loto:${formattedDate}:${numDays}`;
        if (redisClient && redisClient.isOpen) {
            try {
                const redisCached = await redisClient.get(redisKey);
                if (redisCached) {
                    console.log(`⚡ [Redis Cache Hit] ${formattedDate} (${numDays} ngày)`);
                    return res.status(200).json(JSON.parse(redisCached));
                }
            } catch (redisError) {
                console.warn('⚠️ Redis get error:', redisError.message);
            }
        }

        // ✅ Check MongoDB Cache
        const cachedResult = await PositionSoiCauLotoResult.findOne({
            analysisDate: formattedDate,
            analysisDays: numDays
        });

        if (cachedResult?.data) {
            console.log(`♻️ [DB Cache Hit] ${formattedDate} (${numDays} ngày)`);
            
            // ✅ GIAI ĐOẠN 1.1: Lưu vào Redis với TTL 10 phút (nếu có)
            if (redisClient && redisClient.isOpen) {
                try {
                    await redisClient.setEx(redisKey, 600, JSON.stringify(cachedResult.data));
                    console.log(`💾 [Redis] Đã cache kết quả cho ${formattedDate}`);
                } catch (redisError) {
                    console.warn('⚠️ Redis set error:', redisError.message);
                }
            }
            
            return res.status(200).json(cachedResult.data);
        }

        // ✅ GIAI ĐOẠN 1.2: Request Deduplication
        const dedupeKey = `${formattedDate}:${numDays}`;
        
        if (pendingRequests.has(dedupeKey)) {
            console.log(`⏳ [Deduplication] Đợi kết quả từ request khác: ${dedupeKey}`);
            try {
                const result = await pendingRequests.get(dedupeKey);
                return res.status(200).json(result);
            } catch (error) {
                // Nếu request trước lỗi, tiếp tục tính toán mới
                console.warn(`⚠️ [Deduplication] Request trước bị lỗi, tính lại`);
            }
        }

        console.log(`🎯 [Lô tô] Bắt đầu soi cầu vị trí cho ngày ${formattedDate}, ${numDays} ngày`);

        // ✅ Tạo promise để deduplicate
        const calculationPromise = (async () => {
            try {
                // Gọi thuật toán phân tích vị trí cho toàn bộ giải (lô tô)
                const result = await positionAnalyzer.analyzePositionSoiCau(formattedDate, numDays, {
                    mode: 'loto'
                });

                console.log(`✅ [Lô tô] Hoàn thành soi cầu vị trí: ${result.predictions.length} dự đoán`);

                const cacheData = structuredClone ? structuredClone(result) : JSON.parse(JSON.stringify(result));
                delete cacheData.detailedAnalysis;
                delete cacheData.patterns;
                delete cacheData.consistentPatterns;

                // Lưu vào MongoDB
                await PositionSoiCauLotoResult.findOneAndUpdate(
                    {
                        analysisDate: formattedDate,
                        analysisDays: numDays
                    },
                    {
                        analysisDate: formattedDate,
                        analysisDateObj: parsedDate,
                        analysisDays: numDays,
                        mode: 'loto',
                        data: cacheData,
                        lastCalculatedAt: new Date()
                    },
                    {
                        upsert: true,
                        new: true,
                        setDefaultsOnInsert: true
                    }
                );

                // ✅ GIAI ĐOẠN 1.1: Lưu vào Redis (nếu có)
                if (redisClient && redisClient.isOpen) {
                    try {
                        await redisClient.setEx(redisKey, 600, JSON.stringify(result));
                        console.log(`💾 [Redis] Đã cache kết quả mới cho ${formattedDate}`);
                    } catch (redisError) {
                        console.warn('⚠️ Redis set error:', redisError.message);
                    }
                }

                return result;
            } finally {
                // ✅ GIAI ĐOẠN 1.2: Xóa khỏi pending requests
                pendingRequests.delete(dedupeKey);
            }
        })();

        // Lưu vào pending map
        pendingRequests.set(dedupeKey, calculationPromise);
        
        const result = await calculationPromise;
        res.status(200).json(result);

    } catch (error) {
        console.error('❌ Lỗi trong getPositionSoiCauLoto:', error.message);

        const normalizedMessage = (error.message || '').toLowerCase();
        const isInvalidDateError = normalizedMessage.includes('không hợp lệ');
        const isNotEnoughDataError = normalizedMessage.includes('không đủ dữ liệu');
        const isOffsetRangeError = normalizedMessage.includes('the value of \"offset\" is out of range');

        if (isInvalidDateError || isNotEnoughDataError || isOffsetRangeError) {
            res.status(400).json({
                error: isOffsetRangeError
                    ? `Không đủ dữ liệu lịch sử để phân tích ${numDays} ngày. Vui lòng chọn ít ngày hơn hoặc ngày gần hiện tại hơn.`
                    : error.message,
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
 * Soi cầu lô tô vị trí với nhiều ngày
 */
const getPositionSoiCauRangeLoto = async (req, res) => {
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
        console.error('❌ Lỗi trong getPositionSoiCauRangeLoto:', error.message);

        if (error.message.includes('không hợp lệ')) {
            res.status(400).json({ error: error.message });
        } else {
            res.status(500).json({ error: `Lỗi server: ${error.message}` });
        }
    }
};

/**
 * Lấy thống kê pattern vị trí cho lô tô
 */
const getPositionPatternStatsLoto = async (req, res) => {
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
        console.error('❌ Lỗi trong getPositionPatternStatsLoto:', error.message);
        res.status(500).json({ error: `Lỗi server: ${error.message}` });
    }
};

/**
 * Wrapper với timeout để tránh memory crash
 */
const withTimeout = (promise, timeoutMs, errorMessage = 'Operation timeout') => {
    return Promise.race([
        promise,
        new Promise((_, reject) => 
            setTimeout(() => reject(new Error(errorMessage)), timeoutMs)
        )
    ]);
};

/**
 * Kiểm tra và cập nhật soi cầu tự động
 * Kiểm tra xem kết quả xổ số hôm nay đã có chưa, nếu có thì tính toán soi cầu cho ngày mai
 * Thêm timeout và error handling để tránh memory crash
 */
const checkAndUpdateSoiCau = async (req, res) => {
    const TIMEOUT_MS = 120000; // 2 phút timeout để tránh memory crash
    const startTime = Date.now();
    
    try {
        const XSMB = require('../models/xsmb.model');
        const numDays = parseInt(req.query.days) || 4;

        // Validate numDays để tránh quá tải
        if (numDays > 10) {
            return res.status(400).json({
                success: false,
                error: 'Số ngày phân tích không được vượt quá 10 để tránh quá tải bộ nhớ',
                message: 'Vui lòng chọn số ngày nhỏ hơn hoặc bằng 10'
            });
        }

        // Lấy ngày hôm nay
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        // Kiểm tra xem kết quả xổ số hôm nay đã có chưa
        const todayResult = await XSMB.findByDate(today);

        if (!todayResult || !todayResult.isComplete) {
            return res.status(200).json({
                success: false,
                message: `Kết quả xổ số ngày ${formatDate(today)} chưa có hoặc chưa đầy đủ`,
                todayDate: formatDate(today),
                hasResult: false
            });
        }

        console.log(`✅ [Cập nhật] Đã tìm thấy kết quả xổ số ngày ${formatDate(today)}`);

        // Tính ngày mai
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowFormatted = formatDate(tomorrow);

        // Kiểm tra xem đã có soi cầu cho ngày mai chưa
        const existingPrediction = await PositionSoiCauLotoResult.findOne({
            analysisDate: tomorrowFormatted,
            analysisDays: numDays
        });

        if (existingPrediction?.data) {
            console.log(`♻️ [Cập nhật] Đã có soi cầu cho ngày ${tomorrowFormatted}`);
            return res.status(200).json({
                success: true,
                message: `Đã có soi cầu cho ngày ${tomorrowFormatted}`,
                todayDate: formatDate(today),
                tomorrowDate: tomorrowFormatted,
                hasResult: true,
                alreadyExists: true,
                prediction: existingPrediction.data
            });
        }

        // Tính toán soi cầu cho ngày mai với timeout
        console.log(`🎯 [Cập nhật] Bắt đầu tính toán soi cầu cho ngày ${tomorrowFormatted}, ${numDays} ngày (timeout: ${TIMEOUT_MS}ms)`);

        try {
            const result = await withTimeout(
                positionAnalyzer.analyzePositionSoiCau(tomorrowFormatted, numDays, {
                    mode: 'loto'
                }),
                TIMEOUT_MS,
                `Tính toán soi cầu vượt quá thời gian cho phép (${TIMEOUT_MS}ms). Có thể do dữ liệu quá lớn hoặc server quá tải.`
            );

            const elapsedTime = Date.now() - startTime;
            console.log(`✅ [Cập nhật] Hoàn thành soi cầu vị trí cho ngày ${tomorrowFormatted}: ${result.predictions.length} dự đoán (${elapsedTime}ms)`);

            // Lưu vào database với error handling
            try {
                const cacheData = structuredClone ? structuredClone(result) : JSON.parse(JSON.stringify(result));
                delete cacheData.detailedAnalysis;
                delete cacheData.patterns;
                delete cacheData.consistentPatterns;

                await PositionSoiCauLotoResult.findOneAndUpdate(
                    {
                        analysisDate: tomorrowFormatted,
                        analysisDays: numDays
                    },
                    {
                        analysisDate: tomorrowFormatted,
                        analysisDateObj: tomorrow,
                        analysisDays: numDays,
                        mode: 'loto',
                        data: cacheData,
                        lastCalculatedAt: new Date()
                    },
                    {
                        upsert: true,
                        new: true,
                        setDefaultsOnInsert: true
                    }
                );
            } catch (dbError) {
                console.error('❌ [Cập nhật] Lỗi khi lưu vào database:', dbError.message);
                // Vẫn trả về kết quả dù lưu DB lỗi
            }

            return res.status(200).json({
                success: true,
                message: `Đã cập nhật soi cầu cho ngày ${tomorrowFormatted}`,
                todayDate: formatDate(today),
                tomorrowDate: tomorrowFormatted,
                hasResult: true,
                alreadyExists: false,
                prediction: result,
                predictionsCount: result.predictions?.length || 0
            });
        } catch (timeoutError) {
            console.error('❌ [Cập nhật] Timeout hoặc lỗi khi tính toán:', timeoutError.message);
            return res.status(500).json({
                success: false,
                error: timeoutError.message || 'Tính toán soi cầu vượt quá thời gian cho phép',
                message: 'Server đang quá tải hoặc dữ liệu quá lớn. Vui lòng thử lại sau hoặc giảm số ngày phân tích.',
                suggestion: 'Thử giảm số ngày phân tích xuống 2-4 ngày'
            });
        }

    } catch (error) {
        const elapsedTime = Date.now() - startTime;
        console.error(`❌ [Cập nhật] Lỗi trong checkAndUpdateSoiCau (${elapsedTime}ms):`, error.message);
        console.error('Stack trace:', error.stack);
        
        // Kiểm tra nếu là memory error
        if (error.message.includes('memory') || error.message.includes('Memory') || error.message.includes('heap')) {
            return res.status(500).json({
                success: false,
                error: 'Server hết bộ nhớ khi xử lý yêu cầu',
                message: 'Dữ liệu quá lớn. Vui lòng thử lại sau hoặc giảm số ngày phân tích.',
                suggestion: 'Thử giảm số ngày phân tích xuống 2-4 ngày'
            });
        }
        
        return res.status(500).json({
            success: false,
            error: `Lỗi server: ${error.message}`,
            message: 'Không thể cập nhật soi cầu tự động'
        });
    }
};

/**
 * Lấy lịch sử dự đoán soi cầu lô tô
 */
const getPositionSoiCauLotoHistory = async (req, res) => {
    try {
        const { limit = 14, days = 4 } = req.query;
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
        // Lấy tất cả các bản ghi với mode='loto', không filter theo analysisDays
        // để đảm bảo có dữ liệu hiển thị (vì có thể có dữ liệu với analysisDays khác)
        console.log(`🔍 [Lịch sử] Tìm kiếm với mode=loto, limit=${numLimit}`);
        const history = await PositionSoiCauLotoResult.find({
            mode: 'loto'
        })
            .sort({ analysisDateObj: -1 })
            .limit(numLimit)
            .lean();
        
        console.log(`📊 [Lịch sử] Tìm thấy ${history.length} bản ghi`);
        
        // Nếu có filter theo analysisDays, ưu tiên lấy các bản ghi có analysisDays khớp
        // nhưng vẫn lấy các bản ghi khác nếu không đủ
        let filteredHistory = history;
        if (history.length > 0) {
            const matchingDays = history.filter(h => h.analysisDays === numDays);
            if (matchingDays.length > 0) {
                // Ưu tiên lấy các bản ghi có analysisDays khớp
                filteredHistory = matchingDays.slice(0, numLimit);
                console.log(`✅ [Lịch sử] Ưu tiên lấy ${filteredHistory.length} bản ghi với analysisDays=${numDays}`);
            } else {
                console.log(`⚠️ [Lịch sử] Không có bản ghi nào với analysisDays=${numDays}, lấy tất cả các bản ghi`);
            }
        }

        // Lấy kết quả xổ số để đối chiếu
        const XSMB = require('../models/xsmb.model');
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const historyWithResults = await Promise.all(
            filteredHistory.map(async (record) => {
                const analysisDate = new Date(record.analysisDateObj);
                analysisDate.setHours(0, 0, 0, 0);

                // Lấy kết quả xổ số của ngày được dự đoán
                const result = await XSMB.findByDate(analysisDate);
                
                // Debug log
                if (!result) {
                    console.log(`⚠️ [Lịch sử] Ngày ${record.analysisDate}: Không tìm thấy kết quả xổ số trong database`);
                } else {
                    console.log(`✅ [Lịch sử] Ngày ${record.analysisDate}: Tìm thấy kết quả xổ số, isComplete=${result.isComplete || false}`);
                }

                let actualResult = '--';
                let resultClass = 'waiting';
                let matchedNumbers = [];

                // Lấy danh sách dự đoán từ các mức lifetime 4-10 lần liên tiếp (bỏ qua 3 lần)
                // Gộp tất cả predictions từ predictionsByLifetime, sau đó loại bỏ trùng
                const predictionsByLifetime = record.data?.predictionsByLifetime || {};
                let allPredictions = [];
                
                // Gộp tất cả predictions từ các mức lifetime (10 -> 4), bỏ qua 3 lần liên tiếp
                for (let lifetime = 10; lifetime >= 4; lifetime--) {
                    const lifetimePredictions = predictionsByLifetime[lifetime] || [];
                    if (lifetimePredictions.length > 0) {
                        // Thêm tất cả predictions của mức này
                        allPredictions = allPredictions.concat(lifetimePredictions);
                    }
                }
                
                // Nếu không có predictionsByLifetime, fallback về predictions cũ
                if (allPredictions.length === 0) {
                    const predictions = record.data?.predictions || [];
                    allPredictions = predictions;
                    
                    // Debug log
                    if (predictions.length === 0) {
                        console.log(`⚠️ [Lịch sử] Ngày ${record.analysisDate}: Không có predictions trong record.data`);
                        console.log(`   - record.data có tồn tại: ${!!record.data}`);
                        console.log(`   - record.data keys: ${record.data ? Object.keys(record.data).join(', ') : 'N/A'}`);
                    }
                }
                
                const predictionsList = allPredictions
                    .map(p => {
                        // Thử nhiều cách để lấy số dự đoán
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

                // Lấy 2 số cuối giải đặc biệt (nếu có)
                let specialPrizeLastTwo = null;
                if (result && result.specialPrize && Array.isArray(result.specialPrize) && result.specialPrize.length > 0) {
                    const specialPrize = result.specialPrize[0].toString().trim();
                    if (specialPrize && specialPrize.length >= 2 && specialPrize !== '...' && specialPrize !== '****') {
                        specialPrizeLastTwo = specialPrize.slice(-2);
                    }
                }

                // Kiểm tra xem có kết quả xổ số không
                // Không cần isComplete, chỉ cần có dữ liệu là đủ
                if (result) {
                    // Lấy tất cả 2 số cuối từ tất cả các giải (lô tô)
                    const allLastTwoDigits = new Set();
                    const prizeFields = [
                        { field: 'specialPrize', isSpecial: true },
                        { field: 'firstPrize' },
                        { field: 'secondPrize' },
                        { field: 'threePrizes' },
                        { field: 'fourPrizes' },
                        { field: 'fivePrizes' },
                        { field: 'sixPrizes' },
                        { field: 'sevenPrizes' }
                    ];

                    prizeFields.forEach(({ field }) => {
                        const prizeData = result[field];
                        if (!prizeData) return;
                        const entries = Array.isArray(prizeData) ? prizeData : [prizeData];
                        entries.forEach(value => {
                            if (!value) return;
                            const valueStr = value.toString().trim();
                            // Bỏ qua các giá trị placeholder như "...", "****"
                            if (valueStr === '...' || valueStr === '****' || valueStr.length < 2) return;
                            const lastTwo = valueStr.slice(-2);
                            if (/^\d{2}$/.test(lastTwo)) {
                                allLastTwoDigits.add(lastTwo);
                            }
                        });
                    });

                    // Nếu có ít nhất một số giải có dữ liệu, thì đối chiếu
                    if (allLastTwoDigits.size > 0) {
                        
                        // Kiểm tra xem có số nào trong dự đoán trùng với bất kỳ 2 số cuối nào không
                        // Sử dụng uniquePredictions để đếm chính xác (không trùng lặp)
                        const matchedSet = new Set(uniquePredictions.filter(predictedNum => allLastTwoDigits.has(predictedNum)));
                        matchedNumbers = Array.from(matchedSet).sort();
                        
                        // Đếm số trúng unique (không trùng lặp)
                        const uniqueMatchedCount = matchedNumbers.length;

                        if (matchedNumbers.length > 0) {
                            resultClass = 'hit';
                            // Hiển thị các số trúng (có thể nhiều số)
                            // Format: "Trúng: 12, 34 | Tất cả: 12, 23, 34, 45... | Trúng X/Y"
                            const allNumbers = Array.from(allLastTwoDigits).sort();
                            actualResult = `Trúng: ${matchedNumbers.sort().join(', ')} | Tất cả: ${allNumbers.join(', ')} | Trúng ${uniqueMatchedCount}/${uniquePredictionsCount}`;
                        } else {
                            resultClass = 'miss';
                            // Hiển thị danh sách tất cả 2 số cuối và tỷ lệ trúng
                            const allNumbers = Array.from(allLastTwoDigits).sort();
                            actualResult = `${allNumbers.join(', ')} | Trúng 0/${uniquePredictionsCount}`;
                        }
                    } else {
                        // Có record nhưng không có dữ liệu giải -> chờ dữ liệu
                        resultClass = 'waiting';
                        actualResult = '--';
                    }
                } else {
                    // Không có kết quả xổ số
                    if (analysisDate > today) {
                        // Ngày tương lai -> chờ kết quả
                        resultClass = 'waiting';
                        actualResult = '--';
                    } else if (analysisDate < today) {
                        // Ngày quá khứ nhưng không có kết quả -> chờ dữ liệu
                        resultClass = 'waiting';
                        actualResult = '--';
                    } else {
                        // Hôm nay -> chờ kết quả
                        resultClass = 'waiting';
                        actualResult = '--';
                    }
                }

                return {
                    date: record.analysisDate,
                    predictions: uniquePredictions.length > 0 ? uniquePredictions.join(', ') : '--',
                    predictionsCount: uniquePredictionsCount, // Số lượng unique predictions (đã bỏ trùng)
                    actualResult,
                    resultClass,
                    matchedNumbers,
                    matchedCount: matchedNumbers.length,
                    specialPrizeLastTwo, // 2 số cuối giải đặc biệt
                    analysisDays: record.analysisDays
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
        console.error('❌ Lỗi trong getPositionSoiCauLotoHistory:', error.message);
        res.status(500).json({
            success: false,
            error: `Lỗi server: ${error.message}`
        });
    }
};

/**
 * Lấy ngày soi cầu mới nhất
 */
const getLatestSoiCauDate = async (req, res) => {
    try {
        const latestResult = await PositionSoiCauLotoResult.findOne({ mode: 'loto' })
            .sort({ analysisDateObj: -1 })
            .select('analysisDate analysisDateObj')
            .lean();

        if (latestResult) {
            return res.json({
                success: true,
                latestDate: latestResult.analysisDate,
                latestDateObj: latestResult.analysisDateObj
            });
        }

        return res.json({
            success: false,
            message: 'Chưa có dữ liệu soi cầu'
        });
    } catch (error) {
        console.error('Error getting latest soi cau date:', error);
        return res.status(500).json({
            success: false,
            error: 'Lỗi khi lấy ngày soi cầu mới nhất'
        });
    }
};

module.exports = {
    getPositionSoiCauLoto,
    getPositionSoiCauRangeLoto,
    getPositionPatternStatsLoto,
    checkAndUpdateSoiCau,
    getPositionSoiCauLotoHistory,
    getLatestSoiCauDate
};
