/**
 * Keep-Alive Middleware
 * Tự động ping service để tránh cold start
 */

const keepAliveManager = {
    // Keep track of last activity
    lastActivity: Date.now(),
    isActive: true,

    // Update activity timestamp
    updateActivity() {
        this.lastActivity = Date.now();
        this.isActive = true;
    },

    // Check if service is active (within last 5 minutes)
    isServiceActive() {
        const fiveMinutes = 5 * 60 * 1000;
        return (Date.now() - this.lastActivity) < fiveMinutes;
    },

    // Get service status
    getStatus() {
        return {
            isActive: this.isServiceActive(),
            lastActivity: new Date(this.lastActivity).toISOString(),
            inactiveTime: Date.now() - this.lastActivity,
            uptime: process.uptime()
        };
    }
};

/**
 * Keep-alive middleware
 * Tự động cập nhật timestamp khi có request
 */
const keepAliveMiddleware = (req, res, next) => {
    // Update activity timestamp for all requests
    keepAliveManager.updateActivity();

    // Add keep-alive headers
    res.setHeader('X-Keep-Alive', 'true');
    res.setHeader('X-Last-Activity', new Date(keepAliveManager.lastActivity).toISOString());

    next();
};

/**
 * Self-ping mechanism
 * Tự động ping chính nó để giữ service active
 */
const selfPingInterval = setInterval(async () => {
    try {
        // Chỉ ping nếu service không active trong 3 phút
        if (!keepAliveManager.isServiceActive()) {
            console.log('🔄 Service inactive, performing self-ping...');

            // Ping health endpoint
            const http = require('http');
            const port = process.env.PORT || 5000;
            const options = {
                hostname: 'localhost',
                port: port,
                path: '/ping',
                method: 'GET',
                timeout: 5000
            };

            const req = http.request(options, (res) => {
                console.log(`✅ Self-ping successful: ${res.statusCode}`);
                keepAliveManager.updateActivity();
            });

            req.on('error', (err) => {
                console.log('❌ Self-ping failed:', err.message);
            });

            req.on('timeout', () => {
                console.log('⏰ Self-ping timeout');
                req.destroy();
            });

            req.end();
        }
    } catch (error) {
        console.error('Self-ping error:', error);
    }
}, 2 * 60 * 1000); // Ping every 2 minutes

/**
 * Graceful shutdown
 */
process.on('SIGTERM', () => {
    console.log('🛑 Shutting down keep-alive manager...');
    clearInterval(selfPingInterval);
});

process.on('SIGINT', () => {
    console.log('🛑 Shutting down keep-alive manager...');
    clearInterval(selfPingInterval);
});

module.exports = {
    keepAliveMiddleware,
    keepAliveManager,
    selfPingInterval
};
