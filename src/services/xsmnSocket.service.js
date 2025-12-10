/**
 * XSMN Socket Service - Real-time lottery results via Socket.io
 * Namespace: /lottery-xsmn (public, không cần authentication)
 * Hỗ trợ nhiều tỉnh mỗi ngày (3-4 tỉnh)
 */

const { getIO } = require('./socket.service');
const XSMN = require('../models/xsmn.models');

class XSMNSocketService {
    constructor() {
        this.io = null;
        this.lotteryNamespace = null;
        this.connectedClients = new Set();
        this.latestSnapshotByProvince = {}; // Cache theo từng tỉnh
        
        // 🚀 OPTIMIZATION: Cache latest result để giảm DB queries
        this.latestResultCacheByProvince = {}; // Cache theo tỉnh
        this.cacheExpiryByProvince = {}; // Expiry theo tỉnh
        this.CACHE_TTL_MS = 5000; // Cache 5 giây
        
        // 🚀 OPTIMIZATION: Rate limiting per IP
        this.connectionRateLimiter = new Map(); // IP -> timestamp[]
        this.MAX_CONNECTIONS_PER_IP = 5;
        this.CONNECTION_WINDOW_MS = 60000; // 1 minute window
        
        // 🚀 OPTIMIZATION: Batch latest requests
        this.pendingLatestRequests = new Set();
        this.latestRequestBatchTimeout = null;
        this.BATCH_DELAY_MS = 100;
        
        // 🚀 OPTIMIZATION: Connection monitoring
        this.startConnectionMonitor();
    }

    /**
     * Khởi tạo XSMN namespace
     */
    init() {
        const mainIO = getIO();
        if (!mainIO) {
            console.log('⏳ Socket.io chưa sẵn sàng, đợi 2 giây...');
            setTimeout(() => this.init(), 2000);
            return;
        }

        this.io = mainIO;

        // Tạo namespace /lottery-xsmn (public, không cần auth)
        this.lotteryNamespace = this.io.of('/lottery-xsmn');
        this.setupSocketHandlers();

        console.log('✅ XSMN Socket Service đã được khởi tạo (namespace: /lottery-xsmn)');
    }

    /**
     * Setup socket handlers cho namespace /lottery-xsmn
     */
    setupSocketHandlers() {
        if (!this.lotteryNamespace) return;

        this.lotteryNamespace.on('connection', (socket) => {
            // 🚀 OPTIMIZATION: Rate limiting per IP
            const clientIP = socket.handshake.address || socket.request.connection.remoteAddress || 'unknown';
            const now = Date.now();
            
            if (!this.connectionRateLimiter.has(clientIP)) {
                this.connectionRateLimiter.set(clientIP, []);
            }
            
            const connections = this.connectionRateLimiter.get(clientIP);
            const recentConnections = connections.filter(
                ts => now - ts < this.CONNECTION_WINDOW_MS
            );
            
            if (recentConnections.length >= this.MAX_CONNECTIONS_PER_IP) {
                console.warn(`⚠️ Rate limit: IP ${clientIP} có quá nhiều connections (${recentConnections.length}), disconnect`);
                socket.emit('xsmn:error', { message: 'Quá nhiều kết nối từ IP này' });
                socket.disconnect();
                return;
            }
            
            recentConnections.push(now);
            this.connectionRateLimiter.set(clientIP, recentConnections);
            
            this.connectedClients.add(socket.id);
            const station = 'xsmn';
            const roomName = `lottery:${station}`;

            socket.join(roomName);
            console.log(`✅ Client ${socket.id} đã kết nối đến /lottery-xsmn namespace, tham gia room: ${roomName}`);

            // Gửi kết quả mới nhất cho tất cả tỉnh
            this.sendLatestResults(socket);

            // Ping/Pong để kiểm tra kết nối
            socket.on('xsmn:ping', () => {
                socket.emit('xsmn:pong', { timestamp: Date.now() });
            });

            // Client yêu cầu dữ liệu mới nhất cho một tỉnh cụ thể
            socket.on('xsmn:get-latest', async (data) => {
                const { tinh } = data || {};
                await this.sendLatestResults(socket, tinh);
            });

            // Client yêu cầu dữ liệu cho tất cả tỉnh hôm nay
            socket.on('xsmn:get-all-provinces', async () => {
                await this.sendLatestResults(socket);
            });

            // Xử lý disconnect
            socket.on('disconnect', (reason) => {
                this.connectedClients.delete(socket.id);
                this.pendingLatestRequests.delete(socket);
                console.log(`❌ Client ${socket.id} đã ngắt kết nối khỏi /lottery-xsmn: ${reason}`);
            });
        });
    }

    /**
     * Gửi kết quả mới nhất cho client (tất cả tỉnh hoặc tỉnh cụ thể)
     */
    async sendLatestResults(socket, specificTinh = null) {
        this.pendingLatestRequests.add(socket);
        
        if (this.latestRequestBatchTimeout) {
            clearTimeout(this.latestRequestBatchTimeout);
        }
        
        this.latestRequestBatchTimeout = setTimeout(async () => {
            await this.processBatchLatestRequests(specificTinh);
        }, this.BATCH_DELAY_MS);
    }
    
    /**
     * Process batch latest requests
     */
    async processBatchLatestRequests(specificTinh = null) {
        if (this.pendingLatestRequests.size === 0) return;
        
        const sockets = Array.from(this.pendingLatestRequests);
        this.pendingLatestRequests.clear();
        
        const activeSockets = sockets.filter(socket => socket.connected);
        if (activeSockets.length === 0) return;
        
        try {
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            // Lấy tất cả kết quả XSMN hôm nay
            const results = await XSMN.find({
                drawDate: { $gte: today },
                station: 'xsmn'
            }).sort({ createdAt: -1 }).lean();

            // Nhóm theo tỉnh
            const resultsByProvince = {};
            results.forEach(result => {
                const tinh = result.tinh;
                if (!resultsByProvince[tinh] || 
                    new Date(result.createdAt) > new Date(resultsByProvince[tinh].createdAt)) {
                    resultsByProvince[tinh] = result;
                }
            });

            // Format và gửi cho từng socket
            activeSockets.forEach(socket => {
                if (!socket.connected) return;

                if (specificTinh) {
                    // Gửi cho tỉnh cụ thể
                    const result = resultsByProvince[specificTinh];
                    if (result) {
                        const payload = this.formatResultForClient(result);
                        socket.emit('xsmn:latest', { [specificTinh]: payload });
                    }
                } else {
                    // Gửi tất cả tỉnh
                    const payload = {};
                    Object.keys(resultsByProvince).forEach(tinh => {
                        payload[tinh] = this.formatResultForClient(resultsByProvince[tinh]);
                    });
                    socket.emit('xsmn:latest-all', payload);
                }
            });

            console.log(`📤 Sent latest results to ${activeSockets.length} clients (${specificTinh ? specificTinh : 'all provinces'})`);
        } catch (error) {
            console.error('❌ Lỗi khi batch process latest requests:', error);
        }
    }

    /**
     * Emit prize update cho một tỉnh cụ thể
     */
    async emitPrizeUpdate(prizeType, prizeData, fullResult) {
        if (!this.lotteryNamespace) {
            console.warn('⚠️ XSMN namespace chưa được khởi tạo');
            return;
        }

        const station = 'xsmn';
        const roomName = `lottery:${station}`;
        const tinh = fullResult?.tinh || '';
        const tentinh = fullResult?.tentinh || '';
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const data = {
            prizeType,
            prizeData,
            drawDate: fullResult?.drawDate || today,
            tentinh,
            tinh,
            year: fullResult?.year || today.getFullYear(),
            month: fullResult?.month || (today.getMonth() + 1),
            timestamp: Date.now(),
            [prizeType]: prizeData
        };

        // Emit vào room chung và room riêng cho tỉnh
        this.lotteryNamespace.to(roomName).emit('xsmn:prize-update', data);
        if (tinh) {
            this.lotteryNamespace.to(`${roomName}:${tinh}`).emit('xsmn:prize-update', data);
        }
        
        console.log(`📡 Đã emit prize update cho tỉnh ${tentinh} (${tinh}): ${prizeType} = ${prizeData}`);

        if (fullResult) {
            this.latestSnapshotByProvince[tinh] = this.formatResultForClient(fullResult);
            // Invalidate cache
            this.latestResultCacheByProvince[tinh] = null;
            this.cacheExpiryByProvince[tinh] = null;
        }
    }

    /**
     * Emit full result update cho một tỉnh (khi kết quả đầy đủ)
     */
    async emitFullResultUpdate(result) {
        if (!this.lotteryNamespace) {
            console.warn('⚠️ XSMN namespace chưa được khởi tạo');
            return;
        }

        const station = 'xsmn';
        const roomName = `lottery:${station}`;
        const tinh = result.tinh || '';
        const formatted = this.formatResultForClient(result);
        
        this.latestSnapshotByProvince[tinh] = formatted;
        
        // Update cache
        this.latestResultCacheByProvince[tinh] = formatted;
        this.cacheExpiryByProvince[tinh] = Date.now() + this.CACHE_TTL_MS;

        // Emit vào room chung và room riêng cho tỉnh
        this.lotteryNamespace.to(roomName).emit('xsmn:complete', formatted);
        this.lotteryNamespace.to(roomName).emit('xsmn:full-update', formatted);
        if (tinh) {
            this.lotteryNamespace.to(`${roomName}:${tinh}`).emit('xsmn:complete', formatted);
            this.lotteryNamespace.to(`${roomName}:${tinh}`).emit('xsmn:full-update', formatted);
        }
        
        console.log(`📡 Đã emit full result update cho tỉnh ${result.tentinh} (${tinh})`);
    }

    /**
     * Format result cho client (chuyển từ array sang format _0, _1, ...)
     */
    formatResultForClient(result) {
        const formatted = {
            drawDate: result.drawDate,
            station: result.station || 'xsmn',
            dayOfWeek: result.dayOfWeek || '',
            tentinh: result.tentinh || '',
            tinh: result.tinh || '',
            year: result.year || new Date().getFullYear(),
            month: result.month || (new Date().getMonth() + 1),
            lastUpdated: result.updatedAt?.getTime() || result.createdAt?.getTime() || Date.now(),
            isComplete: this.isDataComplete(result)
        };

        // Format specialPrize
        if (Array.isArray(result.specialPrize) && result.specialPrize.length > 0) {
            formatted.specialPrize_0 = result.specialPrize[0];
        } else {
            formatted.specialPrize_0 = '...';
        }

        // Format firstPrize
        if (Array.isArray(result.firstPrize) && result.firstPrize.length > 0) {
            formatted.firstPrize_0 = result.firstPrize[0];
        } else {
            formatted.firstPrize_0 = '...';
        }

        // Format secondPrize
        if (Array.isArray(result.secondPrize) && result.secondPrize.length > 0) {
            formatted.secondPrize_0 = result.secondPrize[0] || '...';
        } else {
            formatted.secondPrize_0 = '...';
        }

        // Format threePrizes (2 giải)
        if (Array.isArray(result.threePrizes)) {
            for (let i = 0; i < 2; i++) {
                formatted[`threePrizes_${i}`] = result.threePrizes[i] || '...';
            }
        } else {
            for (let i = 0; i < 2; i++) {
                formatted[`threePrizes_${i}`] = '...';
            }
        }

        // Format fourPrizes (7 giải)
        if (Array.isArray(result.fourPrizes)) {
            for (let i = 0; i < 7; i++) {
                formatted[`fourPrizes_${i}`] = result.fourPrizes[i] || '...';
            }
        } else {
            for (let i = 0; i < 7; i++) {
                formatted[`fourPrizes_${i}`] = '...';
            }
        }

        // Format fivePrizes (1 giải)
        if (Array.isArray(result.fivePrizes) && result.fivePrizes.length > 0) {
            formatted.fivePrizes_0 = result.fivePrizes[0] || '...';
        } else {
            formatted.fivePrizes_0 = '...';
        }

        // Format sixPrizes (3 giải)
        if (Array.isArray(result.sixPrizes)) {
            for (let i = 0; i < 3; i++) {
                formatted[`sixPrizes_${i}`] = result.sixPrizes[i] || '...';
            }
        } else {
            for (let i = 0; i < 3; i++) {
                formatted[`sixPrizes_${i}`] = '...';
            }
        }

        // Format sevenPrizes (1 giải)
        if (Array.isArray(result.sevenPrizes) && result.sevenPrizes.length > 0) {
            formatted.sevenPrizes_0 = result.sevenPrizes[0] || '...';
        } else {
            formatted.sevenPrizes_0 = '...';
        }

        // Format eightPrizes (1 giải)
        if (Array.isArray(result.eightPrizes) && result.eightPrizes.length > 0) {
            formatted.eightPrizes_0 = result.eightPrizes[0] || '...';
        } else {
            formatted.eightPrizes_0 = '...';
        }

        return formatted;
    }

    /**
     * Tạo empty result structure cho một tỉnh
     */
    createEmptyResult(tentinh = '', tinh = '') {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        return {
            drawDate: today,
            station: 'xsmn',
            dayOfWeek: today.toLocaleString('vi-VN', { weekday: 'long' }),
            tentinh,
            tinh,
            year: today.getFullYear(),
            month: today.getMonth() + 1,
            specialPrize_0: '...',
            firstPrize_0: '...',
            secondPrize_0: '...',
            threePrizes_0: '...',
            threePrizes_1: '...',
            fourPrizes_0: '...',
            fourPrizes_1: '...',
            fourPrizes_2: '...',
            fourPrizes_3: '...',
            fourPrizes_4: '...',
            fourPrizes_5: '...',
            fourPrizes_6: '...',
            fivePrizes_0: '...',
            sixPrizes_0: '...',
            sixPrizes_1: '...',
            sixPrizes_2: '...',
            sevenPrizes_0: '...',
            eightPrizes_0: '...',
            lastUpdated: 0,
            isComplete: false
        };
    }

    /**
     * Kiểm tra dữ liệu đã đầy đủ chưa (cho XSMN)
     */
    isDataComplete(result) {
        if (!result) return false;

        const hasSpecialPrize = Array.isArray(result.specialPrize) &&
            result.specialPrize.length > 0 &&
            result.specialPrize[0] !== '...' &&
            /^\d+$/.test(result.specialPrize[0]);
        const hasFirstPrize = Array.isArray(result.firstPrize) &&
            result.firstPrize.length > 0 &&
            result.firstPrize[0] !== '...' &&
            /^\d+$/.test(result.firstPrize[0]);
        const hasSecondPrize = Array.isArray(result.secondPrize) &&
            result.secondPrize.length > 0 &&
            result.secondPrize[0] !== '...' &&
            /^\d+$/.test(result.secondPrize[0]);
        const hasThreePrizes = Array.isArray(result.threePrizes) &&
            result.threePrizes.length >= 2 &&
            result.threePrizes.every(p => p && p !== '...' && /^\d+$/.test(p));
        const hasFourPrizes = Array.isArray(result.fourPrizes) &&
            result.fourPrizes.length >= 7 &&
            result.fourPrizes.every(p => p && p !== '...' && /^\d+$/.test(p));
        const hasFivePrizes = Array.isArray(result.fivePrizes) &&
            result.fivePrizes.length > 0 &&
            result.fivePrizes[0] !== '...' &&
            /^\d+$/.test(result.fivePrizes[0]);
        const hasSixPrizes = Array.isArray(result.sixPrizes) &&
            result.sixPrizes.length >= 3 &&
            result.sixPrizes.every(p => p && p !== '...' && /^\d+$/.test(p));
        const hasSevenPrizes = Array.isArray(result.sevenPrizes) &&
            result.sevenPrizes.length > 0 &&
            result.sevenPrizes[0] !== '...' &&
            /^\d+$/.test(result.sevenPrizes[0]);
        const hasEightPrizes = Array.isArray(result.eightPrizes) &&
            result.eightPrizes.length > 0 &&
            result.eightPrizes[0] !== '...' &&
            /^\d+$/.test(result.eightPrizes[0]);

        return hasSpecialPrize && hasFirstPrize && hasSecondPrize &&
            hasThreePrizes && hasFourPrizes && hasFivePrizes &&
            hasSixPrizes && hasSevenPrizes && hasEightPrizes;
    }

    /**
     * Lấy số lượng client đang kết nối
     */
    getConnectedClientsCount() {
        return this.connectedClients.size;
    }
    
    /**
     * 🚀 OPTIMIZATION: Connection monitoring
     */
    startConnectionMonitor() {
        setInterval(() => {
            const connectedCount = this.connectedClients.size;
            const memoryUsage = process.memoryUsage();
            const memoryMB = Math.round(memoryUsage.heapUsed / 1024 / 1024);
            const memoryLimitMB = Math.round(memoryUsage.heapTotal / 1024 / 1024);
            
            console.log(`📊 XSMN Socket Stats:`, {
                connectedClients: connectedCount,
                memoryMB: `${memoryMB}MB / ${memoryLimitMB}MB`,
                cachedProvinces: Object.keys(this.latestSnapshotByProvince).length,
                pendingRequests: this.pendingLatestRequests.size
            });
            
            if (memoryUsage.heapUsed > 400 * 1024 * 1024) {
                console.warn('⚠️ Memory usage cao:', {
                    used: `${memoryMB}MB`,
                    total: `${memoryLimitMB}MB`,
                    connectedClients: connectedCount
                });
            }
            
            // Cleanup old rate limiter entries
            const now = Date.now();
            for (const [ip, timestamps] of this.connectionRateLimiter.entries()) {
                const recent = timestamps.filter(ts => now - ts < this.CONNECTION_WINDOW_MS);
                if (recent.length === 0) {
                    this.connectionRateLimiter.delete(ip);
                } else {
                    this.connectionRateLimiter.set(ip, recent);
                }
            }
        }, 30000);
    }
}

// Tạo singleton instance
const xsmnSocketService = new XSMNSocketService();

// Khởi tạo sau khi socket.io sẵn sàng
setTimeout(() => {
    xsmnSocketService.init();
}, 1000);

module.exports = xsmnSocketService;




