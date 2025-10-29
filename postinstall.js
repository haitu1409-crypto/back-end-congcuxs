#!/usr/bin/env node

/**
 * Post-install script for Render deployment
 * Skip Puppeteer Chrome download in production
 */

const fs = require('fs');
const path = require('path');

// Skip Puppeteer download in production
if (process.env.NODE_ENV === 'production' || process.env.PUPPETEER_SKIP_DOWNLOAD === 'true') {
    console.log('🚀 Skipping Puppeteer Chrome download in production...');

    // Create a dummy chrome executable for Puppeteer
    const puppeteerPath = path.join(__dirname, 'node_modules', 'puppeteer', '.local-chromium');

    if (!fs.existsSync(puppeteerPath)) {
        fs.mkdirSync(puppeteerPath, { recursive: true });
    }

    console.log('✅ Puppeteer setup completed for production');
    process.exit(0);
}

console.log('📦 Puppeteer will download Chrome for development...');
