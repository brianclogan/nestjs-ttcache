import { CacheProvider } from '../interfaces';

interface CacheEntry {
  value: any;
  expiresAt?: number;
}

/**
 * In-memory cache provider for testing and development
 */
export class MemoryCacheProvider implements CacheProvider {
  private cache = new Map<string, CacheEntry>();
  private timers = new Map<string, NodeJS.Timeout>();
  
  async get<T = any>(key: string): Promise<T | null> {
    const entry = this.cache.get(key);
    
    if (!entry) return null;
    
    if (entry.expiresAt && entry.expiresAt < Date.now()) {
      this.cache.delete(key);
      return null;
    }
    
    return entry.value;
  }
  
  async set<T = any>(key: string, value: T, ttl?: number): Promise<void> {
    // Clear existing timer if any
    const existingTimer = this.timers.get(key);
    if (existingTimer) {
      clearTimeout(existingTimer);
      this.timers.delete(key);
    }
    
    const entry: CacheEntry = { value };
    
    if (ttl) {
      entry.expiresAt = Date.now() + (ttl * 1000);
      
      // Set auto-delete timer
      const timer = setTimeout(() => {
        this.cache.delete(key);
        this.timers.delete(key);
      }, ttl * 1000);
      
      this.timers.set(key, timer);
    }
    
    this.cache.set(key, entry);
  }
  
  async delete(key: string): Promise<boolean> {
    const timer = this.timers.get(key);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(key);
    }
    
    return this.cache.delete(key);
  }
  
  async deletePattern(pattern: string): Promise<number> {
    const regex = this.patternToRegex(pattern);
    const keysToDelete: string[] = [];
    
    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        keysToDelete.push(key);
      }
    }
    
    keysToDelete.forEach(key => this.delete(key));
    return keysToDelete.length;
  }
  
  async exists(key: string): Promise<boolean> {
    const entry = this.cache.get(key);
    
    if (!entry) return false;
    
    if (entry.expiresAt && entry.expiresAt < Date.now()) {
      this.cache.delete(key);
      return false;
    }
    
    return true;
  }
  
  async mget<T = any>(keys: string[]): Promise<(T | null)[]> {
    return Promise.all(keys.map(key => this.get<T>(key)));
  }
  
  async mset(items: Array<{ key: string; value: any; ttl?: number }>): Promise<void> {
    await Promise.all(items.map(({ key, value, ttl }) => this.set(key, value, ttl)));
  }
  
  async flush(): Promise<void> {
    // Clear all timers
    this.timers.forEach(timer => clearTimeout(timer));
    this.timers.clear();
    this.cache.clear();
  }
  
  async keys(pattern: string): Promise<string[]> {
    const regex = this.patternToRegex(pattern);
    const matchingKeys: string[] = [];
    
    for (const [key, entry] of this.cache.entries()) {
      if (entry.expiresAt && entry.expiresAt < Date.now()) {
        this.cache.delete(key);
        continue;
      }
      
      if (regex.test(key)) {
        matchingKeys.push(key);
      }
    }
    
    return matchingKeys;
  }
  
  async expire(key: string, ttl: number): Promise<boolean> {
    const entry = this.cache.get(key);
    if (!entry) return false;
    
    // Clear existing timer
    const existingTimer = this.timers.get(key);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }
    
    entry.expiresAt = Date.now() + (ttl * 1000);
    
    // Set new timer
    const timer = setTimeout(() => {
      this.cache.delete(key);
      this.timers.delete(key);
    }, ttl * 1000);
    
    this.timers.set(key, timer);
    return true;
  }
  
  async ttl(key: string): Promise<number> {
    const entry = this.cache.get(key);
    
    if (!entry) return -2; // Key doesn't exist
    if (!entry.expiresAt) return -1; // Key exists but has no expiration
    
    const remaining = Math.floor((entry.expiresAt - Date.now()) / 1000);
    return remaining > 0 ? remaining : -2;
  }
  
  async transaction<T>(operations: () => Promise<T>): Promise<T> {
    // Simple implementation - no real transaction support in memory
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