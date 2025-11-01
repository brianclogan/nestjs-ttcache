import { CacheProvider } from '../interfaces';

/**
 * Distributed lock implementation for cache stampede protection
 */
export class CacheLock {
  private static readonly LOCK_PREFIX = 'lock:';
  private static readonly DEFAULT_LOCK_TTL = 30; // seconds
  private static readonly DEFAULT_RETRY_DELAY = 100; // ms
  private static readonly DEFAULT_MAX_RETRIES = 50;
  
  constructor(private readonly cacheProvider: CacheProvider) {}
  
  /**
   * Acquire a lock for a given key
   */
  async acquire(
    key: string,
    ttl: number = CacheLock.DEFAULT_LOCK_TTL,
    maxRetries: number = CacheLock.DEFAULT_MAX_RETRIES
  ): Promise<boolean> {
    const lockKey = this.getLockKey(key);
    const lockValue = this.generateLockValue();
    
    for (let i = 0; i < maxRetries; i++) {
      const acquired = await this.tryAcquire(lockKey, lockValue, ttl);
      if (acquired) {
        return true;
      }
      
      await this.delay(CacheLock.DEFAULT_RETRY_DELAY);
    }
    
    return false;
  }
  
  /**
   * Release a lock
   */
  async release(key: string): Promise<boolean> {
    const lockKey = this.getLockKey(key);
    return await this.cacheProvider.delete(lockKey);
  }
  
  /**
   * Execute a function with lock protection
   */
  async withLock<T>(
    key: string,
    fn: () => Promise<T>,
    options: {
      ttl?: number;
      maxRetries?: number;
      onLockFailed?: () => T | Promise<T>;
    } = {}
  ): Promise<T> {
    const acquired = await this.acquire(key, options.ttl, options.maxRetries);
    
    if (!acquired) {
      if (options.onLockFailed) {
        return await options.onLockFailed();
      }
      throw new Error(`Failed to acquire lock for key: ${key}`);
    }
    
    try {
      return await fn();
    } finally {
      await this.release(key);
    }
  }
  
  /**
   * Check if a lock exists
   */
  async isLocked(key: string): Promise<boolean> {
    const lockKey = this.getLockKey(key);
    return await this.cacheProvider.exists(lockKey);
  }
  
  /**
   * Wait for a lock to be released
   */
  async waitForUnlock(
    key: string,
    timeout: number = 5000
  ): Promise<void> {
    const startTime = Date.now();
    
    while (await this.isLocked(key)) {
      if (Date.now() - startTime > timeout) {
        throw new Error(`Timeout waiting for lock release: ${key}`);
      }
      
      await this.delay(CacheLock.DEFAULT_RETRY_DELAY);
    }
  }
  
  private async tryAcquire(lockKey: string, value: string, ttl: number): Promise<boolean> {
    try {
      const exists = await this.cacheProvider.exists(lockKey);
      if (exists) {
        return false;
      }
      
      await this.cacheProvider.set(lockKey, value, ttl);
      return true;
    } catch {
      return false;
    }
  }
  
  private getLockKey(key: string): string {
    return `${CacheLock.LOCK_PREFIX}${key}`;
  }
  
  private generateLockValue(): string {
    return `${Date.now()}_${Math.random().toString(36).substring(2)}`;
  }
  
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}