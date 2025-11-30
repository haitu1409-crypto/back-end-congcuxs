const puppeteer = require('puppeteer');
const path = require('path');

/**
 * Service để generate hình ảnh từ các box thống kê trong ThongKeNhanh component
 */
class ThongKeImageGeneratorService {
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
     * Generate HTML template từ HTML string của box thống kê
     * @param {string} boxHTML - HTML string của box cần chụp
     * @param {string} boxId - ID của box để selector (optional)
     * @returns {string} HTML template hoàn chỉnh
     */
    generateHTMLTemplate(boxHTML, boxId = null) {
        // Extract inline styles từ HTML và convert thành CSS
        // Vì React component sử dụng inline styles, chúng ta cần đảm bảo render đúng
        
        const html = `
<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Thống Kê Nhanh</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap" rel="stylesheet">
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: "Roboto", "Segoe UI", "Arial Unicode MS", "Tahoma", "Verdana", sans-serif;
            background: #ffffff;
            padding: 20px;
            margin: 0;
            display: flex;
            justify-content: center;
            align-items: flex-start;
            min-height: 100vh;
        }
        
        .container {
            max-width: 100%;
            width: 100%;
            margin: 0 auto;
            padding: 0;
        }
        
        /* Đảm bảo tất cả elements hiển thị đúng */
        div {
            display: block;
        }
        
        span {
            display: inline;
        }
        
        ul, ol {
            display: block;
            list-style-position: inside;
        }
        
        li {
            display: list-item;
        }
        
        table {
            display: table;
            border-collapse: collapse;
        }
        
        tr {
            display: table-row;
        }
        
        td, th {
            display: table-cell;
        }
        
        /* Đảm bảo flexbox hoạt động */
        [style*="display: flex"] {
            display: flex !important;
        }
        
        [style*="display: inline-flex"] {
            display: inline-flex !important;
        }
        
        /* Đảm bảo text rendering tốt */
        * {
            -webkit-font-smoothing: antialiased;
            -moz-osx-font-smoothing: grayscale;
            text-rendering: optimizeLegibility;
        }
    </style>
</head>
<body>
    <div class="container" id="thongke-container">
        ${boxHTML}
    </div>
</body>
</html>
        `;

        return html;
    }

    /**
     * Generate hình ảnh từ HTML string của box thống kê
     * @param {string} boxHTML - HTML string của box cần chụp
     * @param {string} boxId - ID hoặc class selector của box (optional, mặc định sẽ tìm element đầu tiên có border)
     * @param {Object} options - Options cho screenshot
     * @returns {Promise<Buffer>} Buffer của hình ảnh PNG
     */
    async generateImage(boxHTML, boxId = null, options = {}) {
        if (!boxHTML) {
            throw new Error('Không có HTML để generate hình ảnh');
        }

        const browser = await this.initBrowser();
        const page = await browser.newPage();

        try {
            // Generate HTML template
            const html = this.generateHTMLTemplate(boxHTML, boxId);

            // Disable các resource không cần thiết để tăng tốc
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

            // Set viewport đủ lớn
            await page.setViewport({
                width: options.width || 1800,
                height: options.height || 2000,
                deviceScaleFactor: options.deviceScaleFactor || 2
            });

            // Set content và chờ render
            await page.setContent(html, {
                waitUntil: 'load',
                timeout: 15000
            });

            // Chờ element xuất hiện - thử nhiều selector
            const selectors = boxId 
                ? [boxId, `#${boxId}`, `.${boxId}`]
                : ['.container > div:first-child', '.container > div', '#thongke-container > div:first-child'];
            
            let elementFound = false;
            for (const sel of selectors) {
                try {
                    await page.waitForSelector(sel, { timeout: 2000 });
                    elementFound = true;
                    break;
                } catch (e) {
                    // Continue to next selector
                }
            }
            
            if (!elementFound) {
                console.warn('[ThongKeImage] Không tìm thấy element với các selector đã thử, tiếp tục với element đầu tiên');
            }
            
            // Chờ render CSS và fonts
            await new Promise(resolve => setTimeout(resolve, 800));

            // Lấy vị trí và kích thước thực tế của box
            const boxInfo = await page.evaluate((sel) => {
                const element = document.querySelector(sel);
                const container = document.querySelector('.container');
                if (!element || !container) {
                    return {
                        x: 0,
                        y: 0,
                        width: 1200,
                        height: 1500
                    };
                }
                
                const elementRect = element.getBoundingClientRect();
                const containerRect = container.getBoundingClientRect();
                
                // Tính vị trí relative đến viewport
                const padding = 20;
                return {
                    x: Math.max(0, elementRect.left - padding),
                    y: Math.max(0, elementRect.top - padding),
                    width: Math.ceil(elementRect.width + padding * 2),
                    height: Math.ceil(elementRect.height + padding * 2)
                };
            }, selector);

            // Screenshot với vị trí và kích thước chính xác của box
            const screenshot = await page.screenshot({
                type: 'png',
                clip: {
                    x: Math.max(0, Math.floor(boxInfo.x)),
                    y: Math.max(0, Math.floor(boxInfo.y)),
                    width: Math.min(boxInfo.width, options.maxWidth || 1800),
                    height: Math.min(boxInfo.height, options.maxHeight || 3000)
                },
                omitBackground: false,
                fullPage: false
            });

            return screenshot;
        } finally {
            await page.close();
        }
    }

    /**
     * Generate nhiều hình ảnh từ nhiều box HTML
     * @param {Array<{html: string, id?: string, options?: Object}>} boxes - Mảng các box cần chụp
     * @returns {Promise<Array<Buffer>>} Mảng các Buffer hình ảnh PNG
     */
    async generateMultipleImages(boxes) {
        if (!Array.isArray(boxes) || boxes.length === 0) {
            throw new Error('Không có box nào để generate hình ảnh');
        }

        const browser = await this.initBrowser();
        const results = [];

        try {
            for (const box of boxes) {
                const page = await browser.newPage();
                try {
                    const html = this.generateHTMLTemplate(box.html, box.id);

                    await page.setRequestInterception(true);
                    page.on('request', (req) => {
                        const resourceType = req.resourceType();
                        if (['image', 'font', 'media'].includes(resourceType)) {
                            req.abort();
                        } else {
                            req.continue();
                        }
                    });

                    await page.setViewport({
                        width: box.options?.width || 1800,
                        height: box.options?.height || 2000,
                        deviceScaleFactor: box.options?.deviceScaleFactor || 2
                    });

                    await page.setContent(html, {
                        waitUntil: 'load',
                        timeout: 15000
                    });

                    const selector = box.id || '.container > div:first-child';
                    await page.waitForSelector(selector, { timeout: 5000 }).catch(() => {});
                    await new Promise(resolve => setTimeout(resolve, 500));

                    const boxInfo = await page.evaluate((sel) => {
                        const element = document.querySelector(sel);
                        if (!element) {
                            return { x: 0, y: 0, width: 1200, height: 1500 };
                        }
                        const rect = element.getBoundingClientRect();
                        const padding = 20;
                        return {
                            x: Math.max(0, rect.left - padding),
                            y: Math.max(0, rect.top - padding),
                            width: Math.ceil(rect.width + padding * 2),
                            height: Math.ceil(rect.height + padding * 2)
                        };
                    }, selector);

                    const screenshot = await page.screenshot({
                        type: 'png',
                        clip: {
                            x: Math.max(0, Math.floor(boxInfo.x)),
                            y: Math.max(0, Math.floor(boxInfo.y)),
                            width: Math.min(boxInfo.width, box.options?.maxWidth || 1800),
                            height: Math.min(boxInfo.height, box.options?.maxHeight || 3000)
                        },
                        omitBackground: false,
                        fullPage: false
                    });

                    results.push(screenshot);
                } finally {
                    await page.close();
                }
            }
        } catch (error) {
            throw new Error(`Lỗi khi generate hình ảnh: ${error.message}`);
        }

        return results;
    }
}

module.exports = new ThongKeImageGeneratorService();

