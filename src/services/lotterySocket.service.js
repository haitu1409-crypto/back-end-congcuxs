/**
 * Lottery Socket Service - Real-time lottery results via Socket.io
 * Namespace: /lottery (public, không cần authentication)
 */

const { getIO } = require('./socket.service');
const XSMB = require('../models/xsmb.model');

class LotterySocketService {
    constructor() {
        this.io = null;
        this.lotteryNamespace = null;
        this.connectedClients = new Set();
        this.latestSnapshot = this.createEmptyResult();
        
        // 🚀 OPTIMIZATION: Cache latest result để giảm DB queries
        this.latestResultCache = null;
        this.cacheExpiry = null;
        this.CACHE_TTL_MS = 5000; // Cache 5 giây
        
        // 🚀 OPTIMIZATION: Rate limiting per IP
        this.connectionRateLimiter = new Map(); // IP -> timestamp[]
        this.MAX_CONNECTIONS_PER_IP = 5; // Max 5 connections per IP trong 1 phút
        this.CONNECTION_WINDOW_MS = 60000; // 1 minute window
        
        // 🚀 OPTIMIZATION: Batch latest requests
        this.pendingLatestRequests = new Set();
        this.latestRequestBatchTimeout = null;
        this.BATCH_DELAY_MS = 100; // Batch requests trong 100ms
        
        // 🚀 OPTIMIZATION: Connection monitoring
        this.startConnectionMonitor();
    }

    /**
     * Khởi tạo lottery namespace
     */
    init() {
        const mainIO = getIO();
        if (!mainIO) {
            console.log('⏳ Socket.io chưa sẵn sàng, đợi 2 giây...');
            setTimeout(() => this.init(), 2000);
            return;
        }

        this.io = mainIO;

        // Tạo namespace /lottery (public, không cần auth)
        this.lotteryNamespace = this.io.of('/lottery');
        this.setupSocketHandlers();

        console.log('✅ Lottery Socket Service đã được khởi tạo (namespace: /lottery)');
    }

    /**
     * Setup socket handlers cho namespace /lottery
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
            // Remove old connections outside window
            const recentConnections = connections.filter(
                ts => now - ts < this.CONNECTION_WINDOW_MS
            );
            
            if (recentConnections.length >= this.MAX_CONNECTIONS_PER_IP) {
                console.warn(`⚠️ Rate limit: IP ${clientIP} có quá nhiều connections (${recentConnections.length}), disconnect`);
                socket.emit('lottery:error', { message: 'Quá nhiều kết nối từ IP này' });
                socket.disconnect();
                return;
            }
            
            recentConnections.push(now);
            this.connectionRateLimiter.set(clientIP, recentConnections);
            
            this.connectedClients.add(socket.id);
            const station = 'xsmb';
            const roomName = `lottery:${station}`;

            socket.join(roomName);
            console.log(`✅ Client ${socket.id} đã kết nối đến /lottery namespace, tham gia room: ${roomName}`);

            // 🚀 OPTIMIZATION: Batch latest requests thay vì gửi ngay
            this.sendLatestResult(socket);

            // Ping/Pong để kiểm tra kết nối
            socket.on('lottery:ping', () => {
                socket.emit('lottery:pong', { timestamp: Date.now() });
            });

            // Client yêu cầu dữ liệu mới nhất
            socket.on('lottery:get-latest', async () => {
                await this.sendLatestResult(socket);
            });

            // Xử lý disconnect
            socket.on('disconnect', (reason) => {
                this.connectedClients.delete(socket.id);
                // Remove from pending requests
                this.pendingLatestRequests.delete(socket);
                console.log(`❌ Client ${socket.id} đã ngắt kết nối khỏi /lottery: ${reason}`);
            });
        });
    }

    /**
     * Gửi kết quả mới nhất cho client
     * 🚀 OPTIMIZATION: Batch requests và cache để giảm DB queries
     */
    async sendLatestResult(socket) {
        // Add to pending batch
        this.pendingLatestRequests.add(socket);
        
        // Clear existing timeout
        if (this.latestRequestBatchTimeout) {
            clearTimeout(this.latestRequestBatchTimeout);
        }
        
        // Set new timeout để batch process
        this.latestRequestBatchTimeout = setTimeout(async () => {
            await this.processBatchLatestRequests();
        }, this.BATCH_DELAY_MS);
    }
    
    /**
     * Process batch latest requests - chỉ query DB 1 lần cho nhiều requests
     */
    async processBatchLatestRequests() {
        if (this.pendingLatestRequests.size === 0) return;
        
        const sockets = Array.from(this.pendingLatestRequests);
        this.pendingLatestRequests.clear();
        
        // Filter out disconnected sockets
        const activeSockets = sockets.filter(socket => socket.connected);
        
        if (activeSockets.length === 0) return;
        
        let payload;
        try {
            const now = Date.now();
            
            // 🚀 OPTIMIZATION: Use cache nếu còn valid
            if (this.latestResultCache && 
                this.cacheExpiry && 
                now < this.cacheExpiry) {
                payload = this.latestResultCache;
                console.log(`📦 Using cached latest result for ${activeSockets.length} clients`);
            } else {
                // Query DB chỉ khi cache expired
                const today = new Date();
                today.setHours(0, 0, 0, 0);

                const result = await XSMB.findOne({
                    drawDate: { $gte: today },
                    station: 'xsmb'
                }).sort({ createdAt: -1 }).lean();

                if (result) {
                    payload = this.formatResultForClient(result);
                    this.latestSnapshot = payload;
                } else if (this.latestSnapshot) {
                    payload = this.latestSnapshot;
                } else {
                    payload = this.createEmptyResult();
                    this.latestSnapshot = payload;
                }
                
                // Cache result
                this.latestResultCache = payload;
                this.cacheExpiry = now + this.CACHE_TTL_MS;
                console.log(`💾 Cached latest result, will expire in ${this.CACHE_TTL_MS}ms`);
            }
        } catch (error) {
            console.error('❌ Lỗi khi batch process latest requests:', error);
            payload = this.latestSnapshot || this.createEmptyResult();
        }
        
        // Send to all pending sockets
        activeSockets.forEach(socket => {
            if (socket.connected) {
                socket.emit('lottery:latest', payload);
            }
        });
        
        console.log(`📤 Sent latest result to ${activeSockets.length} clients (batch)`);
    }

    /**
     * Emit prize update (từng giải riêng lẻ)
     */
    async emitPrizeUpdate(prizeType, prizeData, fullResult) {
        if (!this.lotteryNamespace) {
            console.warn('⚠️ Lottery namespace chưa được khởi tạo');
            return;
        }

        const station = 'xsmb';
        const roomName = `lottery:${station}`;
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const data = {
            prizeType,
            prizeData,
            drawDate: fullResult?.drawDate || today,
            tentinh: fullResult?.tentinh || 'Miền Bắc',
            tinh: fullResult?.tinh || 'MB',
            year: fullResult?.year || today.getFullYear(),
            month: fullResult?.month || (today.getMonth() + 1),
            timestamp: Date.now(),
            [prizeType]: prizeData
        };

        this.lotteryNamespace.to(roomName).emit('lottery:prize-update', data);
        console.log(`📡 Đã emit prize update: ${prizeType} = ${prizeData}`);

        if (fullResult) {
            this.latestSnapshot = this.formatResultForClient(fullResult);
            // 🚀 OPTIMIZATION: Invalidate cache khi có update mới
            this.latestResultCache = null;
            this.cacheExpiry = null;
        }
    }

    /**
     * Emit full result update (khi kết quả đầy đủ)
     */
    async emitFullResultUpdate(result) {
        if (!this.lotteryNamespace) {
            console.warn('⚠️ Lottery namespace chưa được khởi tạo');
            return;
        }

        const station = 'xsmb';
        const roomName = `lottery:${station}`;
        const formatted = this.formatResultForClient(result);
        this.latestSnapshot = formatted;
        
        // 🚀 OPTIMIZATION: Update cache với result mới nhất
        this.latestResultCache = formatted;
        this.cacheExpiry = Date.now() + this.CACHE_TTL_MS;

        this.lotteryNamespace.to(roomName).emit('lottery:complete', formatted);
        this.lotteryNamespace.to(roomName).emit('lottery:full-update', formatted);
        console.log('📡 Đã emit full result update');
    }

    /**
     * Format result cho client (chuyển từ array sang format _0, _1, ...)
     */
    formatResultForClient(result) {
        const formatted = {
            drawDate: result.drawDate,
            station: result.station || 'xsmb',
            dayOfWeek: result.dayOfWeek || '',
            tentinh: result.tentinh || 'Miền Bắc',
            tinh: result.tinh || 'MB',
            year: result.year || new Date().getFullYear(),
            month: result.month || (new Date().getMonth() + 1),
            maDB: result.maDB || '...',
            lastUpdated: result.updatedAt?.getTime() || result.createdAt?.getTime() || Date.now(),
            isComplete: this.isDataComplete(result)
        };

        // Format prizes từ array sang format _0, _1, ...
        if (Array.isArray(result.specialPrize) && result.specialPrize.length > 0) {
            formatted.specialPrize_0 = result.specialPrize[0];
        } else {
            formatted.specialPrize_0 = '...';
        }

        if (Array.isArray(result.firstPrize) && result.firstPrize.length > 0) {
            formatted.firstPrize_0 = result.firstPrize[0];
        } else {
            formatted.firstPrize_0 = '...';
        }

        if (Array.isArray(result.secondPrize)) {
            formatted.secondPrize_0 = result.secondPrize[0] || '...';
            formatted.secondPrize_1 = result.secondPrize[1] || '...';
        } else {
            formatted.secondPrize_0 = '...';
            formatted.secondPrize_1 = '...';
        }

        if (Array.isArray(result.threePrizes)) {
            for (let i = 0; i < 6; i++) {
                formatted[`threePrizes_${i}`] = result.threePrizes[i] || '...';
            }
        } else {
            for (let i = 0; i < 6; i++) {
                formatted[`threePrizes_${i}`] = '...';
            }
        }

        if (Array.isArray(result.fourPrizes)) {
            for (let i = 0; i < 4; i++) {
                formatted[`fourPrizes_${i}`] = result.fourPrizes[i] || '...';
            }
        } else {
            for (let i = 0; i < 4; i++) {
                formatted[`fourPrizes_${i}`] = '...';
            }
        }

        if (Array.isArray(result.fivePrizes)) {
            for (let i = 0; i < 6; i++) {
                formatted[`fivePrizes_${i}`] = result.fivePrizes[i] || '...';
            }
        } else {
            for (let i = 0; i < 6; i++) {
                formatted[`fivePrizes_${i}`] = '...';
            }
        }

        if (Array.isArray(result.sixPrizes)) {
            for (let i = 0; i < 3; i++) {
                formatted[`sixPrizes_${i}`] = result.sixPrizes[i] || '...';
            }
        } else {
            for (let i = 0; i < 3; i++) {
                formatted[`sixPrizes_${i}`] = '...';
            }
        }

        if (Array.isArray(result.sevenPrizes)) {
            for (let i = 0; i < 4; i++) {
                formatted[`sevenPrizes_${i}`] = result.sevenPrizes[i] || '...';
            }
        } else {
            for (let i = 0; i < 4; i++) {
                formatted[`sevenPrizes_${i}`] = '...';
            }
        }

        return formatted;
    }

    /**
     * Tạo empty result structure
     */
    createEmptyResult() {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        return {
            drawDate: today,
            station: 'xsmb',
            dayOfWeek: today.toLocaleString('vi-VN', { weekday: 'long' }),
            tentinh: 'Miền Bắc',
            tinh: 'MB',
            year: today.getFullYear(),
            month: today.getMonth() + 1,
            maDB: '...',
            specialPrize_0: '...',
            firstPrize_0: '...',
            secondPrize_0: '...',
            secondPrize_1: '...',
            threePrizes_0: '...',
            threePrizes_1: '...',
            threePrizes_2: '...',
            threePrizes_3: '...',
            threePrizes_4: '...',
            threePrizes_5: '...',
            fourPrizes_0: '...',
            fourPrizes_1: '...',
            fourPrizes_2: '...',
            fourPrizes_3: '...',
            fivePrizes_0: '...',
            fivePrizes_1: '...',
            fivePrizes_2: '...',
            fivePrizes_3: '...',
            fivePrizes_4: '...',
            fivePrizes_5: '...',
            sixPrizes_0: '...',
            sixPrizes_1: '...',
            sixPrizes_2: '...',
            sevenPrizes_0: '...',
            sevenPrizes_1: '...',
            sevenPrizes_2: '...',
            sevenPrizes_3: '...',
            lastUpdated: 0,
            isComplete: false
        };
    }

    /**
     * Kiểm tra dữ liệu đã đầy đủ chưa
     */
    isDataComplete(result) {
        if (!result) return false;

        const hasMaDB = result.maDB && result.maDB !== '...' && !/\*+/.test(result.maDB);
        const hasSpecialPrize = Array.isArray(result.specialPrize) &&
            result.specialPrize.length > 0 &&
            result.specialPrize[0] !== '...';
        const hasFirstPrize = Array.isArray(result.firstPrize) &&
            result.firstPrize.length > 0 &&
            result.firstPrize[0] !== '...';
        const hasSecondPrize = Array.isArray(result.secondPrize) &&
            result.secondPrize.length >= 2 &&
            result.secondPrize[0] !== '...' &&
            result.secondPrize[1] !== '...';
        const hasThreePrizes = Array.isArray(result.threePrizes) &&
            result.threePrizes.length >= 6 &&
            result.threePrizes.every(p => p && p !== '...');
        const hasFourPrizes = Array.isArray(result.fourPrizes) &&
            result.fourPrizes.length >= 4 &&
            result.fourPrizes.every(p => p && p !== '...');
        const hasFivePrizes = Array.isArray(result.fivePrizes) &&
            result.fivePrizes.length >= 6 &&
            result.fivePrizes.every(p => p && p !== '...');
        const hasSixPrizes = Array.isArray(result.sixPrizes) &&
            result.sixPrizes.length >= 3 &&
            result.sixPrizes.every(p => p && p !== '...');
        const hasSevenPrizes = Array.isArray(result.sevenPrizes) &&
            result.sevenPrizes.length >= 4 &&
            result.sevenPrizes.every(p => p && p !== '...');

        return hasMaDB && hasSpecialPrize && hasFirstPrize && hasSecondPrize &&
            hasThreePrizes && hasFourPrizes && hasFivePrizes &&
            hasSixPrizes && hasSevenPrizes;
    }

    /**
     * Lấy số lượng client đang kết nối
     */
    getConnectedClientsCount() {
        return this.connectedClients.size;
    }
    
    /**
     * 🚀 OPTIMIZATION: Connection monitoring để theo dõi memory và connections
     */
    startConnectionMonitor() {
        // Monitor connections mỗi 30 giây
        setInterval(() => {
            const connectedCount = this.connectedClients.size;
            const memoryUsage = process.memoryUsage();
            const memoryMB = Math.round(memoryUsage.heapUsed / 1024 / 1024);
            const memoryLimitMB = Math.round(memoryUsage.heapTotal / 1024 / 1024);
            
            console.log(`📊 Lottery Socket Stats:`, {
                connectedClients: connectedCount,
                memoryMB: `${memoryMB}MB / ${memoryLimitMB}MB`,
                cacheValid: this.cacheExpiry && Date.now() < this.cacheExpiry,
                pendingRequests: this.pendingLatestRequests.size
            });
            
            // Warning nếu memory > 400MB (80% of 512MB)
            if (memoryUsage.heapUsed > 400 * 1024 * 1024) {
                console.warn('⚠️ Memory usage cao:', {
                    used: `${memoryMB}MB`,
                    total: `${memoryLimitMB}MB`,
                    connectedClients: connectedCount
                });
            }
            
            // Cleanup old rate limiter entries (mỗi 5 phút)
            const now = Date.now();
            for (const [ip, timestamps] of this.connectionRateLimiter.entries()) {
                const recent = timestamps.filter(ts => now - ts < this.CONNECTION_WINDOW_MS);
                if (recent.length === 0) {
                    this.connectionRateLimiter.delete(ip);
                } else {
                    this.connectionRateLimiter.set(ip, recent);
                }
            }
        }, 30000); // Every 30 seconds
    }
}

// Tạo singleton instance
const lotterySocketService = new LotterySocketService();

// Khởi tạo sau khi socket.io sẵn sàng (delay 1 giây để đảm bảo socket.service đã init)
setTimeout(() => {
    lotterySocketService.init();
}, 1000);

module.exports = lotterySocketService;
