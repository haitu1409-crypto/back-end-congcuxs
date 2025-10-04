/**
 * Cache Utility
 * Quản lý caching cho backend với Redis hoặc in-memory cache
 */

const NodeCache = require('node-cache');

class CacheManager {
    constructor() {
        // Sử dụng node-cache cho in-memory caching
        this.cache = new NodeCache({
            stdTTL: 300, // 5 phút mặc định
            checkperiod: 60, // Kiểm tra expired keys mỗi 60 giây
            useClones: false // Không clone objects để tăng performance
        });

        // Statistics
        this.stats = {
            hits: 0,
            misses: 0,
            sets: 0,
            deletes: 0
        };
    }

    /**
     * Tạo cache key từ prefix và params
     */
    createKey(prefix, params = {}) {
        if (typeof params === 'string') {
            return `${prefix}:${params}`;
        }

        const sortedParams = Object.keys(params)
            .sort()
            .reduce((result, key) => {
                if (params[key] !== undefined && params[key] !== null) {
                    result[key] = params[key];
                }
                return result;
            }, {});

        const paramString = Object.keys(sortedParams).length > 0
            ? JSON.stringify(sortedParams)
            : '';

        return `${prefix}:${paramString}`;
    }

    /**
     * Lấy dữ liệu từ cache
     */
    get(key) {
        const value = this.cache.get(key);
        if (value !== undefined) {
            this.stats.hits++;
            return value;
        }
        this.stats.misses++;
        return null;
    }

    /**
     * Lưu dữ liệu vào cache
     */
    set(key, value, ttl = null) {
        const success = this.cache.set(key, value, ttl || 300);
        if (success) {
            this.stats.sets++;
        }
        return success;
    }

    /**
     * Xóa key khỏi cache
     */
    del(key) {
        const success = this.cache.del(key);
        if (success > 0) {
            this.stats.deletes++;
        }
        return success > 0;
    }

    /**
     * Xóa nhiều keys theo pattern
     */
    delPattern(pattern) {
        const keys = this.cache.keys();
        const matchingKeys = keys.filter(key => key.includes(pattern));
        const deleted = this.cache.del(matchingKeys);
        this.stats.deletes += deleted;
        return deleted;
    }

    /**
     * Flush toàn bộ cache
     */
    flush() {
        this.cache.flushAll();
        this.stats = {
            hits: 0,
            misses: 0,
            sets: 0,
            deletes: 0
        };
    }

    /**
     * Lấy thống kê cache
     */
    getStats() {
        const keys = this.cache.keys();
        const hitRate = this.stats.hits + this.stats.misses > 0
            ? (this.stats.hits / (this.stats.hits + this.stats.misses) * 100).toFixed(2)
            : 0;

        return {
            ...this.stats,
            hitRate: `${hitRate}%`,
            totalKeys: keys.length,
            memoryUsage: process.memoryUsage()
        };
    }

    /**
     * Wrapper function cho caching với function
     */
    async wrap(key, fn, ttl = 300) {
        // Kiểm tra cache trước
        let cached = this.get(key);
        if (cached !== null) {
            return cached;
        }

        // Nếu không có trong cache, thực thi function
        try {
            const result = await fn();
            this.set(key, result, ttl);
            return result;
        } catch (error) {
            // Không cache lỗi
            throw error;
        }
    }

    /**
     * Middleware cho Express để cache response
     */
    middleware(ttl = 300) {
        return (req, res, next) => {
            // Tạo cache key từ URL và query params
            const cacheKey = this.createKey('http', {
                url: req.originalUrl,
                method: req.method
            });

            // Chỉ cache GET requests
            if (req.method !== 'GET') {
                return next();
            }

            // Kiểm tra cache
            const cached = this.get(cacheKey);
            if (cached) {
                res.setHeader('X-Cache', 'HIT');
                return res.json(cached);
            }

            // Override res.json để cache response
            const originalJson = res.json;
            res.json = (data) => {
                // Cache successful responses
                if (res.statusCode === 200 && data && data.success) {
                    this.set(cacheKey, data, ttl);
                }
                res.setHeader('X-Cache', 'MISS');
                return originalJson.call(res, data);
            };

            next();
        };
    }
}

// Tạo singleton instance
const cacheManager = new CacheManager();

module.exports = cacheManager;
