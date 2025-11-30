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
    }

    /**
     * Khởi tạo lottery namespace
     */
    init() {
        const mainIO = getIO();
        if (!mainIO) {
            if (process.env.NODE_ENV === 'development') {
                console.log('⏳ Socket.io chưa sẵn sàng, đợi 2 giây...');
            }
            setTimeout(() => this.init(), 2000);
            return;
        }

        this.io = mainIO;

        // Tạo namespace /lottery (public, không cần auth)
        this.lotteryNamespace = this.io.of('/lottery');
        this.setupSocketHandlers();

        if (process.env.NODE_ENV === 'development') {
            console.log('✅ Lottery Socket Service đã được khởi tạo (namespace: /lottery)');
        }
    }

    /**
     * Setup socket handlers cho namespace /lottery
     */
    setupSocketHandlers() {
        if (!this.lotteryNamespace) return;

        this.lotteryNamespace.on('connection', (socket) => {
            this.connectedClients.add(socket.id);
            const station = 'xsmb';
            const roomName = `lottery:${station}`;

            socket.join(roomName);
            console.log(`✅ Client ${socket.id} đã kết nối đến /lottery namespace, tham gia room: ${roomName}`);

            // Gửi dữ liệu mới nhất khi client kết nối
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
                console.log(`❌ Client ${socket.id} đã ngắt kết nối khỏi /lottery: ${reason}`);
            });
        });
    }

    /**
     * Gửi kết quả mới nhất cho client
     */
    async sendLatestResult(socket) {
        try {
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            let payload = null;

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

            socket.emit('lottery:latest', payload);
        } catch (error) {
            console.error('❌ Lỗi khi gửi latest result:', error);
            socket.emit('lottery:error', { message: 'Không thể lấy dữ liệu mới nhất' });
        }
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

        // Tối ưu payload: chỉ gửi dữ liệu cần thiết
        // Frontend chỉ cần: prizeType, prizeData, timestamp
        const data = {
            prizeType,
            prizeData,
            timestamp: Date.now()
        };

        this.lotteryNamespace.to(roomName).emit('lottery:prize-update', data);
        console.log(`📡 Đã emit prize update: ${prizeType} = ${prizeData}`);

        if (fullResult) {
            this.latestSnapshot = this.formatResultForClient(fullResult);
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
}

// Tạo singleton instance
const lotterySocketService = new LotterySocketService();

// Khởi tạo sau khi socket.io sẵn sàng (delay 1 giây để đảm bảo socket.service đã init)
setTimeout(() => {
    lotterySocketService.init();
}, 1000);

module.exports = lotterySocketService;
