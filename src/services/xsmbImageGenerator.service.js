const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

/**
 * Service để generate hình ảnh kết quả XSMB từ HTML template
 */
class XSMBImageGeneratorService {
    constructor() {
        this.browser = null;
    }

    /**
     * Khởi tạo browser (reuse cho nhiều request)
     */
    async initBrowser() {
        if (!this.browser) {
            this.browser = await puppeteer.launch({
                headless: true,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-gpu',
                    '--disable-software-rasterizer',
                    '--disable-background-timer-throttling',
                    '--disable-backgrounding-occluded-windows',
                    '--disable-renderer-backgrounding',
                    '--disable-features=TranslateUI',
                    '--disable-ipc-flooding-protection',
                    '--disable-extensions',
                    '--disable-default-apps',
                    '--disable-sync'
                ],
                executablePath: process.env.CHROMIUM_PATH || process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
            });
        }
        return this.browser;
    }

    /**
     * Đóng browser
     */
    async closeBrowser() {
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
        }
    }

    /**
     * Tạo HTML template từ dữ liệu XSMB - Match 100% với LatestXSMBResults.js
     */
    generateHTMLTemplate(doc) {
        if (!doc) return '';

        // Helper để format mảng số
        const formatNumbers = (arr) => {
            if (!Array.isArray(arr) || arr.length === 0) return [];
            return arr.filter(Boolean);
        };

        // Format ngày - giống như component
        let resultDate = '';
        let dayOfWeek = '';
        if (doc.drawDate) {
            const date = new Date(doc.drawDate);
            resultDate = date.toLocaleDateString('vi-VN');
            // Format dayOfWeek giống component: "Thứ 2", "Thứ 3", ...
            const days = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
            dayOfWeek = days[date.getDay()] || '';
        }

        const specialPrize = formatNumbers(doc.specialPrize) || (doc.maDB ? [doc.maDB] : []);
        const firstPrize = formatNumbers(doc.firstPrize) || [];
        const secondPrize = formatNumbers(doc.secondPrize) || [];
        const threePrizes = formatNumbers(doc.threePrizes) || [];
        const fourPrizes = formatNumbers(doc.fourPrizes) || [];
        const fivePrizes = formatNumbers(doc.fivePrizes) || [];
        const sixPrizes = formatNumbers(doc.sixPrizes) || [];
        const sevenPrizes = formatNumbers(doc.sevenPrizes) || [];

        const html = `
<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Kết Quả XSMB</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: Arial, sans-serif;
            font-size: 14px;
            background: #ffffff;
            padding: 20px;
            margin: 0;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
        }
        
        .container {
            max-width: 100%;
            width: 100%;
            margin: 0 auto;
            padding: 0;
            display: flex;
            justify-content: center;
        }
        
        .horizontalLayout {
            display: flex;
            gap: 10px;
            align-items: flex-start;
        }
        
        .mainTableContainer {
            width: 100%;
            max-width: 100%;
            margin: 0 auto;
            display: flex;
            justify-content: center;
        }
        
        .sideTablesContainer {
            display: flex;
            flex-direction: row;
            gap: 10px;
            flex-shrink: 0;
            width: auto;
            justify-content: center;
        }
        
        .ketqua {
            border-collapse: collapse;
            margin: 0 auto;
            background: #ffffff;
            width: auto !important;
            max-width: 100%;
            display: table;
        }
        
        .ketqua th,
        .ketqua td {
            border: 1.5px solid blue;
            text-align: center;
            vertical-align: middle;
            font-size: 24px;
            font-weight: 600;
        }
        
        .kq_ngay {
            background: #D9EDF7 !important;
            color: #333333 !important;
            font-weight: bold;
            font-size: 20px;
            padding: 15px;
        }
        
        .leftcol {
            background: #D9EDF7 !important;
            color: #333333 !important;
            font-weight: bold;
            text-align: center;
            padding: 8px 12px;
            font-size: 22px;
            min-width: 60px;
        }
        
        .kqcell {
            background: #ffffff;
            color: #333333;
            font-weight: bold;
            padding: 10px 15px;
            font-size: 24px;
        }
        
        .kq_0 {
            background: #ffffff !important;
            color: #FF0000 !important;
            font-weight: bold !important;
        }
        
        .kq_1 {
            background: #ffffff !important;
        }
        
        .kq_2, .kq_3 {
            background: #ffffff !important;
        }
        
        .kq_4, .kq_5, .kq_6, .kq_7, .kq_8, .kq_9 {
            background: #ffffff !important;
        }
        
        .kq_10, .kq_11, .kq_12, .kq_13 {
            background: #ffffff !important;
        }
        
        .kq_14, .kq_15, .kq_16, .kq_17, .kq_18, .kq_19 {
            background: #ffffff !important;
        }
        
        .kq_20, .kq_21, .kq_22 {
            background: #ffffff !important;
        }
        
        .kq_23, .kq_24, .kq_25, .kq_26 {
            background: #ffffff !important;
        }
        
        .kq_maDB {
            background: #ffffff !important;
        }
        
        .lastrow td {
            border: none !important;
            background: transparent !important;
            height: 5px;
        }
        
        .dau {
            border-collapse: collapse;
            margin: 0;
            background: #ffffff;
            table-layout: fixed;
            width: auto;
            max-width: 170px;
            min-width: 160px;
            align-self: flex-start;
        }
        
        .dau th,
        .dau td {
            border: 1px solid orange;
            text-align: center;
            vertical-align: middle;
            font-size: 16px;
            font-weight: normal;
            padding: 8px 6px;
        }
        
        .dauDigitCol {
            width: 20px !important;
            max-width: 20px !important;
            min-width: 20px !important;
            padding: 4px 2px !important;
            font-size: 16px !important;
            text-align: center !important;
            background-color: #FFE4B5 !important;
            color: #333333 !important;
            border: 1px solid orange !important;
            font-weight: bold !important;
            white-space: nowrap !important;
        }
        
        .dauDataCol {
            width: 160px !important;
            max-width: 160px !important;
            padding: 8px 4px !important;
            font-size: 16px !important;
            text-align: left !important;
            background-color: #ffffff !important;
            color: #333333 !important;
            border: 1px solid orange !important;
            white-space: normal !important;
            word-wrap: break-word !important;
            overflow-wrap: break-word !important;
        }
        
        .dau th {
            background: #FFE4B5 !important;
            color: #333333 !important;
            font-weight: bold;
        }
        
        .dau_0, .dau_1, .dau_2, .dau_3, .dau_4, .dau_5, .dau_6, .dau_7, .dau_8, .dau_9 {
            background: #ffffff !important;
        }
        
        .dit {
            border-collapse: collapse;
            margin: 0;
            background: #ffffff;
            table-layout: fixed;
            width: auto;
            max-width: 170px;
            min-width: 160px;
            align-self: flex-start;
        }
        
        .dit th,
        .dit td {
            border: 1px solid purple;
            text-align: center;
            vertical-align: middle;
            font-size: 16px;
            font-weight: normal;
            padding: 8px 6px;
        }
        
        .ditDigitCol {
            width: 20px !important;
            max-width: 20px !important;
            min-width: 20px !important;
            padding: 4px 2px !important;
            font-size: 16px !important;
            text-align: center !important;
            background-color: #E6E6FA !important;
            color: #333333 !important;
            border: 1px solid purple !important;
            font-weight: bold !important;
            white-space: nowrap !important;
        }
        
        .ditDataCol {
            width: 160px !important;
            max-width: 160px !important;
            padding: 8px 4px !important;
            font-size: 16px !important;
            text-align: left !important;
            background-color: #ffffff !important;
            color: #333333 !important;
            border: 1px solid purple !important;
            white-space: normal !important;
            word-wrap: break-word !important;
            overflow-wrap: break-word !important;
        }
        
        .dit th {
            background: #E6E6FA !important;
            color: #333333 !important;
            font-weight: bold;
        }
        
        .dit_0, .dit_1, .dit_2, .dit_3, .dit_4, .dit_5, .dit_6, .dit_7, .dit_8, .dit_9 {
            background: #ffffff !important;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="mainTableContainer">
                <table class="ketqua" cellspacing="1" cellpadding="9">
                    <thead>
                        <tr>
                            <th colspan="13" class="kq_ngay">
                                ${dayOfWeek && resultDate ? `${dayOfWeek} - ${resultDate}` : (resultDate || 'Kết quả XSMB')}
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        ${specialPrize.length > 0 ? `
                        <tr>
                            <td class="leftcol">ĐB</td>
                            <td colspan="12" class="kqcell kq_0">${specialPrize[0]}</td>
                        </tr>
                        ` : ''}
                        
                        ${firstPrize.length > 0 ? `
                        <tr>
                            <td class="leftcol">1</td>
                            <td colspan="12" class="kqcell kq_1">${firstPrize[0]}</td>
                        </tr>
                        ` : ''}
                        
                        ${secondPrize.length > 0 ? `
                        <tr>
                            <td class="leftcol">2</td>
                            ${secondPrize.map((num, idx) => `
                                <td colspan="${12 / secondPrize.length}" class="kqcell kq_${idx + 2}">${num}</td>
                            `).join('')}
                        </tr>
                        ` : ''}
                        
                        ${threePrizes.length === 6 ? `
                        <tr>
                            <td rowspan="2" class="leftcol">3</td>
                            ${threePrizes.slice(0, 3).map((num, idx) => `
                                <td colspan="4" class="kqcell kq_${idx + 4}">${num}</td>
                            `).join('')}
                        </tr>
                        <tr>
                            ${threePrizes.slice(3, 6).map((num, idx) => `
                                <td colspan="4" class="kqcell kq_${idx + 7}">${num}</td>
                            `).join('')}
                        </tr>
                        ` : ''}
                        
                        ${fourPrizes.length > 0 ? `
                        <tr>
                            <td class="leftcol">4</td>
                            ${fourPrizes.map((num, idx) => `
                                <td colspan="3" class="kqcell kq_${idx + 10}">${num}</td>
                            `).join('')}
                        </tr>
                        ` : ''}
                        
                        ${fivePrizes.length === 6 ? `
                        <tr>
                            <td rowspan="2" class="leftcol">5</td>
                            ${fivePrizes.slice(0, 3).map((num, idx) => `
                                <td colspan="4" class="kqcell kq_${idx + 14}">${num}</td>
                            `).join('')}
                        </tr>
                        <tr>
                            ${fivePrizes.slice(3, 6).map((num, idx) => `
                                <td colspan="4" class="kqcell kq_${idx + 17}">${num}</td>
                            `).join('')}
                        </tr>
                        ` : ''}
                        
                        ${sixPrizes.length > 0 ? `
                        <tr>
                            <td class="leftcol">6</td>
                            ${sixPrizes.map((num, idx) => `
                                <td colspan="4" class="kqcell kq_${idx + 20}">${num}</td>
                            `).join('')}
                        </tr>
                        ` : ''}
                        
                        ${sevenPrizes.length > 0 ? `
                        <tr>
                            <td class="leftcol">7</td>
                            ${sevenPrizes.map((num, idx) => `
                                <td colspan="3" class="kqcell kq_${idx + 23}">${num}</td>
                            `).join('')}
                        </tr>
                        ` : ''}
                        
                        ${doc.maDB && doc.maDB !== specialPrize[0] ? `
                        <tr>
                            <td class="leftcol">ĐB</td>
                            <td colspan="12" class="kqcell kq_maDB">${doc.maDB}</td>
                        </tr>
                        ` : ''}
                        
                        <tr class="lastrow">
                            <td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td><td></td>
                        </tr>
                    </tbody>
                </table>
        </div>
    </div>
</body>
</html>
        `;

        return html;
    }

    /**
     * Generate hình ảnh từ dữ liệu XSMB
     * @param {Object} doc - Document XSMB từ database
     * @returns {Promise<Buffer>} Buffer của hình ảnh PNG
     */
    async generateImage(doc) {
        if (!doc) {
            throw new Error('Không có dữ liệu để generate hình ảnh');
        }

        const browser = await this.initBrowser();
        const page = await browser.newPage();

        try {
            // Generate HTML
            const html = this.generateHTMLTemplate(doc);

            // Disable các resource không cần thiết để tăng tốc (CSS đã inline rồi)
            await page.setRequestInterception(true);
            page.on('request', (req) => {
                const resourceType = req.resourceType();
                // Chỉ block image, font, media - không block stylesheet vì có thể cần
                if (['image', 'font', 'media'].includes(resourceType)) {
                    req.abort();
                } else {
                    req.continue();
                }
            });

            // Set viewport đủ lớn để chứa toàn bộ bảng
            await page.setViewport({
                width: 1800,
                height: 2000,
                deviceScaleFactor: 2
            });

            // Set content và chờ render - dùng 'load' thay vì 'networkidle0' để nhanh hơn
            await page.setContent(html, {
                waitUntil: 'load',
                timeout: 15000
            });

            // Chờ bảng xuất hiện thay vì fixed timeout
            await page.waitForSelector('.ketqua', { timeout: 5000 }).catch(() => {});
            
            // Chờ render CSS ngắn hơn
            await new Promise(resolve => setTimeout(resolve, 300));

            // Lấy vị trí và kích thước thực tế của bảng
            const tableInfo = await page.evaluate(() => {
                const table = document.querySelector('.ketqua');
                const container = document.querySelector('.container');
                if (!table || !container) {
                    return {
                        x: 0,
                        y: 0,
                        width: 1200,
                        height: 1500
                    };
                }
                
                const tableRect = table.getBoundingClientRect();
                const containerRect = container.getBoundingClientRect();
                
                // Tính vị trí relative đến viewport
                const padding = 20;
                return {
                    x: Math.max(0, tableRect.left - padding),
                    y: Math.max(0, tableRect.top - padding),
                    width: Math.ceil(tableRect.width + padding * 2),
                    height: Math.ceil(tableRect.height + padding * 2)
                };
            });

            // Screenshot với vị trí và kích thước chính xác của bảng
            // optimizeForSpeed: true để tăng tốc screenshot
            const screenshot = await page.screenshot({
                type: 'png',
                clip: {
                    x: Math.max(0, Math.floor(tableInfo.x)),
                    y: Math.max(0, Math.floor(tableInfo.y)),
                    width: Math.min(tableInfo.width, 1800),
                    height: Math.min(tableInfo.height, 3000)
                },
                omitBackground: false,
                fullPage: false
            });

            return screenshot;
        } finally {
            await page.close();
        }
    }
}

module.exports = new XSMBImageGeneratorService();

