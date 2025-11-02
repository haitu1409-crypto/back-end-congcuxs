const puppeteer = require('puppeteer');
const XSMB = require('../models/xsmb.model');
const database = require('../config/database');

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
     * Kiểm tra dữ liệu có đầy đủ không
     */
    isDataComplete(result) {
        const checkPrize = (key, data, minLength) => {
            return Array.isArray(data) &&
                data.length >= minLength &&
                data.every(prize => prize && prize !== '...' && !/\*+/.test(prize) && !/\+/.test(prize) && /^\d+$/.test(prize));
        };

        const isValidMaDB = result.maDB &&
            typeof result.maDB === 'string' &&
            result.maDB.trim() !== '' &&
            result.maDB.trim() !== '...' &&
            !/\*+/.test(result.maDB) &&
            !/\+/.test(result.maDB);

        return isValidMaDB &&
            result.tentinh &&
            result.tentinh.length >= 1 &&
            checkPrize('firstPrize', result.firstPrize || [], 1) &&
            checkPrize('secondPrize', result.secondPrize || [], 2) &&
            checkPrize('threePrizes', result.threePrizes || [], 6) &&
            checkPrize('fourPrizes', result.fourPrizes || [], 4) &&
            checkPrize('fivePrizes', result.fivePrizes || [], 6) &&
            checkPrize('sixPrizes', result.sixPrizes || [], 3) &&
            checkPrize('sevenPrizes', result.sevenPrizes || [], 4) &&
            checkPrize('specialPrize', result.specialPrize || [], 1);
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
        const maxIterations = isTestMode ? 5 : 30; // Giới hạn số lần cào
        const maxDuration = 10 * 60 * 1000; // 10 phút timeout

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

            // Điều hướng đến trang
            await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
            await delay(2000); // Chờ trang load

            let isComplete = false;
            let lastResult = null;

            // Vòng lặp cào dữ liệu
            while (iteration < maxIterations && !isComplete && (Date.now() - startTime) < maxDuration) {
                iteration++;
                console.log(`🔄 Lần cào ${iteration}/${maxIterations}`);

                try {
                    // Chờ các selector xuất hiện
                    await page.waitForSelector(selectors.maDB, { timeout: 5000 }).catch(() => {
                        console.log('⚠️ Chưa thấy maDB, tiếp tục...');
                    });

                    // Lấy dữ liệu từ trang
                    const result = await page.evaluate(({ selectors, prizeOrder }) => {
                        const getPrizes = (selector) => {
                            try {
                                const elements = document.querySelectorAll(selector);
                                return Array.from(elements)
                                    .map(elem => elem.getAttribute('data')?.trim() || elem.textContent.trim())
                                    .filter(prize => prize && prize !== '...' && prize !== '****' && prize.match(/^\d+$/));
                            } catch (error) {
                                console.error(`Lỗi lấy selector ${selector}:`, error.message);
                                return [];
                            }
                        };

                        const result = {
                            drawDate: document.querySelector('.tngay')?.textContent.trim().replace('Ngày: ', '') || ''
                        };

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

                    // Tạo kết quả hoàn chỉnh
                    const formattedResult = {
                        drawDate: dateObj,
                        slug,
                        year: dateObj.getFullYear(),
                        month: dateObj.getMonth() + 1,
                        dayOfWeek,
                        maDB: result.maDB || '...',
                        tentinh: result.tentinh || tentinh,
                        tinh,
                        firstPrize: Array.isArray(result.firstPrize) && result.firstPrize.length ? result.firstPrize : ['...'],
                        secondPrize: Array.isArray(result.secondPrize) && result.secondPrize.length ? result.secondPrize : ['...', '...'],
                        threePrizes: Array.isArray(result.threePrizes) && result.threePrizes.length ? result.threePrizes : ['...', '...', '...', '...', '...', '...'],
                        fourPrizes: Array.isArray(result.fourPrizes) && result.fourPrizes.length ? result.fourPrizes : ['...', '...', '...', '...'],
                        fivePrizes: Array.isArray(result.fivePrizes) && result.fivePrizes.length ? result.fivePrizes : ['...', '...', '...', '...', '...', '...'],
                        sixPrizes: Array.isArray(result.sixPrizes) && result.sixPrizes.length ? result.sixPrizes : ['...', '...', '...'],
                        sevenPrizes: Array.isArray(result.sevenPrizes) && result.sevenPrizes.length ? result.sevenPrizes : ['...', '...', '...', '...'],
                        specialPrize: Array.isArray(result.specialPrize) && result.specialPrize.length ? result.specialPrize : ['...'],
                        station,
                        createdAt: new Date(),
                        scrapedAt: new Date(),
                    };

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
                    });

                    // Kiểm tra dữ liệu đầy đủ
                    isComplete = this.isDataComplete(formattedResult);
                    lastResult = formattedResult;

                    if (isComplete) {
                        console.log('✅ Dữ liệu đã đầy đủ!');
                        break;
                    }

                    // Chờ trước khi cào lại
                    await delay(isTestMode ? 1000 : 2000);
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
