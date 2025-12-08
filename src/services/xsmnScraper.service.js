const puppeteer = require('puppeteer');
const XSMN = require('../models/xsmn.models');
const database = require('../config/database');
const xsmnSocketService = require('./xsmnSocket.service');

// Helper function để delay
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

class XSMNScraperService {
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
     * Chuyển đổi tên tỉnh sang kebab-case
     */
    toKebabCase(str) {
        return str
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/đ/g, 'd')
            .replace(/Đ/g, 'D')
            .toLowerCase()
            .replace(/\s+/g, '-')
            .replace(/[^a-z0-9-]/g, '');
    }

    /**
     * Kiểm tra dữ liệu có đầy đủ không (với stableCounts và completedPrizes)
     */
    isDataComplete(result, completedPrizes, stableCounts) {
        const checkPrize = (key, data, minLength) => {
            const isValid = Array.isArray(data) &&
                data.length === minLength &&
                data.every(prize => prize && prize !== '...' && prize !== '****' && /^\d+$/.test(prize));
            stableCounts[key] = isValid ? (stableCounts[key] || 0) + 1 : 0;
            completedPrizes[key] = isValid && stableCounts[key] >= (key === 'specialPrize' ? 2 : 1);
            return isValid;
        };

        checkPrize('eightPrizes', result.eightPrizes || [], 1);
        checkPrize('sevenPrizes', result.sevenPrizes || [], 1);
        checkPrize('sixPrizes', result.sixPrizes || [], 3);
        checkPrize('fivePrizes', result.fivePrizes || [], 1);
        checkPrize('fourPrizes', result.fourPrizes || [], 7);
        checkPrize('threePrizes', result.threePrizes || [], 2);
        checkPrize('secondPrize', result.secondPrize || [], 1);
        checkPrize('firstPrize', result.firstPrize || [], 1);
        checkPrize('specialPrize', result.specialPrize || [], 1);

        const isComplete = result.tentinh && result.tentinh.length >= 1 &&
            Object.keys(completedPrizes).every(k => completedPrizes[k]);
        if (isComplete) console.log(`✅ Dữ liệu hoàn thành cho tỉnh ${result.tentinh}`);
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

            const dateObj = new Date(result.drawDate);
            const existingResult = await XSMN.findOne({
                drawDate: dateObj,
                station: result.station,
                tentinh: result.tentinh
            }).lean();

            if (existingResult) {
                const existingData = {
                    eightPrizes: existingResult.eightPrizes,
                    sevenPrizes: existingResult.sevenPrizes,
                    sixPrizes: existingResult.sixPrizes,
                    fivePrizes: existingResult.fivePrizes,
                    fourPrizes: existingResult.fourPrizes,
                    threePrizes: existingResult.threePrizes,
                    secondPrize: existingResult.secondPrize,
                    firstPrize: existingResult.firstPrize,
                    specialPrize: existingResult.specialPrize,
                };

                const newData = {
                    eightPrizes: result.eightPrizes,
                    sevenPrizes: result.sevenPrizes,
                    sixPrizes: result.sixPrizes,
                    fivePrizes: result.fivePrizes,
                    fourPrizes: result.fourPrizes,
                    threePrizes: result.threePrizes,
                    secondPrize: result.secondPrize,
                    firstPrize: result.firstPrize,
                    specialPrize: result.specialPrize,
                };

                if (JSON.stringify(existingData) !== JSON.stringify(newData)) {
                    await XSMN.updateOne(
                        { drawDate: dateObj, station: result.station, tentinh: result.tentinh },
                        {
                            $set: {
                                ...result,
                                updatedAt: new Date(),
                                scrapedAt: new Date()
                            }
                        },
                        { upsert: true }
                    );
                    console.log(`✅ Cập nhật kết quả ngày ${result.drawDate.toISOString().split('T')[0]} cho tỉnh ${result.tentinh}`);
                }
            } else {
                await XSMN.create(result);
                console.log(`✅ Lưu kết quả mới ngày ${result.drawDate.toISOString().split('T')[0]} cho tỉnh ${result.tentinh}`);
            }
        } catch (error) {
            console.error(`❌ Lỗi khi lưu dữ liệu ngày ${result.drawDate.toISOString().split('T')[0]} cho tỉnh ${result.tentinh}:`, error.message);
            throw error;
        }
    }

    /**
     * Cào dữ liệu XSMN cho ngày cụ thể
     * XSMN có nhiều tỉnh mỗi ngày (3-4 tỉnh)
     */
    async scrapeXSMN(date, station = 'xsmn', isTestMode = false) {
        let browser;
        let page;
        let iteration = 0;
        let successCount = 0;
        let errorCount = 0;
        const startTime = Date.now();
        const pollIntervalMs = isTestMode ? 1000 : 1000;
        const liveWindowMinutes = isTestMode ? 1 : 30; // Khung thời gian cào (16h10-16h40)
        const maxDuration = liveWindowMinutes * 60 * 1000;
        const maxIterations = Math.ceil(maxDuration / pollIntervalMs);

        // Track dữ liệu theo từng tỉnh
        const lastPrizeDataByProvince = {};
        const completedPrizesByProvince = {};
        const stableCountsByProvince = {};

        try {
            console.log(`🚀 Bắt đầu cào XSMN cho ngày ${date} (${isTestMode ? 'Test Mode' : 'Production Mode'})`);

            // Parse date
            const dateParts = date.split('/');
            const dateObj = new Date(`${dateParts[2]}-${dateParts[1]}-${dateParts[0]}`);
            if (isNaN(dateObj.getTime())) {
                throw new Error('Ngày không hợp lệ: ' + date);
            }

            const formattedDate = this.formatDateToDDMMYYYY(dateObj).replace(/-/g, '');
            const dayOfWeekIndex = dateObj.getDay();
            const daysOfWeek = ['chu-nhat', 'thu-2', 'thu-3', 'thu-4', 'thu-5', 'thu-6', 'thu-7'];
            const dayOfWeekUrl = daysOfWeek[dayOfWeekIndex];
            const dayOfWeek = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'][dayOfWeekIndex] || 'Thứ 2';

            // Xác định URL theo ngày trong tuần
            let baseUrl;
            if (station.toLowerCase() === 'xsmn') {
                baseUrl = dayOfWeekIndex === 0
                    ? `https://xoso.com.vn/xsmn-chu-nhat-cn.html`
                    : `https://xoso.com.vn/xsmn-${dayOfWeekUrl}.html`;
            } else {
                throw new Error('Chỉ hỗ trợ đài xsmn trong phiên bản này');
            }

            console.log(`🌐 Đang truy cập: ${baseUrl}`);

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
            await page.setRequestInterception(true);
            page.on('request', (req) => {
                if (['image', 'stylesheet', 'font', 'media'].includes(req.resourceType())) {
                    req.abort();
                } else {
                    req.continue();
                }
            });

            const selectors = {
                eightPrizes: 'span.xs_prize1[id*="_prize8_item"]',
                sevenPrizes: 'span.xs_prize1[id*="_prize7_item"]',
                sixPrizes: 'span.xs_prize1[id*="_prize6_item"]',
                fivePrizes: 'span.xs_prize1[id*="_prize5_item"]',
                fourPrizes: 'span.xs_prize1[id*="_prize4_item"]',
                threePrizes: 'span.xs_prize1[id*="_prize3_item"]',
                secondPrize: 'span.xs_prize1[id*="_prize2_item"]',
                firstPrize: 'span.xs_prize1[id*="_prize1_item"]',
                specialPrize: 'span.xs_prize1[id*="_prize_Db_item"]',
            };

            const prizeLimits = {
                eightPrizes: 1,
                sevenPrizes: 1,
                sixPrizes: 3,
                fivePrizes: 1,
                fourPrizes: 7,
                threePrizes: 2,
                secondPrize: 1,
                firstPrize: 1,
                specialPrize: 1,
            };

            let allProvincesComplete = false;
            const lastResultsByProvince = {}; // Lưu kết quả cuối cùng của từng tỉnh

            // Vòng lặp cào dữ liệu
            while (iteration < maxIterations && !allProvincesComplete && (Date.now() - startTime) < maxDuration) {
                iteration++;
                const elapsedMs = Date.now() - startTime;
                const remainingMs = Math.max(maxDuration - elapsedMs, 0);
                const remainingMinutes = (remainingMs / 1000 / 60).toFixed(1);
                console.log(`🔄 Lần cào ${iteration}/${maxIterations} (còn ~${remainingMinutes} phút trước khi timeout)`);

                try {
                    // Chờ các selector xuất hiện
                    if (iteration === 1) {
                        await page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 7000 });
                        await page.waitForSelector(`div#mn_kqngay_${formattedDate}_kq table.table-result.table-xsmn`, { timeout: 2000 }).catch(() => {
                            console.log('Chưa thấy bảng kết quả, tiếp tục cào...');
                        });
                    } else {
                        await page.waitForSelector(`div#mn_kqngay_${formattedDate}_kq table.table-result.table-xsmn`, { timeout: 2000 }).catch(() => {
                            console.log('Chưa thấy bảng kết quả, tiếp tục cào...');
                        });
                    }

                    // Lấy dữ liệu từ trang
                    const result = await page.evaluate(({ selectors, prizeLimits, formattedDate }) => {
                        // Định nghĩa getProvinceCode trong môi trường trình duyệt
                        const getProvinceCode = (provinceName) => {
                            if (provinceName === 'TPHCM') return 'HCM';
                            if (provinceName === 'Bến Tre') return 'BTR';
                            if (provinceName === 'Bình Thuận') return 'BTH';
                            if (provinceName === 'Đồng Nai') return 'DN';
                            if (provinceName === 'Cần Thơ') return 'CT';
                            if (provinceName === 'Sóc Trăng') return 'ST';
                            if (provinceName === 'An Giang') return 'AG';
                            if (provinceName === 'Tây Ninh') return 'TN';

                            return provinceName
                                .normalize('NFD')
                                .replace(/[\u0300-\u036f]/g, '')
                                .replace(/đ/g, 'd')
                                .replace(/Đ/g, 'D')
                                .split(/\s+/)
                                .map(word => word[0].toUpperCase())
                                .join('');
                        };

                        const getPrizeForProvince = (selector, provinceCode, limit) => {
                            try {
                                const elements = document.querySelectorAll(selector);
                                return Array.from(elements)
                                    .filter(elem => elem.id.startsWith(`${provinceCode}_`))
                                    .slice(0, limit)
                                    .map(elem => elem.getAttribute('data-loto')?.trim() || '')
                                    .filter(prize => prize && prize !== '...' && prize !== '****' && /^\d+$/.test(prize));
                            } catch (error) {
                                console.error(`Lỗi lấy selector ${selector} cho tỉnh ${provinceCode}:`, error.message);
                                return [];
                            }
                        };

                        const provinces = [];
                        const provinceRow = document.querySelectorAll(`div#mn_kqngay_${formattedDate}_kq table.table-result.table-xsmn thead tr th h3 a`);
                        if (!provinceRow.length) {
                            return { provinces, provincesData: {}, drawDate: '' };
                        }
                        provinceRow.forEach(elem => {
                            const provinceName = elem.textContent.trim();
                            if (provinceName && !provinceName.startsWith('Tỉnh_')) {
                                provinces.push(provinceName);
                            }
                        });

                        const provincesData = {};
                        provinces.forEach(province => {
                            const provinceCode = getProvinceCode(province);
                            provincesData[province] = {
                                eightPrizes: getPrizeForProvince(selectors.eightPrizes, provinceCode, prizeLimits.eightPrizes),
                                sevenPrizes: getPrizeForProvince(selectors.sevenPrizes, provinceCode, prizeLimits.sevenPrizes),
                                sixPrizes: getPrizeForProvince(selectors.sixPrizes, provinceCode, prizeLimits.sixPrizes),
                                fivePrizes: getPrizeForProvince(selectors.fivePrizes, provinceCode, prizeLimits.fivePrizes),
                                fourPrizes: getPrizeForProvince(selectors.fourPrizes, provinceCode, prizeLimits.fourPrizes),
                                threePrizes: getPrizeForProvince(selectors.threePrizes, provinceCode, prizeLimits.threePrizes),
                                secondPrize: getPrizeForProvince(selectors.secondPrize, provinceCode, prizeLimits.secondPrize),
                                firstPrize: getPrizeForProvince(selectors.firstPrize, provinceCode, prizeLimits.firstPrize),
                                specialPrize: getPrizeForProvince(selectors.specialPrize, provinceCode, prizeLimits.specialPrize),
                            };
                        });

                        const drawDateDiv = document.querySelector(`div#mn_kqngay_${formattedDate}_kq`);
                        const drawDate = drawDateDiv ? `${formattedDate.slice(0, 2)}/${formattedDate.slice(2, 4)}/${formattedDate.slice(4)}` : '';
                        return { provinces, provincesData, drawDate };
                    }, { selectors, prizeLimits, formattedDate });

                    if (result.provinces.length === 0) {
                        console.log('Không tìm thấy tỉnh nào, tiếp tục cào...');
                        errorCount++;
                        await delay(pollIntervalMs);
                        continue;
                    }

                    // Xử lý từng tỉnh
                    allProvincesComplete = true;
                    for (const tentinh of result.provinces) {
                        // Khởi tạo tracking cho tỉnh nếu chưa có
                        if (!lastPrizeDataByProvince[tentinh]) {
                            lastPrizeDataByProvince[tentinh] = {
                                eightPrizes: Array(prizeLimits.eightPrizes).fill('...'),
                                sevenPrizes: Array(prizeLimits.sevenPrizes).fill('...'),
                                sixPrizes: Array(prizeLimits.sixPrizes).fill('...'),
                                fivePrizes: Array(prizeLimits.fivePrizes).fill('...'),
                                fourPrizes: Array(prizeLimits.fourPrizes).fill('...'),
                                threePrizes: Array(prizeLimits.threePrizes).fill('...'),
                                secondPrize: Array(prizeLimits.secondPrize).fill('...'),
                                firstPrize: Array(prizeLimits.firstPrize).fill('...'),
                                specialPrize: Array(prizeLimits.specialPrize).fill('...'),
                            };
                            completedPrizesByProvince[tentinh] = {
                                eightPrizes: false,
                                sevenPrizes: false,
                                sixPrizes: false,
                                fivePrizes: false,
                                fourPrizes: false,
                                threePrizes: false,
                                secondPrize: false,
                                firstPrize: false,
                                specialPrize: false,
                            };
                            stableCountsByProvince[tentinh] = {
                                eightPrizes: 0,
                                sevenPrizes: 0,
                                sixPrizes: 0,
                                fivePrizes: 0,
                                fourPrizes: 0,
                                threePrizes: 0,
                                secondPrize: 0,
                                firstPrize: 0,
                                specialPrize: 0,
                            };
                        }

                        const tinh = this.toKebabCase(tentinh);
                        const slug = `xsmn-${this.formatDateToDDMMYYYY(dateObj)}-${tinh}`;

                        // Tạo formattedResult với dữ liệu mới hoặc giữ nguyên dữ liệu cũ
                        const formattedResult = {
                            drawDate: dateObj,
                            slug,
                            year: dateObj.getFullYear(),
                            month: dateObj.getMonth() + 1,
                            dayOfWeek,
                            tentinh,
                            tinh,
                            eightPrizes: result.provincesData[tentinh]?.eightPrizes?.length ? result.provincesData[tentinh].eightPrizes : lastPrizeDataByProvince[tentinh].eightPrizes,
                            sevenPrizes: result.provincesData[tentinh]?.sevenPrizes?.length ? result.provincesData[tentinh].sevenPrizes : lastPrizeDataByProvince[tentinh].sevenPrizes,
                            sixPrizes: result.provincesData[tentinh]?.sixPrizes?.length ? result.provincesData[tentinh].sixPrizes : lastPrizeDataByProvince[tentinh].sixPrizes,
                            fivePrizes: result.provincesData[tentinh]?.fivePrizes?.length ? result.provincesData[tentinh].fivePrizes : lastPrizeDataByProvince[tentinh].fivePrizes,
                            fourPrizes: result.provincesData[tentinh]?.fourPrizes?.length ? result.provincesData[tentinh].fourPrizes : lastPrizeDataByProvince[tentinh].fourPrizes,
                            threePrizes: result.provincesData[tentinh]?.threePrizes?.length ? result.provincesData[tentinh].threePrizes : lastPrizeDataByProvince[tentinh].threePrizes,
                            secondPrize: result.provincesData[tentinh]?.secondPrize?.length ? result.provincesData[tentinh].secondPrize : lastPrizeDataByProvince[tentinh].secondPrize,
                            firstPrize: result.provincesData[tentinh]?.firstPrize?.length ? result.provincesData[tentinh].firstPrize : lastPrizeDataByProvince[tentinh].firstPrize,
                            specialPrize: result.provincesData[tentinh]?.specialPrize?.length ? result.provincesData[tentinh].specialPrize : lastPrizeDataByProvince[tentinh].specialPrize,
                            station,
                            createdAt: new Date(),
                            scrapedAt: new Date(),
                        };

                        // Track thay đổi và emit real-time updates qua Socket.io
                        const changes = [];
                        const prizeTypes = [
                            { key: 'eightPrizes', data: formattedResult.eightPrizes, isArray: true, minLength: 1 },
                            { key: 'sevenPrizes', data: formattedResult.sevenPrizes, isArray: true, minLength: 1 },
                            { key: 'sixPrizes', data: formattedResult.sixPrizes, isArray: true, minLength: 3 },
                            { key: 'fivePrizes', data: formattedResult.fivePrizes, isArray: true, minLength: 1 },
                            { key: 'fourPrizes', data: formattedResult.fourPrizes, isArray: true, minLength: 7 },
                            { key: 'threePrizes', data: formattedResult.threePrizes, isArray: true, minLength: 2 },
                            { key: 'secondPrize', data: formattedResult.secondPrize, isArray: true, minLength: 1 },
                            { key: 'firstPrize', data: formattedResult.firstPrize, isArray: true, minLength: 1 },
                            { key: 'specialPrize', data: formattedResult.specialPrize, isArray: true, minLength: 1 },
                        ];

                        for (const { key, data, isArray, minLength } of prizeTypes) {
                            if (isArray && Array.isArray(data)) {
                                for (let index = 0; index < Math.min(data.length, minLength); index++) {
                                    const prize = data[index];
                                    if (prize && prize !== '...' && prize !== '****' && /^\d+$/.test(prize) && prize !== lastPrizeDataByProvince[tentinh][key][index]) {
                                        changes.push({ key: `${key}_${index}`, data: prize });
                                        lastPrizeDataByProvince[tentinh][key][index] = prize;
                                    }
                                }
                            }
                        }

                        // Emit real-time updates qua Socket.io khi có thay đổi
                        if (changes.length > 0) {
                            for (const change of changes) {
                                await xsmnSocketService.emitPrizeUpdate(change.key, change.data, formattedResult);
                            }
                        }

                        // Cập nhật formattedResult với lastPrizeData
                        formattedResult.eightPrizes = lastPrizeDataByProvince[tentinh].eightPrizes;
                        formattedResult.sevenPrizes = lastPrizeDataByProvince[tentinh].sevenPrizes;
                        formattedResult.sixPrizes = lastPrizeDataByProvince[tentinh].sixPrizes;
                        formattedResult.fivePrizes = lastPrizeDataByProvince[tentinh].fivePrizes;
                        formattedResult.fourPrizes = lastPrizeDataByProvince[tentinh].fourPrizes;
                        formattedResult.threePrizes = lastPrizeDataByProvince[tentinh].threePrizes;
                        formattedResult.secondPrize = lastPrizeDataByProvince[tentinh].secondPrize;
                        formattedResult.firstPrize = lastPrizeDataByProvince[tentinh].firstPrize;
                        formattedResult.specialPrize = lastPrizeDataByProvince[tentinh].specialPrize;

                        // Lưu kết quả cuối cùng cho tỉnh này
                        lastResultsByProvince[tentinh] = formattedResult;

                        // Kiểm tra dữ liệu đầy đủ
                        const isComplete = this.isDataComplete(
                            formattedResult,
                            completedPrizesByProvince[tentinh],
                            stableCountsByProvince[tentinh]
                        );

                        if (isComplete) {
                            console.log(`✅ Dữ liệu ngày ${date} cho tỉnh ${tentinh} đã đầy đủ.`);
                            await this.saveToMongoDB(formattedResult);
                            // Emit complete result
                            await xsmnSocketService.emitFullResultUpdate(formattedResult);
                        } else {
                            allProvincesComplete = false;
                        }
                    }

                    successCount++;

                    // Nếu tất cả tỉnh đã hoàn thành, dừng lại
                    if (allProvincesComplete) {
                        console.log(`✅ Dữ liệu ngày ${date} cho tất cả tỉnh đã đầy đủ, dừng cào.`);
                        break;
                    }

                    // Chờ trước khi cào lại
                    await delay(pollIntervalMs);

                } catch (error) {
                    console.error(`❌ Lỗi lần cào ${iteration}:`, error.message);
                    errorCount++;
                    await delay(2000);
                }
            }

            // Lưu kết quả cuối cùng cho tất cả tỉnh (ngay cả khi không complete)
            for (const [tentinh, lastResult] of Object.entries(lastResultsByProvince)) {
                if (lastResult) {
                    await this.saveToMongoDB(lastResult);
                    // Emit final update
                    await xsmnSocketService.emitFullResultUpdate(lastResult);
                }
            }

            const totalDuration = (Date.now() - startTime) / 1000;
            console.log('📈 Thống kê cào dữ liệu XSMN:', {
                totalDuration: `${totalDuration.toFixed(2)}s`,
                totalIterations: iteration,
                successCount,
                errorCount,
                allProvincesComplete,
                provinces: result.provinces || [],
                savedProvinces: Object.keys(lastResultsByProvince)
            });

            return {
                success: true,
                isComplete: allProvincesComplete,
                provinces: result.provinces || [],
                stats: {
                    totalDuration,
                    totalIterations: iteration,
                    successCount,
                    errorCount
                }
            };

        } catch (error) {
            console.error(`❌ Lỗi khi cào XSMN ngày ${date}:`, error.message);
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
        const day = String(today.getDate()).padStart(2, '0');
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const year = today.getFullYear();
        const dateStr = `${day}/${month}/${year}`;
        return await this.scrapeXSMN(dateStr, 'xsmn', false);
    }

    /**
     * Cào dữ liệu cho ngày cụ thể (manual)
     */
    async scrapeSpecificDate(date) {
        return await this.scrapeXSMN(date, 'xsmn', false);
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

module.exports = new XSMNScraperService();

