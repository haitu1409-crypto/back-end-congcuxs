/**
 * Telegram Lottery Socket Client
 * Kết nối đến /lottery namespace để nhận kết quả xổ số realtime
 * Tương tự frontend LiveResult.js nhưng cho Telegram bot
 */

const { io } = require('socket.io-client');

class TelegramLotterySocketClient {
    constructor() {
        this.socket = null;
        this.isConnected = false;
        this.listeners = new Map();
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;
        this.liveData = {}; // Lưu trữ dữ liệu hiện tại
        this.lastErrorLogTime = 0; // Track last error log time to prevent spam
        this.errorLogInterval = 30000; // Only log errors every 30 seconds max
    }

    /**
     * Kết nối đến server
     */
    connect() {
        if (this.socket?.connected) {
            // Nếu đã kết nối, yêu cầu dữ liệu mới nhất
            this.socket.emit('lottery:get-latest');
            return this.socket;
        }

        // Get socket URL từ env hoặc default
        // Ưu tiên: SOCKET_URL > API_URL > RENDER_EXTERNAL_URL > tự động detect từ URL hiện tại
        let SOCKET_URL = process.env.SOCKET_URL || 
            process.env.API_URL || 
            null;

        // Nếu không có URL từ env, thử detect từ các environment variables của cloud providers
        if (!SOCKET_URL) {
            // Render.com cung cấp RENDER_EXTERNAL_URL
            if (process.env.RENDER_EXTERNAL_URL) {
                SOCKET_URL = process.env.RENDER_EXTERNAL_URL;
            }
            // Vercel, Railway, và các platforms khác có thể có PORT và URL
            else if (process.env.NODE_ENV === 'production') {
                // Trong production, cố gắng detect từ các env variables phổ biến
                const possibleUrls = [
                    process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : null,
                    process.env.HEROKU_APP_NAME ? `https://${process.env.HEROKU_APP_NAME}.herokuapp.com` : null,
                    // Có thể thêm các platforms khác ở đây
                ].filter(Boolean);

                if (possibleUrls.length > 0) {
                    SOCKET_URL = possibleUrls[0];
                    console.log(`[TelegramLotterySocket] 🔍 Auto-detected URL: ${SOCKET_URL}`);
                } else {
                    // Trong production, nếu không detect được, log warning và không kết nối
                    console.warn('[TelegramLotterySocket] ⚠️ Production mode nhưng không có SOCKET_URL/API_URL');
                    console.warn('[TelegramLotterySocket] ⚠️ Vui lòng set SOCKET_URL hoặc API_URL trong environment variables');
                    console.warn('[TelegramLotterySocket] ⚠️ Ví dụ: SOCKET_URL=https://api1.ketquamn.com');
                    console.warn('[TelegramLotterySocket] ⚠️ Không thể kết nối socket trong production mà không có URL hợp lệ');
                    // Không kết nối nếu không có URL hợp lệ trong production
                    return null;
                }
            }
        }

        // Nếu vẫn chưa có URL, chỉ dùng localhost cho development
        if (!SOCKET_URL) {
            const PORT = process.env.PORT || 5000;
            const HOST = process.env.HOST || 'localhost';
            const PROTOCOL = 'http'; // Localhost luôn dùng http
            SOCKET_URL = `${PROTOCOL}://${HOST}:${PORT}`;
        }

        // Normalize URL - loại bỏ trailing slash
        SOCKET_URL = SOCKET_URL.replace(/\/$/, '');

        // Normalize URL - convert ws:// to http://, wss:// to https://
        if (SOCKET_URL.startsWith('ws://')) {
            SOCKET_URL = SOCKET_URL.replace('ws://', 'http://');
        } else if (SOCKET_URL.startsWith('wss://')) {
            SOCKET_URL = SOCKET_URL.replace('wss://', 'https://');
        }

        console.log('[TelegramLotterySocket] 🔌 Connecting to lottery socket server:', SOCKET_URL);
        console.log('[TelegramLotterySocket] 📝 Environment variables:');
        console.log('[TelegramLotterySocket]    - SOCKET_URL:', process.env.SOCKET_URL || 'not set');
        console.log('[TelegramLotterySocket]    - API_URL:', process.env.API_URL || 'not set');
        console.log('[TelegramLotterySocket]    - RENDER_EXTERNAL_URL:', process.env.RENDER_EXTERNAL_URL || 'not set');
        console.log('[TelegramLotterySocket]    - NODE_ENV:', process.env.NODE_ENV || 'not set');

        // Connect to /lottery namespace (không cần auth)
        this.socket = io(`${SOCKET_URL}/lottery`, {
            transports: ['websocket', 'polling'],
            upgrade: true,
            rememberUpgrade: true,
            reconnection: true,
            reconnectionDelay: 2000, // Tăng delay để giảm spam
            reconnectionDelayMax: 30000, // Tăng max delay lên 30 giây
            reconnectionAttempts: this.maxReconnectAttempts,
            timeout: 30000, // Tăng timeout lên 30 giây
            forceNew: false,
            autoConnect: true,
            path: '/socket.io/',
            withCredentials: false,
            // Thêm options để xử lý lỗi tốt hơn
            rejectUnauthorized: process.env.NODE_ENV === 'production' ? true : false,
            // Retry connection với exponential backoff
            randomizationFactor: 0.5
        });

        // Connection events
        this.socket.on('connect', () => {
            console.log('[TelegramLotterySocket] ✅ Connected to /lottery namespace');
            this.isConnected = true;
            this.reconnectAttempts = 0;
            this.lastErrorLogTime = 0; // Reset error log time on successful connection

            // Request latest result (auto-joined to lottery:xsmb room)
            this.socket.emit('lottery:get-latest');

            this.notifyListeners('connected');
        });

        this.socket.on('disconnect', (reason) => {
            console.log('[TelegramLotterySocket] ❌ Disconnected:', reason);
            this.isConnected = false;
            this.notifyListeners('disconnected', reason);
        });

        this.socket.on('connect_error', (error) => {
            const errorDetails = {
                message: error.message,
                type: error.type,
                description: error.description,
                context: error.context,
                transport: error.transport?.name || 'unknown'
            };

            // Chỉ log chi tiết lỗi lần đầu hoặc mỗi 5 lần thử lại để tránh spam
            if (this.reconnectAttempts === 0 || this.reconnectAttempts % 5 === 0) {
                console.error('[TelegramLotterySocket] ❌ Connection error:', JSON.stringify(errorDetails, null, 2));
                console.error('[TelegramLotterySocket] 📍 Connecting to:', SOCKET_URL);
            }

            this.reconnectAttempts++;

            if (this.reconnectAttempts >= this.maxReconnectAttempts) {
                console.error('[TelegramLotterySocket] 🔴 Max reconnection attempts reached');
                console.error('[TelegramLotterySocket] ⚠️ Will retry connection later (when in live window)');
                // Không dừng lại hoàn toàn, sẽ thử lại khi được gọi lại
                this.notifyListeners('connection_error', error);
            } else {
                // Chỉ log mỗi 5 lần thử lại để tránh spam
                if (this.reconnectAttempts % 5 === 0 || this.reconnectAttempts <= 3) {
                    console.log(`[TelegramLotterySocket] 🔄 Reconnection attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
                }
            }
        });

        // Lottery events
        this.socket.on('lottery:latest', (data) => {
            console.log('[TelegramLotterySocket] 📡 Received latest lottery result');
            this.liveData = this.formatResultForTelegram(data);
            this.notifyListeners('lottery:latest', this.liveData);
        });

        this.socket.on('lottery:prize-update', (data) => {
            console.log(`[TelegramLotterySocket] 📡 Received prize update: ${data.prizeType} = ${data.prizeData}`);
            
            // Update liveData với giá trị mới
            if (data.prizeType && data.prizeData) {
                this.liveData[data.prizeType] = data.prizeData;
                this.liveData.lastUpdated = data.timestamp || Date.now();
            }
            
            this.notifyListeners('lottery:prize-update', {
                prizeType: data.prizeType,
                prizeData: data.prizeData,
                timestamp: data.timestamp,
                fullData: this.liveData
            });
        });

        this.socket.on('lottery:complete', (data) => {
            console.log('[TelegramLotterySocket] 📡 Received complete result');
            this.liveData = this.formatResultForTelegram(data);
            this.notifyListeners('lottery:complete', this.liveData);
        });

        this.socket.on('lottery:full-update', (data) => {
            console.log('[TelegramLotterySocket] 📡 Received full update');
            this.liveData = this.formatResultForTelegram(data);
            this.notifyListeners('lottery:full-update', this.liveData);
        });

        this.socket.on('lottery:error', (error) => {
            console.error('[TelegramLotterySocket] ❌ Lottery socket error:', error);
            this.notifyListeners('lottery:error', error);
        });

        // Start heartbeat
        this.startHeartbeat();

        return this.socket;
    }

    /**
     * Format result cho Telegram (tương tự frontend formatResultForDisplay)
     */
    formatResultForTelegram(data) {
        if (!data) {
            return this.createEmptyResult();
        }

        return {
            drawDate: data.drawDate,
            station: data.station || 'xsmb',
            dayOfWeek: data.dayOfWeek || '',
            specialPrize_0: data.specialPrize_0 || '...',
            firstPrize_0: data.firstPrize_0 || '...',
            secondPrize_0: data.secondPrize_0 || '...',
            secondPrize_1: data.secondPrize_1 || '...',
            threePrizes_0: data.threePrizes_0 || '...',
            threePrizes_1: data.threePrizes_1 || '...',
            threePrizes_2: data.threePrizes_2 || '...',
            threePrizes_3: data.threePrizes_3 || '...',
            threePrizes_4: data.threePrizes_4 || '...',
            threePrizes_5: data.threePrizes_5 || '...',
            fourPrizes_0: data.fourPrizes_0 || '...',
            fourPrizes_1: data.fourPrizes_1 || '...',
            fourPrizes_2: data.fourPrizes_2 || '...',
            fourPrizes_3: data.fourPrizes_3 || '...',
            fivePrizes_0: data.fivePrizes_0 || '...',
            fivePrizes_1: data.fivePrizes_1 || '...',
            fivePrizes_2: data.fivePrizes_2 || '...',
            fivePrizes_3: data.fivePrizes_3 || '...',
            fivePrizes_4: data.fivePrizes_4 || '...',
            fivePrizes_5: data.fivePrizes_5 || '...',
            sixPrizes_0: data.sixPrizes_0 || '...',
            sixPrizes_1: data.sixPrizes_1 || '...',
            sixPrizes_2: data.sixPrizes_2 || '...',
            sevenPrizes_0: data.sevenPrizes_0 || '...',
            sevenPrizes_1: data.sevenPrizes_1 || '...',
            sevenPrizes_2: data.sevenPrizes_2 || '...',
            sevenPrizes_3: data.sevenPrizes_3 || '...',
            maDB: data.maDB || '...',
            lastUpdated: data.lastUpdated || Date.now(),
            isComplete: data.isComplete || false
        };
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
            dayOfWeek: '',
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
            maDB: '...',
            lastUpdated: 0,
            isComplete: false
        };
    }

    /**
     * Yêu cầu dữ liệu latest thủ công
     */
    requestLatest() {
        if (this.socket && this.isConnected) {
            this.socket.emit('lottery:get-latest');
        }
    }

    /**
     * Ngắt kết nối
     */
    disconnect() {
        if (this.socket) {
            this.stopHeartbeat();
            this.socket.disconnect();
            this.socket = null;
            this.isConnected = false;
        }
    }

    /**
     * Listen to event
     */
    on(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event).push(callback);
    }

    /**
     * Remove listener
     */
    off(event, callback) {
        const callbacks = this.listeners.get(event);
        if (callbacks) {
            const index = callbacks.indexOf(callback);
            if (index > -1) {
                callbacks.splice(index, 1);
            }
        }
    }

    /**
     * Notify listeners
     */
    notifyListeners(event, data) {
        const callbacks = this.listeners.get(event);
        if (callbacks) {
            callbacks.forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    console.error('[TelegramLotterySocket] Listener error:', error);
                }
            });
        }
    }

    /**
     * Start heartbeat
     */
    startHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
        }

        this.heartbeatInterval = setInterval(() => {
            if (this.socket && this.isConnected) {
                this.socket.emit('lottery:ping');
            }
        }, 30000); // 30 seconds
    }

    /**
     * Stop heartbeat
     */
    stopHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }

    /**
     * Get current live data
     */
    getLiveData() {
        return this.liveData;
    }

    /**
     * Get connection status
     */
    getConnectionStatus() {
        return {
            connected: this.isConnected,
            socket: this.socket
        };
    }

    /**
     * Reset reconnection attempts (gọi khi muốn thử lại từ đầu)
     */
    resetReconnectionAttempts() {
        this.reconnectAttempts = 0;
        this.lastErrorLogTime = 0;
    }
}

// Singleton instance
const telegramLotterySocketClient = new TelegramLotterySocketClient();

module.exports = telegramLotterySocketClient;





