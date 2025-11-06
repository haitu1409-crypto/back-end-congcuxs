// Simple in-memory cache utility
class MemoryCache {
    constructor() {
        this.cache = new Map();
    }

    get(key) {
        const item = this.cache.get(key);
        if (!item) {
            return null;
        }

        // Check if item is expired
        if (item.expiresAt && Date.now() > item.expiresAt) {
            this.cache.delete(key);
            return null;
        }

        return item.value;
    }

    set(key, value, ttlSeconds = 7200) {
        const expiresAt = Date.now() + (ttlSeconds * 1000);
        this.cache.set(key, { value, expiresAt });
    }

    delete(key) {
        this.cache.delete(key);
    }

    clear() {
        this.cache.clear();
    }

    size() {
        return this.cache.size;
    }

    // Clean up expired entries periodically
    startCleanupInterval(intervalMs = 60000) {
        setInterval(() => {
            const now = Date.now();
            for (const [key, item] of this.cache.entries()) {
                if (item.expiresAt && now > item.expiresAt) {
                    this.cache.delete(key);
                }
            }
        }, intervalMs);
    }
}

// Create singleton instance
const memoryCache = new MemoryCache();

// Start cleanup interval to prevent memory leak
memoryCache.startCleanupInterval(60000); // Clean every minute

module.exports = memoryCache;

















