import { Injectable, Inject, Logger, Optional, LogLevel } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { ObjectLiteral, Repository, SelectQueryBuilder } from 'typeorm';
import { TTCacheModuleOptions, CacheStatistics } from '../interfaces';
import { CacheProvider } from '../interfaces/cache-provider.interface';
import { CacheManagerAdapter } from '../providers/cache-manager.adapter';
import { CacheKeyGenerator } from '../utils/cache-key.utils';
import { CacheLock } from '../utils/cache-lock.utils';
import { getCacheOptions, isCacheable } from '../decorators';

@Injectable()
export class TTCacheService {
  private readonly logger = new Logger(TTCacheService.name);
  private readonly provider: CacheProvider;
  private readonly lock: CacheLock;
  private readonly statistics: CacheStatistics = {
    hits: 0,
    misses: 0,
    writes: 0,
    deletes: 0,
    errors: 0,
    hitRate: 0,
    averageLoadTime: 0,
    averageWriteTime: 0
  };
  
  private loadTimes: number[] = [];
  private writeTimes: number[] = [];
  private circuitBreakerOpen = false;
  private circuitBreakerErrors = 0;
  private circuitBreakerResetTimer?: NodeJS.Timeout;
  private logLevel: LogLevel = 'log';
  
  constructor(
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
    @Optional() @Inject('TTCACHE_OPTIONS') private readonly options: TTCacheModuleOptions = {}
  ) {
    // Use provided cache or wrap the NestJS cache manager
    const cache = this.options.cache || this.cacheManager;
    this.provider = new CacheManagerAdapter(cache);
    this.lock = new CacheLock(this.provider);
    
    // Set default options
    this.options = {
      defaultTTL: 3600,
      writeThrough: true,
      readThrough: true,
      logLevel: 'log',
      ...this.options
    };
    
    this.logLevel = this.options.logLevel || 'log';
    this.log(`TTCacheService initialized with logLevel: ${this.logLevel}`);
    
    // Log cache service details at verbose level
    this.logCacheServiceDetails(cache);
  }
  
  /**
   * Log detailed information about the cache service being used
   */
  private logCacheServiceDetails(cache: Cache): void {
    if (this.logLevel !== 'verbose') {
      return;
    }
    
    try {
      const cacheInfo = this.detectCacheService(cache);
      this.logger.verbose(
        `Cache Service: ${cacheInfo.type} | Version: ${cacheInfo.version} | Store: ${cacheInfo.store}`,
        TTCacheService.name
      );
    } catch (error) {
      this.logger.verbose(
        `Cache Service: Unknown | Error detecting cache details: ${error}`,
        TTCacheService.name
      );
    }
  }
  
  /**
   * Detect the cache service type and version
   */
  private detectCacheService(cache: Cache): { type: string; version: string; store: string } {
    let type = 'Unknown';
    let version = 'Unknown';
    let store = 'Unknown';
    
    try {
      // Check for cache-manager instance
      if (cache && typeof cache === 'object') {
        // Try to detect from stores
        if ((cache as any).stores && Array.isArray((cache as any).stores)) {
          const stores = (cache as any).stores;
          if (stores.length > 0) {
            const firstStore = stores[0] as any;
            
            // Detect store type
            if (firstStore.constructor) {
              const storeName = firstStore.constructor.name;
              
              if (storeName.includes('Redis')) {
                type = 'Redis';
                store = 'cache-manager-redis';
              } else if (storeName.includes('Memory') || storeName.includes('Keyv')) {
                type = 'Memory';
                store = 'cache-manager-memory';
              } else if (storeName.includes('Memcached')) {
                type = 'Memcached';
                store = 'cache-manager-memcached';
              } else if (storeName.includes('MongoDB')) {
                type = 'MongoDB';
                store = 'cache-manager-mongodb';
              } else {
                type = storeName;
                store = storeName;
              }
            }
            
            // Try to get version from store
            if (firstStore.client) {
              const client = firstStore.client as any;
              if (client.info) {
                version = 'Connected';
              } else if (client.version) {
                version = client.version;
              }
            }
          }
        }
        
        // Try to get cache-manager version from package
        try {
          const packageJson = require('cache-manager/package.json');
          if (packageJson.version) {
            version = packageJson.version;
          }
        } catch {
          // Ignore if package.json not found
        }
      }
    } catch (error) {
      // Silently fail and return defaults
    }
    
    return { type, version, store };
  }
  
  /**
   * Log message at the configured log level
   */
  private log(message: string, context?: string): void {
    const ctx = context || TTCacheService.name;
    switch (this.logLevel) {
      case 'verbose':
        this.logger.verbose(message, ctx);
        break;
      case 'debug':
        this.logger.debug(message, ctx);
        break;
      case 'warn':
        this.logger.warn(message, ctx);
        break;
      case 'error':
        this.logger.error(message, ctx);
        break;
      case 'log':
      default:
        this.logger.log(message, ctx);
        break;
    }
  }
  
  /**
   * Write-through cache: Write to database and cache
   */
  async writeThrough<T extends ObjectLiteral>(
    entity: T,
    repository: Repository<T>,
    ttl?: number
  ): Promise<T> {
    const startTime = Date.now();
    
    try {
      // Save to database first
      const saved = await repository.save(entity);
      
      // Then write to cache if entity is cacheable
      if (isCacheable(saved)) {
        const cacheKey = CacheKeyGenerator.forEntity(saved);
        const cacheOptions = getCacheOptions(saved);
        const cacheTTL = ttl || cacheOptions?.ttl || this.options.defaultTTL;
        
        await this.set(cacheKey, saved, cacheTTL);
        
        // Invalidate related caches
        if (this.options.invalidateRelations) {
          await this.invalidateRelations(saved);
        }
      }
      
      this.recordWriteTime(Date.now() - startTime);
      return saved;
    } catch (error) {
      this.statistics.errors++;
      this.handleCircuitBreakerError();
      throw error;
    }
  }
  
  /**
   * Read-through cache: Read from cache, fetch from DB if miss
   */
  async readThrough<T extends ObjectLiteral>(
    key: string,
    fetchFn: () => Promise<T | null>,
    ttl?: number
  ): Promise<T | null> {
    const startTime = Date.now();
    
    try {
      // Check cache first
      const cached = await this.get<T>(key);
      if (cached) {
        this.statistics.hits++;
        this.updateHitRate();
        return cached;
      }
      
      this.statistics.misses++;
      
      // Use lock to prevent cache stampede
      if (this.options.stampedeProtection) {
        return await this.lock.withLock(
          `fetch:${key}`,
          async () => {
            // Double-check cache after acquiring lock
            const cachedAfterLock = await this.get<T>(key);
            if (cachedAfterLock) {
              return cachedAfterLock;
            }
            
            // Fetch from database
            const data = await fetchFn();
            if (data) {
              await this.set(key, data, ttl || this.options.defaultTTL);
            }
            
            this.recordLoadTime(Date.now() - startTime);
            return data;
          },
          {
            onLockFailed: async () => {
              // If lock failed, try to get stale data if enabled
              if (this.options.staleWhileRevalidate) {
                const staleKey = `stale:${key}`;
                const staleData = await this.get<T>(staleKey);
                if (staleData) {
                  return staleData;
                }
              }
              
              // Otherwise, fetch directly
              return await fetchFn();
            }
          }
        );
      } else {
        // No stampede protection, fetch directly
        const data = await fetchFn();
        if (data) {
          await this.set(key, data, ttl || this.options.defaultTTL);
        }
        
        this.recordLoadTime(Date.now() - startTime);
        return data;
      }
    } catch (error) {
      this.statistics.errors++;
      this.handleCircuitBreakerError();
      
      // If circuit breaker is open or cache fails, fetch directly
      if (this.circuitBreakerOpen) {
        return await fetchFn();
      }
      
      throw error;
    }
  }
  
  /**
   * Get value from cache
   */
  async get<T = any>(key: string): Promise<T | null> {
    if (this.circuitBreakerOpen) {
      return null;
    }
    
    try {
      const fullKey = this.getFullKey(key);
      const value = await this.provider.get<T>(fullKey);
      
      if (this.options.debug) {
        this.logger.debug(`Cache ${value ? 'HIT' : 'MISS'}: ${fullKey}`);
      }
      
      return value;
    } catch (error) {
      this.handleCircuitBreakerError();
      return null;
    }
  }
  
  /**
   * Set value in cache
   */
  async set<T = any>(key: string, value: T, ttl?: number): Promise<void> {
    if (this.circuitBreakerOpen) {
      return;
    }
    
    try {
      const fullKey = this.getFullKey(key);
      const cacheTTL = ttl || this.options.defaultTTL;
      
      await this.provider.set(fullKey, value, cacheTTL);
      
      // Also set stale version if stale-while-revalidate is enabled
      if (this.options.staleWhileRevalidate && cacheTTL) {
        const staleKey = `stale:${fullKey}`;
        const staleTTL = cacheTTL + (this.options.staleTTL || 300);
        await this.provider.set(staleKey, value, staleTTL);
      }
      
      this.statistics.writes++;
      
      if (this.options.debug) {
        this.logger.debug(`Cache SET: ${fullKey} (TTL: ${cacheTTL}s)`);
      }
    } catch (error) {
      this.statistics.errors++;
      this.handleCircuitBreakerError();
    }
  }
  
  /**
   * Delete value from cache
   */
  async delete(key: string): Promise<boolean> {
    try {
      const fullKey = this.getFullKey(key);
      const result = await this.provider.delete(fullKey);
      
      // Also delete stale version
      if (this.options.staleWhileRevalidate) {
        await this.provider.delete(`stale:${fullKey}`);
      }
      
      this.statistics.deletes++;
      
      if (this.options.debug) {
        this.logger.debug(`Cache DELETE: ${fullKey}`);
      }
      
      return result;
    } catch (error) {
      this.statistics.errors++;
      return false;
    }
  }
  
  /**
   * Invalidate cache by pattern
   */
  async invalidatePattern(pattern: string): Promise<number> {
    try {
      const fullPattern = this.getFullKey(pattern);
      const count = await this.provider.deletePattern(fullPattern);
      
      // Also delete stale versions
      if (this.options.staleWhileRevalidate) {
        await this.provider.deletePattern(`stale:${fullPattern}`);
      }
      
      this.statistics.deletes += count;
      
      if (this.options.debug) {
        this.logger.debug(`Cache INVALIDATE pattern: ${fullPattern} (${count} keys)`);
      }
      
      return count;
    } catch (error) {
      this.statistics.errors++;
      return 0;
    }
  }
  
  /**
   * Invalidate all caches for an entity type
   */
  async invalidateEntity(entityName: string): Promise<number> {
    const pattern = CacheKeyGenerator.pattern(entityName);
    return await this.invalidatePattern(pattern);
  }
  
  /**
   * Invalidate related entity caches
   */
  private async invalidateRelations(entity: ObjectLiteral): Promise<void> {
    // This would need to be implemented based on TypeORM metadata
    // For now, just invalidate the entity type
    const entityName = entity.constructor.name;
    await this.invalidateEntity(entityName);
  }
  
  /**
   * Cache a query result
   */
  async cacheQuery<T extends ObjectLiteral>(
    queryBuilder: SelectQueryBuilder<T>,
    ttl?: number
  ): Promise<T[]> {
    const cacheKey = CacheKeyGenerator.forQuery(queryBuilder);
    
    return await this.readThrough(
      cacheKey,
      () => queryBuilder.getMany(),
      ttl
    ) || [];
  }
  
  /**
   * Get cache statistics
   */
  getStatistics(): CacheStatistics {
    return { ...this.statistics };
  }
  
  /**
   * Reset cache statistics
   */
  resetStatistics(): void {
    this.statistics.hits = 0;
    this.statistics.misses = 0;
    this.statistics.writes = 0;
    this.statistics.deletes = 0;
    this.statistics.errors = 0;
    this.statistics.hitRate = 0;
    this.statistics.averageLoadTime = 0;
    this.statistics.averageWriteTime = 0;
    this.loadTimes = [];
    this.writeTimes = [];
  }
  
  /**
   * Warm cache with preloaded data
   */
  async warmCache<T extends ObjectLiteral>(
    entities: T[],
    ttl?: number
  ): Promise<void> {
    const items = entities
      .filter(entity => isCacheable(entity))
      .map(entity => ({
        key: this.getFullKey(CacheKeyGenerator.forEntity(entity)),
        value: entity,
        ttl: ttl || getCacheOptions(entity)?.ttl || this.options.defaultTTL
      }));
    
    if (items.length > 0) {
      await this.provider.mset(items);
      this.statistics.writes += items.length;
      
      if (this.options.debug) {
        this.logger.debug(`Cache WARM: ${items.length} entities`);
      }
    }
  }
  
  /**
   * Clear all cache
   */
  async flush(): Promise<void> {
    await this.provider.flush();
    this.resetStatistics();
    
    if (this.options.debug) {
      this.logger.debug('Cache FLUSH: All keys cleared');
    }
  }
  
  /**
   * Get the underlying cache manager instance
   */
  getCacheManager(): Cache {
    return this.options.cache || this.cacheManager;
  }
  
  private getFullKey(key: string): string {
    return this.options.keyPrefix ? `${this.options.keyPrefix}:${key}` : key;
  }
  
  private updateHitRate(): void {
    const total = this.statistics.hits + this.statistics.misses;
    this.statistics.hitRate = total > 0 ? this.statistics.hits / total : 0;
  }
  
  private recordLoadTime(time: number): void {
    this.loadTimes.push(time);
    if (this.loadTimes.length > 100) {
      this.loadTimes.shift();
    }
    this.statistics.averageLoadTime = 
      this.loadTimes.reduce((a, b) => a + b, 0) / this.loadTimes.length;
  }
  
  private recordWriteTime(time: number): void {
    this.writeTimes.push(time);
    if (this.writeTimes.length > 100) {
      this.writeTimes.shift();
    }
    this.statistics.averageWriteTime = 
      this.writeTimes.reduce((a, b) => a + b, 0) / this.writeTimes.length;
  }
  
  private handleCircuitBreakerError(): void {
    if (!this.options.circuitBreaker?.enabled) {
      return;
    }
    
    this.circuitBreakerErrors++;
    
    if (this.circuitBreakerErrors >= this.options.circuitBreaker.threshold) {
      this.openCircuitBreaker();
    }
  }
  
  private openCircuitBreaker(): void {
    if (this.circuitBreakerOpen) {
      return;
    }
    
    this.circuitBreakerOpen = true;
    this.logger.warn('Circuit breaker opened due to cache errors');
    
    // Reset after timeout
    this.circuitBreakerResetTimer = setTimeout(() => {
      this.closeCircuitBreaker();
    }, this.options.circuitBreaker!.resetTimeout);
  }
  
  private closeCircuitBreaker(): void {
    this.circuitBreakerOpen = false;
    this.circuitBreakerErrors = 0;
    this.logger.log('Circuit breaker closed');
    
    if (this.circuitBreakerResetTimer) {
      clearTimeout(this.circuitBreakerResetTimer);
      this.circuitBreakerResetTimer = undefined;
    }
  }
}