import { Cache } from 'cache-manager';
import { CacheProvider } from '../interfaces/cache-provider.interface';

/**
 * Adapter to use NestJS Cache Manager as the cache provider
 * Compatible with cache-manager v6.x
 */
export class CacheManagerAdapter implements CacheProvider {
  constructor(private readonly cacheManager: Cache) {}
  
  async get<T = any>(key: string): Promise<T | null> {
    const value = await this.cacheManager.get<T>(key);
    return value ?? null;
  }
  
  async set<T = any>(key: string, value: T, ttl?: number): Promise<void> {
    // cache-manager v6 uses milliseconds for TTL
    const ttlMs = ttl ? ttl * 1000 : undefined;
    await this.cacheManager.set(key, value, ttlMs);
  }
  
  async delete(key: string): Promise<boolean> {
    await this.cacheManager.del(key);
    return true;
  }
  
  async deletePattern(pattern: string): Promise<number> {
    // Get all keys matching pattern
    const keys = await this.keys(pattern);
    
    if (keys.length === 0) return 0;
    
    // Delete all matching keys
    await Promise.all(keys.map(key => this.cacheManager.del(key)));
    
    return keys.length;
  }
  
  async exists(key: string): Promise<boolean> {
    const value = await this.cacheManager.get(key);
    return value !== undefined && value !== null;
  }
  
  async mget<T = any>(keys: string[]): Promise<(T | null)[]> {
    // cache-manager doesn't have native mget, so we need to get individually
    const promises = keys.map(key => this.get<T>(key));
    return Promise.all(promises);
  }
  
  async mset(items: Array<{ key: string; value: any; ttl?: number }>): Promise<void> {
    // cache-manager doesn't have native mset, so we need to set individually
    const promises = items.map(({ key, value, ttl }) => this.set(key, value, ttl));
    await Promise.all(promises);
  }
  
  async flush(): Promise<void> {
    await this.cacheManager.clear();
  }
  
  async keys(pattern: string): Promise<string[]> {
    // Note: cache-manager v6 uses Keyv stores which may not support keys() directly
    // We need to access the underlying store if available
    const stores = this.cacheManager.stores;
    
    if (stores && stores.length > 0) {
      // Try to get keys from the first store
      const store = stores[0] as any;
      
      if (typeof store.keys === 'function') {
        try {
          const allKeys = await store.keys(pattern);
          return Array.isArray(allKeys) ? allKeys : [];
        } catch {
          // If keys() fails, try alternative approach
          try {
            const allKeys = await store.keys();
            const regex = this.patternToRegex(pattern);
            return allKeys.filter((key: string) => regex.test(key));
          } catch {
            // If keys() is not supported, return empty array
            return [];
          }
        }
      }
    }
    
    // If the store doesn't support listing keys, return empty array
    console.warn('Cache store does not support listing keys. Pattern deletion may not work correctly.');
    return [];
  }
  
  async expire(key: string, ttl: number): Promise<boolean> {
    // Get the current value
    const value = await this.cacheManager.get(key);
    if (value === undefined || value === null) {
      return false;
    }
    
    // Re-set with new TTL (in milliseconds)
    await this.cacheManager.set(key, value, ttl * 1000);
    return true;
  }
  
  async ttl(key: string): Promise<number> {
    // cache-manager v6 has a native ttl method
    try {
      const ttl = await this.cacheManager.ttl(key);
      return ttl !== null ? ttl : -2;
    } catch {
      // If TTL is not supported, check if key exists
      const exists = await this.exists(key);
      return exists ? -1 : -2;
    }
  }
  
  async transaction<T>(operations: () => Promise<T>): Promise<T> {
    // cache-manager doesn't support transactions natively
    // Just execute the operations
    return await operations();
  }
  
  async increment(key: string, by: number = 1): Promise<number> {
    const current = await this.get<number>(key) || 0;
    const newValue = current + by;
    await this.set(key, newValue);
    return newValue;
  }
  
  async decrement(key: string, by: number = 1): Promise<number> {
    const current = await this.get<number>(key) || 0;
    const newValue = current - by;
    await this.set(key, newValue);
    return newValue;
  }
  
  private patternToRegex(pattern: string): RegExp {
    // Convert Redis-style pattern to regex
    const escaped = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');
    
    return new RegExp(`^${escaped}$`);
  }
}