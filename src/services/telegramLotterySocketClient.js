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
        let SOCKET_URL = process.env.SOCKET_URL || 
            process.env.API_URL || 
            'http://localhost:5000';

        // Normalize URL
        if (SOCKET_URL.startsWith('ws://')) {
            SOCKET_URL = SOCKET_URL.replace('ws://', 'http://');
        } else if (SOCKET_URL.startsWith('wss://')) {
            SOCKET_URL = SOCKET_URL.replace('wss://', 'https://');
        }

        console.log('[TelegramLotterySocket] 🔌 Connecting to lottery socket server:', SOCKET_URL);

        // Connect to /lottery namespace (không cần auth)
        this.socket = io(`${SOCKET_URL}/lottery`, {
            transports: ['websocket', 'polling'],
            upgrade: true,
            rememberUpgrade: true,
            reconnection: true,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 10000,
            reconnectionAttempts: this.maxReconnectAttempts,
            timeout: 20000,
            forceNew: false,
            autoConnect: true,
            path: '/socket.io/',
            withCredentials: false
        });

        // Connection events
        this.socket.on('connect', () => {
            console.log('[TelegramLotterySocket] ✅ Connected to /lottery namespace');
            this.isConnected = true;
            this.reconnectAttempts = 0;

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
            console.error('[TelegramLotterySocket] ❌ Connection error:', error.message);
            this.reconnectAttempts++;

            if (this.reconnectAttempts >= this.maxReconnectAttempts) {
                console.error('[TelegramLotterySocket] 🔴 Max reconnection attempts reached');
                this.notifyListeners('connection_error', error);
            } else {
                console.log(`[TelegramLotterySocket] 🔄 Reconnection attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
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
}

// Singleton instance
const telegramLotterySocketClient = new TelegramLotterySocketClient();

module.exports = telegramLotterySocketClient;



