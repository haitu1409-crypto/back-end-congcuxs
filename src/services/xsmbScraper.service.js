const puppeteer = require('puppeteer');
const XSMB = require('../models/xsmb.model');
const database = require('../config/database');
const lotterySocketService = require('./lotterySocket.service');

// Helper function để delay (thay thế page.waitForTimeout đã deprecated)
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

class XSMBScraperService {
    constructor() {
        this.isRunning = false;
        this.browser = null;
        this.page = null;
    }

    /**
     * Format date to DD-MM-YYYY
     */
    formatDateToDDMMYYYY(date) {
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        return `${day}-${month}-${year}`;
    }

    /**
     * Kiểm tra dữ liệu có đầy đủ không (với stableCounts và completedPrizes)
     */
    isDataComplete(result, completedPrizes, stableCounts) {
        const checkPrize = (key, data, minLength) => {
            const isValid = Array.isArray(data) &&
                data.length >= minLength &&
                data.every(prize => prize && prize !== '...' && !/\*+/.test(prize) && !/\+/.test(prize) && /^\d+$/.test(prize));
            stableCounts[key] = isValid ? (stableCounts[key] || 0) + 1 : 0;
            completedPrizes[key] = isValid && stableCounts[key] >= (key === 'specialPrize' ? 2 : 1);
            return isValid;
        };

        const isValidMaDB = result.maDB &&
            typeof result.maDB === 'string' &&
            result.maDB.trim() !== '' &&
            result.maDB.trim() !== '...' &&
            !/\*+/.test(result.maDB) &&
            !/\+/.test(result.maDB);
        stableCounts.maDB = isValidMaDB ? (stableCounts.maDB || 0) + 1 : 0;
        completedPrizes.maDB = isValidMaDB && stableCounts.maDB >= 1;

        checkPrize('firstPrize', result.firstPrize || [], 1);
        checkPrize('secondPrize', result.secondPrize || [], 2);
        checkPrize('threePrizes', result.threePrizes || [], 6);
        checkPrize('fourPrizes', result.fourPrizes || [], 4);
        checkPrize('fivePrizes', result.fivePrizes || [], 6);
        checkPrize('sixPrizes', result.sixPrizes || [], 3);
        checkPrize('sevenPrizes', result.sevenPrizes || [], 4);
        checkPrize('specialPrize', result.specialPrize || [], 1);

        const isComplete = completedPrizes.maDB &&
            result.tentinh &&
            result.tentinh.length >= 1 &&
            Object.keys(completedPrizes).every(k => completedPrizes[k]);
        if (isComplete) console.log('✅ Dữ liệu hoàn thành');
        return isComplete;
    }

    /**
     * Lưu kết quả vào MongoDB
     */
    async saveToMongoDB(result) {
        try {
            if (database.getConnectionStatus().state !== 'connected') {
                await database.connect();
            }

            const existingResult = await XSMB.findOne({
                drawDate: result.drawDate,
                station: result.station
            }).lean();

            if (existingResult) {
                // Cập nhật nếu có thay đổi
                const existingData = {
                    firstPrize: existingResult.firstPrize,
                    secondPrize: existingResult.secondPrize,
                    threePrizes: existingResult.threePrizes,
                    fourPrizes: existingResult.fourPrizes,
                    fivePrizes: existingResult.fivePrizes,
                    sixPrizes: existingResult.sixPrizes,
                    sevenPrizes: existingResult.sevenPrizes,
                    maDB: existingResult.maDB,
                    specialPrize: existingResult.specialPrize,
                };

                const newData = {
                    firstPrize: result.firstPrize,
                    secondPrize: result.secondPrize,
                    threePrizes: result.threePrizes,
                    fourPrizes: result.fourPrizes,
                    fivePrizes: result.fivePrizes,
                    sixPrizes: result.sixPrizes,
                    sevenPrizes: result.sevenPrizes,
                    maDB: result.maDB,
                    specialPrize: result.specialPrize,
                };

                if (JSON.stringify(existingData) !== JSON.stringify(newData)) {
                    await XSMB.updateOne(
                        { drawDate: result.drawDate, station: result.station },
                        {
                            $set: {
                                ...result,
                                updatedAt: new Date(),
                                scrapedAt: new Date()
                            }
                        },
                        { upsert: true }
                    );
                    console.log(`✅ Cập nhật kết quả ngày ${result.drawDate.toISOString().split('T')[0]} cho ${result.station}`);
                }
            } else {
                await XSMB.create(result);
                console.log(`✅ Lưu kết quả mới ngày ${result.drawDate.toISOString().split('T')[0]} cho ${result.station}`);
            }

            // Cập nhật trạng thái hoàn thành
            const savedResult = await XSMB.findOne({
                drawDate: result.drawDate,
                station: result.station
            });

            if (savedResult) {
                savedResult.updateCompleteness();
                await savedResult.save();
            }

        } catch (error) {
            console.error(`❌ Lỗi khi lưu dữ liệu ngày ${result.drawDate.toISOString().split('T')[0]}:`, error.message);
            throw error;
        }
    }

    /**
     * Cào dữ liệu XSMB cho ngày cụ thể
     */
    async scrapeXSMB(date, station = 'xsmb', isTestMode = false) {
        let browser;
        let page;
        let iteration = 0;
        let successCount = 0;
        let errorCount = 0;
        const startTime = Date.now();
        const pollIntervalMs = isTestMode ? 1000 : 2000;
        const liveWindowMinutes = isTestMode ? 1 : 20; // cần bám toàn bộ khung 18h14-18h34 (~20 phút)
        const maxDuration = liveWindowMinutes * 60 * 1000;
        const maxIterations = Math.ceil(maxDuration / pollIntervalMs);

        try {
            console.log(`🚀 Bắt đầu cào XSMB cho ngày ${date} (${isTestMode ? 'Test Mode' : 'Production Mode'})`);

            // Parse date
            const dateParts = date.split('/');
            const dateObj = new Date(`${dateParts[2]}-${dateParts[1]}-${dateParts[0]}`);
            if (isNaN(dateObj.getTime())) {
                throw new Error('Ngày không hợp lệ: ' + date);
            }

            const formattedDate = date.replace(/\//g, '-');
            const dayOfWeekIndex = dateObj.getDay();

            // Xác định tỉnh theo ngày trong tuần
            let tinh, tentinh;
            switch (dayOfWeekIndex) {
                case 0: tinh = 'thai-binh'; tentinh = 'Thái Bình'; break;
                case 1: tinh = 'ha-noi'; tentinh = 'Hà Nội'; break;
                case 2: tinh = 'quang-ninh'; tentinh = 'Quảng Ninh'; break;
                case 3: tinh = 'bac-ninh'; tentinh = 'Bắc Ninh'; break;
                case 4: tinh = 'ha-noi'; tentinh = 'Hà Nội'; break;
                case 5: tinh = 'hai-phong'; tentinh = 'Hải Phòng'; break;
                case 6: tinh = 'nam-dinh'; tentinh = 'Nam Định'; break;
                default: tinh = 'ha-noi'; tentinh = 'Hà Nội';
            }

            const slug = `${station}-${formattedDate}`;
            const dayOfWeek = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'][dayOfWeekIndex] || 'Thứ 2';

            // Khởi tạo browser
            browser = await puppeteer.launch({
                headless: true,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-gpu'
                ],
                executablePath: process.env.CHROMIUM_PATH || process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
            });

            page = await browser.newPage();
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/91.0.4472.124');
            await page.setViewport({ width: 1920, height: 1080 });

            const baseUrl = 'https://www.minhngoc.net.vn/xo-so-truc-tiep/mien-bac.html';
            console.log(`🌐 Đang truy cập: ${baseUrl}`);

            const selectors = {
                firstPrize: 'tr:has(td.giai1l) td.giai1 div.giaiSo',
                secondPrize: 'tr:has(td.giai2l) td.giai2 div.giaiSo',
                threePrizes: 'tr:has(td.giai3l) td.giai3 div.giaiSo',
                fourPrizes: 'tr:has(td.giai4l) td.giai4 div.giaiSo',
                fivePrizes: 'tr:has(td.giai5l) td.giai5 div.giaiSo',
                sixPrizes: 'tr:has(td.giai6l) td.giai6 div.giaiSo',
                sevenPrizes: 'tr:has(td.giai7l) td.giai7 div.giaiSo',
                maDB: 'div.loai_ve span:not(.tinh_loai_ve)',
                specialPrize: 'tr:has(td.giaidbl) td.giaidb div.giaiSo',
                tentinh: 'span.tinh_loai_ve a',
            };

            const prizeOrder = [
                'firstPrize', 'secondPrize', 'threePrizes', 'fourPrizes',
                'fivePrizes', 'sixPrizes', 'sevenPrizes', 'maDB', 'specialPrize'
            ];

            // Không cần goto ở đây, sẽ goto trong vòng lặp ở lần đầu tiên

            // Khởi tạo lastPrizeData để track thay đổi (giống scraper.js)
            const lastPrizeData = {
                firstPrize: ['...'],
                secondPrize: ['...', '...'],
                threePrizes: ['...', '...', '...', '...', '...', '...'],
                fourPrizes: ['...', '...', '...', '...'],
                fivePrizes: ['...', '...', '...', '...', '...', '...'],
                sixPrizes: ['...', '...', '...'],
                sevenPrizes: ['...', '...', '...', '...'],
                maDB: '...',
                specialPrize: ['...'],
            };
            const completedPrizes = {
                firstPrize: false,
                secondPrize: false,
                threePrizes: false,
                fourPrizes: false,
                fivePrizes: false,
                sixPrizes: false,
                sevenPrizes: false,
                maDB: false,
                specialPrize: false,
            };
            const stableCounts = {
                firstPrize: 0,
                secondPrize: 0,
                threePrizes: 0,
                fourPrizes: 0,
                fivePrizes: 0,
                sixPrizes: 0,
                sevenPrizes: 0,
                maDB: 0,
                specialPrize: 0,
            };

            let isComplete = false;
            let lastResult = null;

            // Vòng lặp cào dữ liệu
            while (iteration < maxIterations && !isComplete && (Date.now() - startTime) < maxDuration) {
                iteration++;
                const elapsedMs = Date.now() - startTime;
                const remainingMs = Math.max(maxDuration - elapsedMs, 0);
                const remainingMinutes = (remainingMs / 1000 / 60).toFixed(1);
                console.log(`🔄 Lần cào ${iteration}/${maxIterations} (còn ~${remainingMinutes} phút trước khi timeout)`);

                try {
                    // Chờ các selector xuất hiện (giống scraper.js)
                    if (iteration === 1) {
                        await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 7000 });
                        await page.waitForSelector(selectors.maDB, { timeout: 5000 }).catch(() => {
                            console.log('Chưa thấy maDB, tiếp tục cào...');
                        });
                    } else {
                        await page.waitForSelector(selectors.specialPrize, { timeout: 5000 }).catch(() => {
                            console.log('Chưa thấy giải đặc biệt, tiếp tục cào...');
                        });
                    }

                    // Chờ dữ liệu maDB tải không đồng bộ (giống scraper.js)
                    await page.evaluate((maDBSelector) => new Promise(resolve => {
                        const checkMaDB = () => {
                            const maDBElement = document.querySelector(maDBSelector);
                            if (maDBElement && maDBElement.textContent.trim() !== '...' && maDBElement.textContent.trim() !== '****') {
                                resolve();
                            } else {
                                setTimeout(checkMaDB, 500);
                            }
                        };
                        checkMaDB();
                    }), selectors.maDB).catch(() => console.log('Không thể chờ maDB, tiếp tục...'));

                    // Lấy dữ liệu từ trang (giống scraper.js - lấy từ attribute data trước)
                    const result = await page.evaluate(({ selectors, prizeOrder }) => {
                        const getPrizes = (selector) => {
                            try {
                                const elements = document.querySelectorAll(selector);
                                return Array.from(elements)
                                    .map(elem => elem.getAttribute('data')?.trim() || elem.textContent.trim())
                                    .filter(prize => prize && prize !== '...' && prize !== '****' && (prize.match(/^\d+$/) || selector.includes('loai_ve')));
                            } catch (error) {
                                console.error(`Lỗi lấy selector ${selector}:`, error.message);
                                return [];
                            }
                        };

                        const result = { drawDate: document.querySelector('.tngay')?.textContent.trim().replace('Ngày: ', '') || '' };
                        for (const prizeType of prizeOrder) {
                            if (prizeType === 'maDB') {
                                const maDBElement = document.querySelector(selectors.maDB);
                                result.maDB = maDBElement ? maDBElement.textContent.trim() : '...';
                            } else if (prizeType === 'tentinh') {
                                const tentinhElement = document.querySelector(selectors.tentinh);
                                result.tentinh = tentinhElement ? tentinhElement.textContent.trim() : '';
                            } else {
                                result[prizeType] = getPrizes(selectors[prizeType]) || [];
                            }
                        }
                        return result;
                    }, { selectors, prizeOrder });

                    console.log(`maDB hiện tại: ${result.maDB}, stableCount: ${stableCounts.maDB}, completed: ${completedPrizes.maDB}`);

                    // Tạo kết quả hoàn chỉnh (giữ giá trị cũ nếu không có dữ liệu mới - giống scraper.js)
                    const formattedResult = {
                        drawDate: dateObj,
                        slug,
                        year: dateObj.getFullYear(),
                        month: dateObj.getMonth() + 1,
                        dayOfWeek,
                        maDB: result.maDB || lastPrizeData.maDB,
                        tentinh: result.tentinh || tentinh,
                        tinh,
                        firstPrize: Array.isArray(result.firstPrize) && result.firstPrize.length ? result.firstPrize : lastPrizeData.firstPrize,
                        secondPrize: Array.isArray(result.secondPrize) && result.secondPrize.length ? result.secondPrize : lastPrizeData.secondPrize,
                        threePrizes: Array.isArray(result.threePrizes) && result.threePrizes.length ? result.threePrizes : lastPrizeData.threePrizes,
                        fourPrizes: Array.isArray(result.fourPrizes) && result.fourPrizes.length ? result.fourPrizes : lastPrizeData.fourPrizes,
                        fivePrizes: Array.isArray(result.fivePrizes) && result.fivePrizes.length ? result.fivePrizes : lastPrizeData.fivePrizes,
                        sixPrizes: Array.isArray(result.sixPrizes) && result.sixPrizes.length ? result.sixPrizes : lastPrizeData.sixPrizes,
                        sevenPrizes: Array.isArray(result.sevenPrizes) && result.sevenPrizes.length ? result.sevenPrizes : lastPrizeData.sevenPrizes,
                        specialPrize: Array.isArray(result.specialPrize) && result.specialPrize.length ? result.specialPrize : lastPrizeData.specialPrize,
                        station,
                        createdAt: new Date(),
                        scrapedAt: new Date(),
                    };

                    // Thử lại cào maDB nếu chưa hoàn thành (giống scraper.js)
                    if (!completedPrizes.maDB && iteration % 5 === 0) {
                        console.log('Thử lại cào maDB...');
                        const maDBElement = await page.$eval(selectors.maDB, el => el.textContent.trim()).catch(() => '...');
                        if (maDBElement !== '...' && maDBElement !== '****' && maDBElement !== '') {
                            formattedResult.maDB = maDBElement;
                            lastPrizeData.maDB = maDBElement;
                        }
                    }

                    // Track thay đổi và emit real-time updates (giống scraper.js)
                    const changes = [];
                    const prizeTypes = [
                        { key: 'firstPrize', data: formattedResult.firstPrize, isArray: true, minLength: 1 },
                        { key: 'secondPrize', data: formattedResult.secondPrize, isArray: true, minLength: 2 },
                        { key: 'threePrizes', data: formattedResult.threePrizes, isArray: true, minLength: 6 },
                        { key: 'fourPrizes', data: formattedResult.fourPrizes, isArray: true, minLength: 4 },
                        { key: 'fivePrizes', data: formattedResult.fivePrizes, isArray: true, minLength: 6 },
                        { key: 'sixPrizes', data: formattedResult.sixPrizes, isArray: true, minLength: 3 },
                        { key: 'sevenPrizes', data: formattedResult.sevenPrizes, isArray: true, minLength: 4 },
                        { key: 'maDB', data: formattedResult.maDB, isArray: false, minLength: 1 },
                        { key: 'specialPrize', data: formattedResult.specialPrize, isArray: true, minLength: 1 },
                    ];

                    for (const { key, data, isArray, minLength } of prizeTypes) {
                        if (isArray) {
                            if (!Array.isArray(data)) {
                                console.warn(`Dữ liệu ${key} không phải mảng, bỏ qua`);
                                continue;
                            }
                            for (const [index, prize] of data.entries()) {
                                if (prize && prize !== '...' && prize !== '****' && /^\d+$/.test(prize) && prize !== lastPrizeData[key][index]) {
                                    changes.push({ key: `${key}_${index}`, data: prize });
                                    lastPrizeData[key][index] = prize;
                                }
                            }
                        } else if (data !== lastPrizeData[key]) {
                            changes.push({ key, data });
                            lastPrizeData[key] = data;
                        }
                    }

                    // Emit real-time updates qua Socket.io khi có thay đổi
                    if (changes.length > 0) {
                        for (const change of changes) {
                            await lotterySocketService.emitPrizeUpdate(change.key, change.data, formattedResult);
                        }
                    }

                    // Cập nhật formattedResult với lastPrizeData (giống scraper.js)
                    formattedResult.firstPrize = lastPrizeData.firstPrize;
                    formattedResult.secondPrize = lastPrizeData.secondPrize;
                    formattedResult.threePrizes = lastPrizeData.threePrizes;
                    formattedResult.fourPrizes = lastPrizeData.fourPrizes;
                    formattedResult.fivePrizes = lastPrizeData.fivePrizes;
                    formattedResult.sixPrizes = lastPrizeData.sixPrizes;
                    formattedResult.sevenPrizes = lastPrizeData.sevenPrizes;
                    formattedResult.maDB = lastPrizeData.maDB;
                    formattedResult.specialPrize = lastPrizeData.specialPrize;

                    console.log(`📊 Dữ liệu lần ${iteration}:`, {
                        maDB: formattedResult.maDB,
                        firstPrize: formattedResult.firstPrize.length,
                        secondPrize: formattedResult.secondPrize.length,
                        threePrizes: formattedResult.threePrizes.length,
                        fourPrizes: formattedResult.fourPrizes.length,
                        fivePrizes: formattedResult.fivePrizes.length,
                        sixPrizes: formattedResult.sixPrizes.length,
                        sevenPrizes: formattedResult.sevenPrizes.length,
                        specialPrize: formattedResult.specialPrize.length,
                        changes: changes.length
                    });

                    // Kiểm tra dữ liệu đầy đủ với stableCounts và completedPrizes
                    isComplete = this.isDataComplete(formattedResult, completedPrizes, stableCounts);
                    lastResult = formattedResult;

                    if (isComplete) {
                        console.log('✅ Dữ liệu đã đầy đủ!');
                        // Emit complete result
                        await lotterySocketService.emitFullResultUpdate(formattedResult);
                        break;
                    }

                    // Chờ trước khi cào lại
                    await delay(pollIntervalMs);
                    successCount++;

                } catch (error) {
                    console.error(`❌ Lỗi lần cào ${iteration}:`, error.message);
                    errorCount++;
                    await delay(2000);
                }
            }

            // Lưu kết quả cuối cùng
            if (lastResult) {
                await this.saveToMongoDB(lastResult);
                // Emit final update
                await lotterySocketService.emitFullResultUpdate(lastResult);
            }

            const totalDuration = (Date.now() - startTime) / 1000;
            console.log('📈 Thống kê cào dữ liệu:', {
                totalDuration: `${totalDuration.toFixed(2)}s`,
                totalIterations: iteration,
                successCount,
                errorCount,
                isComplete,
                finalResult: lastResult ? {
                    maDB: lastResult.maDB,
                    tentinh: lastResult.tentinh,
                    prizesCount: {
                        first: lastResult.firstPrize.length,
                        second: lastResult.secondPrize.length,
                        three: lastResult.threePrizes.length,
                        four: lastResult.fourPrizes.length,
                        five: lastResult.fivePrizes.length,
                        six: lastResult.sixPrizes.length,
                        seven: lastResult.sevenPrizes.length,
                        special: lastResult.specialPrize.length,
                    }
                } : null
            });

            return {
                success: true,
                isComplete,
                result: lastResult,
                stats: {
                    totalDuration,
                    totalIterations: iteration,
                    successCount,
                    errorCount
                }
            };

        } catch (error) {
            console.error(`❌ Lỗi khi cào XSMB ngày ${date}:`, error.message);
            throw error;
        } finally {
            // Cleanup
            if (page && !page.isClosed()) {
                await page.close();
            }
            if (browser) {
                await browser.close();
            }
        }
    }

    /**
     * Cào dữ liệu cho ngày hiện tại
     */
    async scrapeToday() {
        const today = new Date();
        // Format date thành DD/MM/YYYY để match với scrapeXSMB
        const day = String(today.getDate()).padStart(2, '0');
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const year = today.getFullYear();
        const dateStr = `${day}/${month}/${year}`;
        return await this.scrapeXSMB(dateStr, 'xsmb', false);
    }

    /**
     * Cào dữ liệu cho ngày cụ thể (manual)
     */
    async scrapeSpecificDate(date) {
        return await this.scrapeXSMB(date, 'xsmb', false);
    }

    /**
     * Emit real-time updates khi có thay đổi
     */
    async emitRealtimeUpdates(currentResult, previousResult) {
        try {
            // So sánh và emit các prize đã thay đổi
            const prizeTypes = [
                { key: 'maDB', isArray: false },
                { key: 'specialPrize', isArray: true, index: 0 },
                { key: 'firstPrize', isArray: true, index: 0 },
                { key: 'secondPrize', isArray: true, indices: [0, 1] },
                { key: 'threePrizes', isArray: true, indices: [0, 1, 2, 3, 4, 5] },
                { key: 'fourPrizes', isArray: true, indices: [0, 1, 2, 3] },
                { key: 'fivePrizes', isArray: true, indices: [0, 1, 2, 3, 4, 5] },
                { key: 'sixPrizes', isArray: true, indices: [0, 1, 2] },
                { key: 'sevenPrizes', isArray: true, indices: [0, 1, 2, 3] },
            ];

            for (const prizeType of prizeTypes) {
                if (prizeType.isArray) {
                    const indices = prizeType.indices || [prizeType.index];
                    for (const index of indices) {
                        const currentValue = Array.isArray(currentResult[prizeType.key])
                            ? currentResult[prizeType.key][index]
                            : '...';
                        const previousValue = previousResult && Array.isArray(previousResult[prizeType.key])
                            ? previousResult[prizeType.key][index]
                            : '...';

                        if (currentValue !== previousValue && currentValue !== '...' && /^\d+$/.test(currentValue)) {
                            const prizeTypeKey = `${prizeType.key}_${index}`;
                            await lotterySocketService.emitPrizeUpdate(prizeTypeKey, currentValue, currentResult);
                        }
                    }
                } else {
                    const currentValue = currentResult[prizeType.key] || '...';
                    const previousValue = previousResult ? (previousResult[prizeType.key] || '...') : '...';

                    if (currentValue !== previousValue && currentValue !== '...' && /^\d+$/.test(currentValue)) {
                        await lotterySocketService.emitPrizeUpdate(prizeType.key, currentValue, currentResult);
                    }
                }
            }
        } catch (error) {
            console.error('Error emitting realtime updates:', error);
        }
    }

    /**
     * Kiểm tra trạng thái scraper
     */
    getStatus() {
        return {
            isRunning: this.isRunning,
            timestamp: new Date().toISOString()
        };
    }
}

module.exports = new XSMBScraperService();
