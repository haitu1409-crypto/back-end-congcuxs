/**
 * Puppeteer configuration for Render deployment
 */

const puppeteer = require('puppeteer-core');

const getPuppeteerConfig = () => {
    const isProduction = process.env.NODE_ENV === 'production';

    if (isProduction) {
        // Render.com configuration
        return {
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--single-process',
                '--disable-gpu',
                '--disable-background-timer-throttling',
                '--disable-backgrounding-occluded-windows',
                '--disable-renderer-backgrounding',
                '--disable-features=TranslateUI',
                '--disable-ipc-flooding-protection',
                '--disable-extensions',
                '--disable-plugins',
                '--disable-images',
                '--disable-javascript',
                '--disable-web-security',
                '--disable-features=VizDisplayCompositor'
            ],
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/google-chrome-stable',
            timeout: 30000
        };
    } else {
        // Local development configuration
        return {
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox'
            ],
            timeout: 30000
        };
    }
};

module.exports = {
    getPuppeteerConfig,
    puppeteer
};
