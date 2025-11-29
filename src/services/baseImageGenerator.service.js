const puppeteer = require('puppeteer');

/**
 * Base service cho tất cả image generators
 * Tối ưu: Share browser instance, cache, và common utilities
 */
class BaseImageGeneratorService {
    constructor() {
        // Shared browser instance cho tất cả generators
        this.browser = null;
        this.browserPromise = null;
        
        // Cache cho database queries (TTL: 5 phút)
        this.dataCache = new Map();
        this.cacheTTL = 5 * 60 * 1000; // 5 phút
    }

    /**
     * Khởi tạo browser (singleton, shared across all generators)
     */
    async initBrowser() {
        if (this.browser) {
            return this.browser;
        }
        
        if (this.browserPromise) {
            return this.browserPromise;
        }
        
        this.browserPromise = puppeteer.launch({
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
                    '--disable-sync',
                    '--disable-web-security',
                    '--disable-images', // Tối ưu: không load images
                    '--disable-javascript', // Tối ưu: không cần JS
                    '--disable-plugins', // Tối ưu: không cần plugins
                    '--disable-remote-fonts', // Tối ưu: không load remote fonts
                    '--disable-font-subpixel-positioning', // Tối ưu: render font nhanh hơn
                    '--disable-lcd-text', // Tối ưu: render text nhanh hơn
                    '--memory-pressure-off', // Tối ưu: tắt memory pressure
                    '--max_old_space_size=512' // Tối ưu: giới hạn memory
                ],
            executablePath: process.env.CHROMIUM_PATH || process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
        }).then(browser => {
            this.browser = browser;
            this.browserPromise = null;
            return browser;
        }).catch(error => {
            this.browserPromise = null;
            throw error;
        });
        
        return this.browserPromise;
    }

    /**
     * Đóng browser (chỉ đóng khi cần thiết)
     */
    async closeBrowser() {
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
        }
        this.browserPromise = null;
    }

    /**
     * Cache helper: Get cached data
     */
    getCachedData(key) {
        const cached = this.dataCache.get(key);
        if (!cached) return null;
        
        const now = Date.now();
        if (now - cached.timestamp > this.cacheTTL) {
            this.dataCache.delete(key);
            return null;
        }
        
        return cached.data;
    }

    /**
     * Cache helper: Set cached data
     */
    setCachedData(key, data) {
        this.dataCache.set(key, {
            data,
            timestamp: Date.now()
        });
    }

    /**
     * Clear cache (có thể gọi khi cần refresh data)
     */
    clearCache() {
        this.dataCache.clear();
    }

    /**
     * Generate ảnh từ HTML template (common logic)
     * Tối ưu: Reuse browser, optimize Puppeteer settings
     */
    async generateImageFromHTML(html, options = {}) {
        const {
            viewportWidth = 900,
            viewportHeight = 4000,
            deviceScaleFactor = 1.5, // Giảm từ 2 xuống 1.5 để nhanh hơn, vẫn đảm bảo chất lượng tốt
            waitTime = 100, // Giảm từ 200ms xuống 100ms
            timeout = 6000 // Giảm từ 8000ms xuống 6000ms
        } = options;

        const browser = await this.initBrowser();
        const page = await browser.newPage();

        try {
            // Tối ưu: Disable JavaScript và các resource không cần thiết
            await page.setJavaScriptEnabled(false);
            
            // Block các resource không cần thiết để tăng tốc
            await page.setRequestInterception(true);
            page.on('request', (req) => {
                const resourceType = req.resourceType();
                const url = req.url();
                // Block images, fonts, media, websocket nhưng giữ CSS và HTML
                if (['image', 'font', 'media', 'websocket', 'stylesheet'].includes(resourceType) || 
                    url.includes('google-analytics') || 
                    url.includes('facebook') ||
                    url.includes('doubleclick')) {
                    req.abort();
                } else {
                    req.continue();
                }
            });

            // Set viewport
            await page.setViewport({
                width: viewportWidth,
                height: viewportHeight,
                deviceScaleFactor
            });

            // Load HTML với timeout ngắn hơn và không chờ network
            await page.setContent(html, {
                waitUntil: 'domcontentloaded', // Nhanh nhất
                timeout
            });

            // Đợi box xuất hiện thay vì fixed timeout (nhanh hơn)
            try {
                await page.waitForSelector('.box', { timeout: 2000 });
            } catch (e) {
                // Nếu không tìm thấy, đợi một chút rồi thử lại
                await new Promise(resolve => setTimeout(resolve, waitTime));
            }

            // Lấy thông tin box để clip
            const boxInfo = await page.evaluate(() => {
                const box = document.querySelector('.box');
                if (!box) return null;
                const rect = box.getBoundingClientRect();
                return {
                    x: Math.max(0, rect.x),
                    y: Math.max(0, rect.y),
                    width: rect.width,
                    height: rect.height
                };
            });

            if (!boxInfo) {
                throw new Error('Không tìm thấy box để chụp ảnh');
            }

            // Chụp ảnh với clip và tối ưu options
            const screenshot = await page.screenshot({
                type: 'png',
                clip: {
                    x: Math.floor(boxInfo.x),
                    y: Math.floor(boxInfo.y),
                    width: Math.min(Math.ceil(boxInfo.width), viewportWidth),
                    height: Math.min(Math.ceil(boxInfo.height), 5000)
                },
                fullPage: false,
                omitBackground: false
                // Note: optimizeForSpeed không có trong Puppeteer API, bỏ qua
            });

            return screenshot;
        } finally {
            await page.close();
        }
    }

    /**
     * Common HTML template base structure
     */
    getBaseHTMLTemplate(content, todayStr) {
        return `
<!DOCTYPE html>
<html lang="vi">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Thống Kê</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: Arial, sans-serif;
            background: #ffffff;
            padding: 20px;
            margin: 0;
            display: flex;
            justify-content: center;
            align-items: flex-start;
        }
        
        .container {
            max-width: 800px;
            width: 100%;
            margin: 0 auto;
            padding: 0;
        }
        
        .box {
            border: 1px solid rgb(196, 210, 227);
            background: #FFFFFF;
            margin: 0;
            font-size: 13px;
            line-height: 1.5;
            width: 100%;
            box-sizing: border-box;
        }
        
        .header {
            background: #3a8de0;
            color: #FFFFFF;
            font-weight: bold;
            padding: 6px 8px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            font-size: 18px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="box">
            <div class="header">
                <div>THỐNG KÊ NHANH CHO NGÀY ${todayStr}</div>
            </div>
            ${content}
        </div>
    </div>
</body>
</html>
        `;
    }
}

// Singleton instance - shared across all generators
let instance = null;

const getInstance = () => {
    if (!instance) {
        instance = new BaseImageGeneratorService();
    }
    return instance;
};

module.exports = getInstance();

