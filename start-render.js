/**
 * Optimized startup script for Render deployment
 */

// Set production environment
process.env.NODE_ENV = 'production';

// Optimize for production
process.env.NODE_OPTIONS = '--max-old-space-size=1024';

// Disable Puppeteer in production if not needed
if (process.env.DISABLE_PUPPETEER === 'true') {
    process.env.PUPPETEER_SKIP_CHROMIUM_DOWNLOAD = 'true';
}

console.log('🚀 Starting optimized server for Render...');
console.log('📊 Memory limit:', process.env.NODE_OPTIONS);
console.log('🌍 Environment:', process.env.NODE_ENV);

// Start the main server
require('./server.js');
