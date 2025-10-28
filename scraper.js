const puppeteer = require('puppeteer');
const mongoose = require('mongoose');
const redis = require('redis');
const pidusage = require('pidusage');
const { connectMongoDB, isConnected } = require('./db');
require('dotenv').config();

process.env.TZ = 'Asia/Ho_Chi_Minh';

const XSMB = require('./src/models/XS_MB.models');

// Kết nối Redis
const redisClient = redis.createClient({
    url: process.env.REDIS_URL || 'redis://localhost:6379',
});
redisClient.connect().catch(err => console.error('Lỗi kết nối Redis:', err));

function formatDateToDDMMYYYY(date) {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}-${month}-${year}`;
}

function isDataComplete(result, completedPrizes, stableCounts) {
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
    if (isComplete) console.log('Dữ liệu hoàn thành');
    return isComplete;
}

async function publishToRedis(changes, additionalData) {
    const { drawDate, tentinh, tinh, year, month } = additionalData;
    const today = formatDateToDDMMYYYY(new Date(drawDate));
    try {
        if (!redisClient.isOpen) {
            console.log('Redis client chưa sẵn sàng, kết nối lại...');
            await redisClient.connect();
        }
        const pipeline = redisClient.multi();
        for (const { key, data } of changes) {
            pipeline.publish(`xsmb:${today}`, JSON.stringify({ prizeType: key, prizeData: data, drawDate: today, tentinh, tinh, year, month }));
            pipeline.hSet(`kqxs:${today}`, key, JSON.stringify(data));
        }
        pipeline.hSet(`kqxs:${today}:meta`, 'metadata', JSON.stringify({ tentinh, tinh, year, month }));
        await pipeline.exec();
        console.log(`Đã gửi ${changes.length} thay đổi qua Redis`);
    } catch (error) {
        console.error('Lỗi gửi Redis:', error.message);
        throw error;
    }
}

async function setRedisExpiration(today) {
    try {
        await Promise.all([
            redisClient.expire(`kqxs:${today}`, 7200),
            redisClient.expire(`kqxs:${today}:meta`, 7200),
        ]);
        console.log(`Đã đặt expire cho kqxs:${today} và metadata`);
    } catch (error) {
        console.error('Lỗi đặt expire Redis:', error.message);
    }
}

async function saveToMongoDB(result) {
    try {
        if (!isConnected()) {
            await connectMongoDB();
        }
        const existingResult = await XSMB.findOne({ drawDate: result.drawDate, station: result.station }).lean();
        if (existingResult) {
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
                    { $set: result },
                    { upsert: true }
                );
                console.log(`Cập nhật kết quả ngày ${result.drawDate.toISOString().split('T')[0]} cho ${result.station}`);
            }
        } else {
            await XSMB.create(result);
            console.log(`Lưu kết quả mới ngày ${result.drawDate.toISOString().split('T')[0]} cho ${result.station}`);
        }
    } catch (error) {
        console.error(`Lỗi khi lưu dữ liệu ngày ${result.drawDate.toISOString().split('T')[0]}:`, error.message);
    }
}

async function logPerformance(startTime, iteration, success) {
    if (iteration % 10 === 0 || !success) {
        const stats = await pidusage(process.pid);
        const duration = (Date.now() - startTime) / 1000;
        console.log(`Lần cào ${iteration} (${success ? 'Thành công' : 'Thất bại'}):`, {
            duration: `${duration.toFixed(2)}s`,
            cpu: `${stats.cpu.toFixed(2)}%`,
            memory: `${(stats.memory / 1024 / 1024).toFixed(2)}MB`,
        });
    }
}

async function scrapeXSMB(date, station, isTestMode = false) {
    let browser;
    let page;
    let intervalId;
    let isStopped = false;
    let iteration = 0;
    let successCount = 0;
    let errorCount = 0;
    const startTime = Date.now();
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

    try {
        const dateParts = date.split('/');
        const dateObj = new Date(`${dateParts[2]}-${dateParts[1]}-${dateParts[0]}`);
        if (isNaN(dateObj.getTime())) {
            throw new Error('Ngày không hợp lệ: ' + date);
        }
        const formattedDate = date.replace(/\//g, '-');

        const isLiveWindow = false; // Trang theo ngày là tĩnh, không cần live
        const intervalMs = 1000;
        console.log(`intervalMs: ${intervalMs}ms (isLiveWindow: ${isLiveWindow}, isTestMode: ${isTestMode})`);

        await connectMongoDB();

        browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
            executablePath: process.env.CHROMIUM_PATH || undefined,
        });
        page = await browser.newPage();
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/91.0.4472.124');

        let baseUrl;
        if (station.toLowerCase() === 'xsmb') {
            baseUrl = `https://www.minhngoc.net.vn/ket-qua-xo-so/mien-bac/${formattedDate}.html`;
            console.log(`Đang cào dữ liệu từ: ${baseUrl}`);
        } else {
            throw new Error('Chỉ hỗ trợ đài xsmb trong phiên bản này');
        }

        const containerSelector = 'table.bkqtinhmienbac.bangketquaSo[data="0"]';
        const selectors = {
            container: containerSelector,
            firstPrize: `${containerSelector} tr:has(td.giai1l) td.giai1 div.giaiSo`,
            secondPrize: `${containerSelector} tr:has(td.giai2l) td.giai2 div.giaiSo`,
            threePrizes: `${containerSelector} tr:has(td.giai3l) td.giai3 div.giaiSo`,
            fourPrizes: `${containerSelector} tr:has(td.giai4l) td.giai4 div.giaiSo`,
            fivePrizes: `${containerSelector} tr:has(td.giai5l) td.giai5 div.giaiSo`,
            sixPrizes: `${containerSelector} tr:has(td.giai6l) td.giai6 div.giaiSo`,
            sevenPrizes: `${containerSelector} tr:has(td.giai7l) td.giai7 div.giaiSo`,
            maDB: `${containerSelector} .loai_ves .loaive_content`,
            specialPrize: `${containerSelector} tr:has(td.giaidbl) td.giaidb div.giaiSo`,
            dateText: `${containerSelector} .tngay a`,
        };

        const prizeOrder = [
            'firstPrize',
            'secondPrize',
            'threePrizes',
            'fourPrizes',
            'fivePrizes',
            'sixPrizes',
            'sevenPrizes',
            'maDB',
            'specialPrize',
        ];

        const scrapeAndSave = async () => {
            if (isStopped || (page && page.isClosed())) {
                console.log(`Scraper đã dừng hoặc page đã đóng`);
                clearInterval(intervalId);
                return;
            }

            iteration += 1;
            const iterationStart = Date.now();
            console.log(`Bắt đầu lần cào ${iteration}`);

            try {
                if (iteration === 1) {
                    await page.goto(baseUrl, { waitUntil: 'networkidle2', timeout: 15000 });
                    await page.waitForSelector(selectors.container, { timeout: 8000 });
                } else {
                    await page.waitForSelector(selectors.specialPrize, { timeout: 5000 }).catch(() => {
                        console.log('Chưa thấy giải đặc biệt, tiếp tục cào...');
                    });
                }

                const result = await page.evaluate(({ selectors, prizeOrder }) => {
                    const container = document.querySelector(selectors.container);
                    if (!container) return { drawDate: '', maDB: '...' };
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

                    const drawDateText = document.querySelector(selectors.dateText)?.textContent.trim() || '';
                    const result = { drawDate: drawDateText };
                    for (const prizeType of prizeOrder) {
                        if (prizeType === 'maDB') {
                            const maDBElement = document.querySelector(selectors.maDB);
                            result.maDB = maDBElement ? maDBElement.textContent.trim() : '...';
                        } else if (prizeType === 'tentinh') {
                            // Not available on static page header; will be set outside
                        } else {
                            result[prizeType] = getPrizes(selectors[prizeType]) || [];
                        }
                    }
                    return result;
                }, { selectors, prizeOrder });

                console.log(`maDB hiện tại: ${result.maDB}, stableCount: ${stableCounts.maDB}, completed: ${completedPrizes.maDB}`);

                const dayOfWeekIndex = dateObj.getDay();
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

                // Chuẩn hoá số lượng phần tử theo chuẩn XSMB 1 ngày
                const normalize = (arr, count) => (Array.isArray(arr) ? arr.filter(x => /^\d+$/.test(x)).slice(0, count) : []).concat(Array(Math.max(0, count - (Array.isArray(arr) ? arr.filter(x => /^\d+$/.test(x)).slice(0, count).length : 0))).fill('...'));

                const formattedResult = {
                    drawDate: dateObj,
                    slug,
                    year: dateObj.getFullYear(),
                    month: dateObj.getMonth() + 1,
                    dayOfWeek,
                    maDB: (result.maDB || '').split(/\s+/)[0] || lastPrizeData.maDB,
                    tentinh: result.tentinh || tentinh,
                    tinh,
                    firstPrize: normalize(result.firstPrize, 1),
                    secondPrize: normalize(result.secondPrize, 2),
                    threePrizes: normalize(result.threePrizes, 6),
                    fourPrizes: normalize(result.fourPrizes, 4),
                    fivePrizes: normalize(result.fivePrizes, 6),
                    sixPrizes: normalize(result.sixPrizes, 3),
                    sevenPrizes: normalize(result.sevenPrizes, 4),
                    specialPrize: normalize(result.specialPrize, 1),
                    station,
                    createdAt: new Date(),
                };

                // Thử lại cào maDB nếu chưa hoàn thành
                if (!completedPrizes.maDB && iteration % 5 === 0) {
                    console.log('Thử lại cào maDB...');
                    const maDBElement = await page.$eval(selectors.maDB, el => el.textContent.trim()).catch(() => '...');
                    if (maDBElement !== '...' && maDBElement !== '****' && maDBElement !== '') {
                        formattedResult.maDB = maDBElement;
                        lastPrizeData.maDB = maDBElement;
                        changes.push({ key: 'maDB', data: maDBElement });
                    }
                }

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

                const changes = [];
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

                if (changes.length) {
                    await publishToRedis(changes, formattedResult);
                }

                formattedResult.firstPrize = lastPrizeData.firstPrize;
                formattedResult.secondPrize = lastPrizeData.secondPrize;
                formattedResult.threePrizes = lastPrizeData.threePrizes;
                formattedResult.fourPrizes = lastPrizeData.fourPrizes;
                formattedResult.fivePrizes = lastPrizeData.fivePrizes;
                formattedResult.sixPrizes = lastPrizeData.sixPrizes;
                formattedResult.sevenPrizes = lastPrizeData.sevenPrizes;
                formattedResult.maDB = lastPrizeData.maDB;
                formattedResult.specialPrize = lastPrizeData.specialPrize;

                // Với trang theo ngày (tĩnh), sau lần cào đầu tiên là dừng
                isStopped = true;
                clearInterval(intervalId);
                await saveToMongoDB(formattedResult);
                await setRedisExpiration(formatDateToDDMMYYYY(dateObj));

                const totalDuration = (Date.now() - startTime) / 1000;
                const stats = await pidusage(process.pid);
                console.log('Tổng hiệu suất scraper:', {
                    totalDuration: `${totalDuration.toFixed(2)}s`,
                    cpu: `${stats.cpu.toFixed(2)}%`,
                    memory: `${(stats.memory / 1024 / 1024).toFixed(2)}MB`,
                    totalIterations: iteration,
                    successCount,
                    errorCount,
                });

                if (page && !page.isClosed()) await page.close();
                if (browser) await browser.close();
                return;

                await logPerformance(iterationStart, iteration, true);
                successCount += 1;
            } catch (error) {
                console.error(`Lỗi khi cào dữ liệu ngày ${date}:`, error.message);
                await logPerformance(iterationStart, iteration, false);
                errorCount += 1;
            }
        };

        await scrapeAndSave();
        if (!isStopped) {
            intervalId = setInterval(scrapeAndSave, intervalMs);
        }

        setTimeout(async () => {
            if (!isStopped) {
                isStopped = true;
                clearInterval(intervalId);
                console.log(`Dữ liệu ngày ${date} cho ${station} dừng sau 20 phút.`);
                await saveToMongoDB(formattedResult);
                await setRedisExpiration(formatDateToDDMMYYYY(dateObj));

                const totalDuration = (Date.now() - startTime) / 1000;
                const stats = await pidusage(process.pid);
                console.log('Tổng hiệu suất scraper:', {
                    totalDuration: `${totalDuration.toFixed(2)}s`,
                    cpu: `${stats.cpu.toFixed(2)}%`,
                    memory: `${(stats.memory / 1024 / 1024).toFixed(2)}MB`,
                    totalIterations: iteration,
                    successCount,
                    errorCount,
                });

                if (page && !page.isClosed()) await page.close();
                if (browser) await browser.close();
            }
        }, 20 * 60 * 1000);

    } catch (error) {
        console.error(`Lỗi khi khởi động scraper ngày ${date}:`, error.message);
        isStopped = true;
        await setRedisExpiration(formatDateToDDMMYYYY(dateObj || new Date()));
        if (page && !page.isClosed()) await page.close();
        if (browser) await browser.close();
    }
}

module.exports = { scrapeXSMB };

const [, , date, station, testMode] = process.argv;
if (date && station) {
    const isTestMode = testMode === 'test';
    console.log(`Chạy thủ công cho ngày ${date} và đài ${station}${isTestMode ? ' (chế độ thử nghiệm)' : ''}`);
    scrapeXSMB(date, station, isTestMode);
} else {
    console.log('Chạy thủ công: node scraper.js 24/01/2025 xsmb [test]');
}

process.on('SIGINT', async () => {
    await redisClient.quit();
    console.log('Đã đóng kết nối Redis MIỀN BẮC');
    process.exit(0);
});
// Mã này cào XSMB theo ngày