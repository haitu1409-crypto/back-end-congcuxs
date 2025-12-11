/**
 * XSMN Socket Service - Real-time lottery results via Socket.io
 * Namespace: /lottery-xsmn (public, không cần authentication)
 * Hỗ trợ nhiều tỉnh mỗi ngày (3-4 tỉnh)
 */

const { getIO } = require('./socket.service');
const XSMN = require('../models/xsmn.models');

// Helper: check cùng ngày (so sánh yyyy-mm-dd)
const isSameDay = (d1, d2) => {
    const a = new Date(d1);
    const b = new Date(d2);
    return a.getFullYear() === b.getFullYear() &&
        a.getMonth() === b.getMonth() &&
        a.getDate() === b.getDate();
};

class XSMNSocketService {
    constructor() {
        this.io = null;
        this.lotteryNamespace = null;
        this.connectedClients = new Set();
        this.latestSnapshotByProvince = {}; // Cache theo từng tỉnh (snapshot từ stream)
        
        // 🚀 OPTIMIZATION: Cache latest result để giảm DB queries (per province)
        this.latestResultCacheByProvince = {}; // Cache theo tỉnh
        this.cacheExpiryByProvince = {}; // Expiry theo tỉnh
        this.CACHE_TTL_MS = 10000; // ✅ Tăng cache TTL lên 10 giây để giảm DB queries
        
        // 🚀 OPTIMIZATION: Rate limiting per IP
        this.connectionRateLimiter = new Map(); // IP -> timestamp[]
        this.MAX_CONNECTIONS_PER_IP = 5;
        this.CONNECTION_WINDOW_MS = 60000; // 1 minute window
        
        // 🚀 OPTIMIZATION: Max total connections để tránh quá tải
        this.MAX_TOTAL_CONNECTIONS = 300; // Cho phép tối đa 300 connections đồng thời
        
        // 🚀 OPTIMIZATION: Batch latest requests
        // Map socket -> specificTinh|null (null = all provinces)
        this.pendingLatestRequests = new Map();
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
            
            // ✅ OPTIMIZATION: Kiểm tra max total connections
            if (this.connectedClients.size >= this.MAX_TOTAL_CONNECTIONS) {
                console.warn(`⚠️ Max connections reached (${this.MAX_TOTAL_CONNECTIONS}), rejecting new connection from ${clientIP}`);
                socket.emit('xsmn:error', { message: 'Server đang quá tải, vui lòng thử lại sau' });
                socket.disconnect();
                return;
            }
            
            this.connectedClients.add(socket.id);
            const station = 'xsmn';
            const roomName = `lottery:${station}`;

            socket.join(roomName);
            console.log(`✅ Client ${socket.id} đã kết nối đến /lottery-xsmn namespace, tham gia room: ${roomName} (Total: ${this.connectedClients.size}/${this.MAX_TOTAL_CONNECTIONS})`);

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
        // Lưu yêu cầu (mỗi socket một giá trị specificTinh hoặc null)
        this.pendingLatestRequests.set(socket, specificTinh || null);
        
        if (this.latestRequestBatchTimeout) {
            clearTimeout(this.latestRequestBatchTimeout);
        }
        
        this.latestRequestBatchTimeout = setTimeout(async () => {
            await this.processBatchLatestRequests();
        }, this.BATCH_DELAY_MS);
    }
    
    /**
     * Process batch latest requests
     */
    async processBatchLatestRequests() {
        if (this.pendingLatestRequests.size === 0) return;
        
        const entries = Array.from(this.pendingLatestRequests.entries()); // [socket, specificTinh|null]
        this.pendingLatestRequests.clear();
        
        const activeEntries = entries.filter(([socket]) => socket.connected);
        if (activeEntries.length === 0) return;

        // Nếu có ít nhất một request all, chúng ta cần chuẩn bị payload cho tất cả tỉnh
        const requestedProvinces = new Set(
            activeEntries
                .map(([, tinh]) => tinh)
                .filter(Boolean) // chỉ các tỉnh cụ thể
        );
        const needAll = activeEntries.some(([, tinh]) => !tinh);

        // Chuẩn bị dữ liệu nguồn: cache -> DB -> snapshot -> empty
        // ✅ FIX: Tính today giống XSMB - đơn giản và hiệu quả
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        let resultsByProvince = {};

        try {
            // ✅ OPTIMIZATION: Query DB với limit và sort theo drawDate (đã có index)
            // Limit 10 results để giảm memory và tăng tốc query
            const dbResults = await XSMN.find({
                drawDate: { $gte: today },
                station: 'xsmn'
            })
            .sort({ drawDate: -1, createdAt: -1 }) // Sort theo drawDate (có index) và createdAt
            .limit(10) // ✅ Limit số lượng results
            .lean();

            dbResults.forEach(result => {
                const tinh = result.tinh;
                if (!resultsByProvince[tinh] || 
                    new Date(result.createdAt) > new Date(resultsByProvince[tinh].createdAt)) {
                    resultsByProvince[tinh] = result;
                }
            });
        } catch (error) {
            console.error('❌ Lỗi khi query DB latest XSMN:', error);
        }

        // Helper: lấy payload cho một tỉnh với thứ tự ưu tiên: cache (TTL) -> DB -> snapshot -> empty
        const getProvincePayload = (tinh, tentinhFromSnapshot = '') => {
            const now = Date.now();
            // 1) Cache TTL
            if (this.latestResultCacheByProvince[tinh] && this.cacheExpiryByProvince[tinh] && now < this.cacheExpiryByProvince[tinh]) {
                return this.latestResultCacheByProvince[tinh];
            }
            // 2) DB result
            if (resultsByProvince[tinh]) {
                const payload = this.formatResultForClient(resultsByProvince[tinh]);
                this.latestResultCacheByProvince[tinh] = payload;
                this.cacheExpiryByProvince[tinh] = now + this.CACHE_TTL_MS;
                this.latestSnapshotByProvince[tinh] = payload; // đồng bộ snapshot
                return payload;
            }
            // 3) Snapshot (được lưu khi emitPrizeUpdate/full-update)
            if (this.latestSnapshotByProvince[tinh]) {
                return this.latestSnapshotByProvince[tinh];
            }
            // 4) Empty result (giữ tinh/tentinh nếu biết)
            return this.createEmptyResult(tentinhFromSnapshot || '', tinh || '');
        };

        // Danh sách tỉnh mà chúng ta sẽ phục vụ cho request all
        const allKnownProvinces = new Set([
            ...Object.keys(resultsByProvince),
            ...Object.keys(this.latestSnapshotByProvince),
            ...Object.keys(this.latestResultCacheByProvince),
            ...requestedProvinces
        ]);

        // Gửi cho từng socket theo nhu cầu
        activeEntries.forEach(([socket, tinh]) => {
            if (!socket.connected) return;

            if (tinh) {
                // ✅ FIX: Giống XSMB - gửi trực tiếp payload, tin tưởng query DB đã filter đúng
                const payload = getProvincePayload(tinh);
                socket.emit('xsmn:latest', { [tinh]: payload });
            } else {
                // ✅ FIX: Giống XSMB - gửi tất cả payload, không check isSameDay
                const payloadAll = {};
                allKnownProvinces.forEach(prov => {
                    const payload = getProvincePayload(prov);
                    if (payload) {
                        payloadAll[prov] = payload;
                    }
                });
                socket.emit('xsmn:latest-all', payloadAll);
            }
        });

        console.log(`📤 Sent latest results to ${activeEntries.length} clients (${needAll ? 'all provinces' : `${requestedProvinces.size} provinces`})`);
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
        // ✅ FIX: Giống XSMB - tính today đơn giản
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
            const formatted = this.formatResultForClient(fullResult);
            this.latestSnapshotByProvince[tinh] = formatted;
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
        // ✅ FIX: Giống XSMB - tính today đơn giản
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




