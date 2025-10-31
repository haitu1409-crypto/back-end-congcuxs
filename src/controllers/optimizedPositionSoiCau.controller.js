/**
 * Optimized Position Soi Cau Controller
 * Controller tối ưu hóa với caching, rate limiting và performance monitoring
 */

const optimizedPositionAnalyzer = require('../services/optimizedPositionAnalyzer.service');
const advancedCache = require('../utils/advancedCache');
const databaseOptimizer = require('../utils/databaseOptimizer');

// Performance monitoring
const performanceMonitor = {
    requestCount: 0,
    totalResponseTime: 0,
    cacheHits: 0,
    cacheMisses: 0,
    errors: 0
};

/**
 * Format date to DD/MM/YYYY
 */
const formatDate = (date) => {
    const d = new Date(date);
    const day = d.getDate().toString().padStart(2, '0');
    const month = (d.getMonth() + 1).toString().padStart(2, '0');
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
};

/**
 * Parse date from DD/MM/YYYY or DD-MM-YYYY
 */
const parseDate = (dateStr) => {
    let normalizedStr = dateStr;
    if (dateStr.includes('-')) {
        normalizedStr = dateStr.replace(/-/g, '/');
    }
    if (!normalizedStr || !/^\d{2}\/\d{2}\/\d{4}$/.test(normalizedStr)) {
        throw new Error('Định dạng ngày không hợp lệ. Vui lòng sử dụng DD/MM/YYYY hoặc DD-MM-YYYY.');
    }
    const [day, month, year] = normalizedStr.split('/').map(Number);
    if (day < 1 || day > 31 || month < 1 || month > 12 || year < 2000 || year > new Date().getFullYear()) {
        throw new Error('Ngày, tháng hoặc năm không hợp lệ.');
    }
    return new Date(year, month - 1, day);
};

/**
 * Performance monitoring middleware
 */
const monitorPerformance = (req, res, next) => {
    const startTime = Date.now();

    res.on('finish', () => {
        const responseTime = Date.now() - startTime;
        performanceMonitor.requestCount++;
        performanceMonitor.totalResponseTime += responseTime;

        if (res.statusCode >= 400) {
            performanceMonitor.errors++;
        }

        console.log(`📊 Request ${req.method} ${req.path} - ${responseTime}ms - ${res.statusCode}`);
    });

    next();
};

/**
 * Optimized soi cầu dựa trên vị trí số
 */
const getOptimizedPositionSoiCau = async (req, res) => {
    const startTime = Date.now();

    try {
        const { date, days } = req.query;

        // Validate parameters
        if (!date) {
            return res.status(400).json({
                error: 'Vui lòng cung cấp tham số date (DD/MM/YYYY)',
                success: false
            });
        }

        const numDays = parseInt(days) || 2;
        if (numDays < 2 || numDays > 30) {
            return res.status(400).json({
                error: 'Số ngày phân tích phải từ 2 đến 30 ngày',
                success: false
            });
        }

        // Parse và validate ngày
        const parsedDate = parseDate(date);
        const formattedDate = formatDate(parsedDate);

        console.log(`🎯 Optimized position analysis for ${formattedDate}, ${numDays} days`);

        // Kiểm tra cache trước
        const cacheKey = advancedCache.createSmartKey('optimized-position-soicau', {
            date: formattedDate,
            days: numDays
        });

        let result = advancedCache.get(cacheKey, 'main');

        if (result) {
            performanceMonitor.cacheHits++;
            console.log(`✅ Cache hit for ${cacheKey}`);
        } else {
            performanceMonitor.cacheMisses++;

            // Gọi thuật toán tối ưu hóa
            result = await optimizedPositionAnalyzer.analyzePositionSoiCauOptimized(formattedDate, numDays);

            // Cache kết quả
            advancedCache.set(cacheKey, result, null, 'main');
            console.log(`💾 Cached result for ${cacheKey}`);
        }

        const responseTime = Date.now() - startTime;
        console.log(`✅ Optimized analysis completed in ${responseTime}ms: ${result.predictions.length} predictions`);

        // Thêm performance metrics vào response
        result.performance = {
            responseTime,
            cacheHit: !!advancedCache.get(cacheKey, 'main'),
            optimized: true,
            timestamp: new Date().toISOString()
        };

        res.status(200).json({
            success: true,
            data: result
        });

    } catch (error) {
        performanceMonitor.errors++;
        console.error('❌ Error in getOptimizedPositionSoiCau:', error.message);

        const errorResponse = {
            success: false,
            error: error.message,
            timestamp: new Date().toISOString()
        };

        if (error.message.includes('không hợp lệ') || error.message.includes('Không đủ dữ liệu')) {
            res.status(400).json({
                ...errorResponse,
                suggestedDate: formatDate(new Date())
            });
        } else {
            res.status(500).json(errorResponse);
        }
    }
};

/**
 * Optimized soi cầu vị trí với nhiều ngày
 */
const getOptimizedPositionSoiCauRange = async (req, res) => {
    const startTime = Date.now();

    try {
        const { startDate, endDate, days } = req.query;

        if (!startDate || !endDate || !days) {
            return res.status(400).json({
                error: 'Vui lòng cung cấp startDate, endDate và days',
                success: false
            });
        }

        const numDays = parseInt(days);
        if (numDays < 2 || numDays > 30) {
            return res.status(400).json({
                error: 'Số ngày phân tích phải từ 2 đến 30 ngày',
                success: false
            });
        }

        const parsedStartDate = parseDate(startDate);
        const parsedEndDate = parseDate(endDate);

        if (parsedStartDate > parsedEndDate) {
            return res.status(400).json({
                error: 'startDate phải nhỏ hơn hoặc bằng endDate',
                success: false
            });
        }

        const maxDays = 7;
        const diffDays = Math.ceil((parsedEndDate - parsedStartDate) / (1000 * 60 * 60 * 24));
        if (diffDays > maxDays) {
            return res.status(400).json({
                error: `Khoảng thời gian không được vượt quá ${maxDays} ngày`,
                success: false
            });
        }

        // Kiểm tra cache cho range
        const rangeCacheKey = advancedCache.createSmartKey('optimized-position-range', {
            startDate,
            endDate,
            days: numDays
        });

        let results = advancedCache.get(rangeCacheKey, 'main');

        if (!results) {
            results = [];
            let currentDate = new Date(parsedStartDate);

            // Batch processing với Promise.all để tối ưu hóa
            const datePromises = [];
            const dates = [];

            while (currentDate <= parsedEndDate) {
                const formattedDate = formatDate(currentDate);
                dates.push(formattedDate);
                datePromises.push(
                    optimizedPositionAnalyzer.analyzePositionSoiCauOptimized(formattedDate, numDays)
                        .catch(err => {
                            console.warn(`⚠️ Analysis failed for ${formattedDate}:`, err.message);
                            return null;
                        })
                );
                currentDate.setDate(currentDate.getDate() + 1);
            }

            const analysisResults = await Promise.all(datePromises);

            // Combine results
            analysisResults.forEach((result, index) => {
                if (result) {
                    results.push({
                        date: dates[index],
                        ...result
                    });
                }
            });

            // Cache range results
            advancedCache.set(rangeCacheKey, results, null, 'main');
        }

        if (results.length === 0) {
            return res.status(404).json({
                error: `Không tìm thấy dữ liệu soi cầu từ ${startDate} đến ${endDate}`,
                success: false
            });
        }

        const responseTime = Date.now() - startTime;
        console.log(`✅ Optimized range analysis completed in ${responseTime}ms: ${results.length} days`);

        const response = {
            success: true,
            data: {
                range: {
                    startDate,
                    endDate,
                    analysisDays: numDays,
                    totalDays: results.length
                },
                results,
                performance: {
                    responseTime,
                    optimized: true,
                    timestamp: new Date().toISOString()
                }
            }
        };

        res.status(200).json(response);

    } catch (error) {
        performanceMonitor.errors++;
        console.error('❌ Error in getOptimizedPositionSoiCauRange:', error.message);

        res.status(500).json({
            success: false,
            error: `Lỗi server: ${error.message}`,
            timestamp: new Date().toISOString()
        });
    }
};

/**
 * Optimized thống kê pattern vị trí
 */
const getOptimizedPositionPatternStats = async (req, res) => {
    const startTime = Date.now();

    try {
        const { days = 7 } = req.query;
        const numDays = parseInt(days);

        if (numDays < 2 || numDays > 30) {
            return res.status(400).json({
                error: 'Số ngày phải từ 2 đến 30',
                success: false
            });
        }

        // Kiểm tra cache cho stats
        const statsCacheKey = advancedCache.createSmartKey('optimized-position-stats', {
            days: numDays
        });

        let stats = advancedCache.get(statsCacheKey, 'stats');

        if (!stats) {
            const currentDate = new Date();
            const endOfDay = new Date(currentDate);
            endOfDay.setHours(23, 59, 59, 999);
            const startOfPeriod = new Date(endOfDay);
            startOfPeriod.setDate(startOfPeriod.getDate() - numDays);
            startOfPeriod.setHours(0, 0, 0, 0);

            // Sử dụng optimized query
            const XSMB = require('../models/xsmb.model');
            const results = await databaseOptimizer.optimizeQuery(
                XSMB.find({
                    drawDate: { $gte: startOfPeriod, $lte: endOfDay },
                    station: 'xsmb'
                }),
                'drawDate specialPrize firstPrize secondPrize threePrizes fourPrizes fivePrizes sixPrizes sevenPrizes'
            ).sort({ drawDate: -1 });

            if (results.length < 2) {
                return res.status(404).json({
                    error: `Không đủ dữ liệu cho ${numDays} ngày`,
                    success: false
                });
            }

            // Phân tích pattern với optimized algorithms
            const patterns = optimizedPositionAnalyzer.findPositionPatternsOptimized(results, numDays);
            const consistentPatterns = optimizedPositionAnalyzer.validateConsistentPatternsOptimized(patterns);

            stats = {
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

            // Cache stats
            advancedCache.set(statsCacheKey, stats, null, 'stats');
        }

        const responseTime = Date.now() - startTime;
        console.log(`✅ Optimized stats completed in ${responseTime}ms`);

        res.status(200).json({
            success: true,
            data: {
                ...stats,
                performance: {
                    responseTime,
                    optimized: true,
                    timestamp: new Date().toISOString()
                }
            }
        });

    } catch (error) {
        performanceMonitor.errors++;
        console.error('❌ Error in getOptimizedPositionPatternStats:', error.message);

        res.status(500).json({
            success: false,
            error: `Lỗi server: ${error.message}`,
            timestamp: new Date().toISOString()
        });
    }
};

/**
 * Performance metrics endpoint
 */
const getPerformanceMetrics = (req, res) => {
    const avgResponseTime = performanceMonitor.requestCount > 0
        ? Math.round(performanceMonitor.totalResponseTime / performanceMonitor.requestCount)
        : 0;

    const cacheHitRate = (performanceMonitor.cacheHits + performanceMonitor.cacheMisses) > 0
        ? Math.round((performanceMonitor.cacheHits / (performanceMonitor.cacheHits + performanceMonitor.cacheMisses)) * 100)
        : 0;

    const errorRate = performanceMonitor.requestCount > 0
        ? Math.round((performanceMonitor.errors / performanceMonitor.requestCount) * 100)
        : 0;

    res.status(200).json({
        success: true,
        data: {
            performance: {
                totalRequests: performanceMonitor.requestCount,
                averageResponseTime: avgResponseTime,
                cacheHitRate,
                errorRate,
                cacheHits: performanceMonitor.cacheHits,
                cacheMisses: performanceMonitor.cacheMisses,
                errors: performanceMonitor.errors
            },
            cache: advancedCache.getHealthStatus(),
            database: databaseOptimizer.healthCheck(),
            timestamp: new Date().toISOString()
        }
    });
};

/**
 * Health check endpoint
 */
const healthCheck = (req, res) => {
    const dbHealth = databaseOptimizer.healthCheck();
    const cacheHealth = advancedCache.getHealthStatus();

    const isHealthy = dbHealth.isConnected && cacheHealth.main.keys >= 0;

    res.status(isHealthy ? 200 : 503).json({
        status: isHealthy ? 'OK' : 'UNHEALTHY',
        service: 'Optimized Position Soi Cau API',
        version: '2.0.0',
        timestamp: new Date().toISOString(),
        database: dbHealth,
        cache: cacheHealth,
        endpoints: {
            main: '/api/optimized-position-soicau',
            range: '/api/optimized-position-soicau/range',
            stats: '/api/optimized-position-soicau/stats',
            metrics: '/api/optimized-position-soicau/metrics'
        }
    });
};

module.exports = {
    getOptimizedPositionSoiCau,
    getOptimizedPositionSoiCauRange,
    getOptimizedPositionPatternStats,
    getPerformanceMetrics,
    healthCheck,
    monitorPerformance
};
