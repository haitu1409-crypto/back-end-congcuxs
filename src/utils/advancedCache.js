/**
 * Advanced Cache Manager
 * Hệ thống cache thông minh với TTL, LRU, và memory optimization
 */

const NodeCache = require('node-cache');

class AdvancedCacheManager {
    constructor() {
        // Cache chính với TTL thông minh
        this.mainCache = new NodeCache({
            stdTTL: 1800, // 30 phút default
            checkperiod: 300, // Kiểm tra mỗi 5 phút
            useClones: false, // Tối ưu memory
            maxKeys: 1000, // Giới hạn số keys
            deleteOnExpire: true
        });

        // Cache cho patterns (TTL dài hơn)
        this.patternCache = new NodeCache({
            stdTTL: 3600, // 1 giờ
            checkperiod: 600, // Kiểm tra mỗi 10 phút
            useClones: false,
            maxKeys: 500
        });

        // Cache cho statistics (TTL ngắn)
        this.statsCache = new NodeCache({
            stdTTL: 600, // 10 phút
            checkperiod: 120, // Kiểm tra mỗi 2 phút
            useClones: false,
            maxKeys: 200
        });

        // Memory usage tracking
        this.memoryStats = {
            totalHits: 0,
            totalMisses: 0,
            totalSets: 0,
            totalDeletes: 0
        };

        this.setupEventListeners();
    }

    /**
     * Setup event listeners cho monitoring
     */
    setupEventListeners() {
        this.mainCache.on('set', () => this.memoryStats.totalSets++);
        this.mainCache.on('del', () => this.memoryStats.totalDeletes++);
        this.mainCache.on('expired', (key) => {
            console.log(`⏰ Cache expired: ${key}`);
        });

        this.patternCache.on('set', () => this.memoryStats.totalSets++);
        this.patternCache.on('del', () => this.memoryStats.totalDeletes++);

        this.statsCache.on('set', () => this.memoryStats.totalSets++);
        this.statsCache.on('del', () => this.memoryStats.totalDeletes++);
    }

    /**
     * Lấy cache key thông minh
     */
    createSmartKey(prefix, params = {}) {
        const sortedParams = Object.keys(params)
            .sort()
            .reduce((result, key) => {
                result[key] = params[key];
                return result;
            }, {});

        return `${prefix}:${JSON.stringify(sortedParams)}`;
    }

    /**
     * Lấy dữ liệu từ cache với fallback
     */
    get(key, cacheType = 'main') {
        const cache = this.getCacheByType(cacheType);
        const result = cache.get(key);

        if (result !== undefined) {
            this.memoryStats.totalHits++;
            console.log(`✅ Cache hit: ${key}`);
            return result;
        } else {
            this.memoryStats.totalMisses++;
            console.log(`❌ Cache miss: ${key}`);
            return null;
        }
    }

    /**
     * Lưu dữ liệu vào cache với TTL thông minh
     */
    set(key, data, ttl = null, cacheType = 'main') {
        const cache = this.getCacheByType(cacheType);

        // TTL thông minh dựa trên loại dữ liệu
        const smartTTL = ttl || this.calculateSmartTTL(key, cacheType);

        cache.set(key, data, smartTTL);
        console.log(`💾 Cache set: ${key} (TTL: ${smartTTL}s)`);
    }

    /**
     * Tính toán TTL thông minh
     */
    calculateSmartTTL(key, cacheType) {
        // TTL dựa trên loại dữ liệu
        if (key.includes('position-soicau')) {
            return 1800; // 30 phút cho position analysis
        }
        if (key.includes('pattern')) {
            return 3600; // 1 giờ cho patterns
        }
        if (key.includes('stats')) {
            return 600; // 10 phút cho statistics
        }
        if (key.includes('range')) {
            return 900; // 15 phút cho range queries
        }

        // Default TTL theo cache type
        switch (cacheType) {
            case 'pattern': return 3600;
            case 'stats': return 600;
            case 'main': return 1800;
            default: return 1800;
        }
    }

    /**
     * Lấy cache theo type
     */
    getCacheByType(cacheType) {
        switch (cacheType) {
            case 'pattern': return this.patternCache;
            case 'stats': return this.statsCache;
            case 'main':
            default: return this.mainCache;
        }
    }

    /**
     * Xóa cache với pattern matching
     */
    deletePattern(pattern) {
        const caches = [this.mainCache, this.patternCache, this.statsCache];
        let deletedCount = 0;

        caches.forEach(cache => {
            const keys = cache.keys();
            keys.forEach(key => {
                if (key.includes(pattern)) {
                    cache.del(key);
                    deletedCount++;
                }
            });
        });

        console.log(`🗑️ Deleted ${deletedCount} cache entries matching: ${pattern}`);
        return deletedCount;
    }

    /**
     * Invalidate cache liên quan
     */
    invalidateRelated(key) {
        const patterns = [
            'position-soicau',
            'pattern',
            'stats'
        ];

        patterns.forEach(pattern => {
            if (key.includes(pattern)) {
                this.deletePattern(pattern);
            }
        });
    }

    /**
     * Batch operations
     */
    mget(keys, cacheType = 'main') {
        const cache = this.getCacheByType(cacheType);
        const results = {};

        keys.forEach(key => {
            const value = cache.get(key);
            if (value !== undefined) {
                results[key] = value;
                this.memoryStats.totalHits++;
            } else {
                this.memoryStats.totalMisses++;
            }
        });

        return results;
    }

    mset(keyValuePairs, ttl = null, cacheType = 'main') {
        const cache = this.getCacheByType(cacheType);
        const smartTTL = ttl || this.calculateSmartTTL(Object.keys(keyValuePairs)[0], cacheType);

        Object.entries(keyValuePairs).forEach(([key, value]) => {
            cache.set(key, value, smartTTL);
        });

        console.log(`💾 Batch set: ${Object.keys(keyValuePairs).length} entries`);
    }

    /**
     * Cache warming
     */
    async warmCache(warmupData) {
        console.log('🔥 Starting cache warmup...');

        const promises = warmupData.map(async ({ key, data, ttl, cacheType }) => {
            this.set(key, data, ttl, cacheType);
        });

        await Promise.all(promises);
        console.log('✅ Cache warmup completed');
    }

    /**
     * Memory optimization
     */
    optimizeMemory() {
        const caches = [this.mainCache, this.patternCache, this.statsCache];

        caches.forEach(cache => {
            const keys = cache.keys();
            const stats = cache.getStats();

            console.log(`📊 Cache stats: ${keys.length} keys, ${stats.hits} hits, ${stats.misses} misses`);

            // Xóa keys cũ nếu quá nhiều
            if (keys.length > 800) {
                const keysToDelete = keys.slice(0, 200); // Xóa 200 keys cũ nhất
                keysToDelete.forEach(key => cache.del(key));
                console.log(`🧹 Cleaned ${keysToDelete.length} old cache entries`);
            }
        });
    }

    /**
     * Health check
     */
    getHealthStatus() {
        const mainStats = this.mainCache.getStats();
        const patternStats = this.patternCache.getStats();
        const statsStats = this.statsCache.getStats();

        return {
            main: {
                keys: this.mainCache.keys().length,
                hits: mainStats.hits,
                misses: mainStats.misses,
                hitRate: mainStats.hits / (mainStats.hits + mainStats.misses) || 0
            },
            pattern: {
                keys: this.patternCache.keys().length,
                hits: patternStats.hits,
                misses: patternStats.misses,
                hitRate: patternStats.hits / (patternStats.hits + patternStats.misses) || 0
            },
            stats: {
                keys: this.statsCache.keys().length,
                hits: statsStats.hits,
                misses: statsStats.misses,
                hitRate: statsStats.hits / (statsStats.hits + statsStats.misses) || 0
            },
            memory: this.memoryStats
        };
    }

    /**
     * Clear all caches
     */
    clearAll() {
        this.mainCache.flushAll();
        this.patternCache.flushAll();
        this.statsCache.flushAll();

        this.memoryStats = {
            totalHits: 0,
            totalMisses: 0,
            totalSets: 0,
            totalDeletes: 0
        };

        console.log('🧹 All caches cleared');
    }

    /**
     * Get cache statistics
     */
    getStats() {
        return {
            health: this.getHealthStatus(),
            memory: this.memoryStats,
            timestamp: new Date().toISOString()
        };
    }
}

// Export singleton instance
module.exports = new AdvancedCacheManager();
