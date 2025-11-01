import { CacheProvider } from './cache-provider.interface';

export interface TTCacheModuleOptions {
  /**
   * Cache provider instance (Redis, Memory, etc.)
   */
  provider: CacheProvider;
  
  /**
   * Global TTL in seconds (default: 3600)
   */
  defaultTTL?: number;
  
  /**
   * Enable debug logging
   */
  debug?: boolean;
  
  /**
   * Enable cache statistics tracking
   */
  enableStatistics?: boolean;
  
  /**
   * Enable write-through caching by default
   */
  writeThrough?: boolean;
  
  /**
   * Enable read-through caching by default
   */
  readThrough?: boolean;
  
  /**
   * Cache key prefix
   */
  keyPrefix?: string;
  
  /**
   * Enable cache warming on startup
   */
  warmOnStartup?: boolean;
  
  /**
   * Enable stale-while-revalidate
   */
  staleWhileRevalidate?: boolean;
  
  /**
   * Stale data TTL in seconds
   */
  staleTTL?: number;
  
  /**
   * Enable cache stampede protection
   */
  stampedeProtection?: boolean;
  
  /**
   * Maximum concurrent cache refreshes
   */
  maxConcurrentRefreshes?: number;
  
  /**
   * Enable automatic cache invalidation on relations
   */
  invalidateRelations?: boolean;
  
  /**
   * Circuit breaker configuration
   */
  circuitBreaker?: {
    enabled: boolean;
    threshold: number;
    timeout: number;
    resetTimeout: number;
  };
}

export interface CacheStatistics {
  hits: number;
  misses: number;
  writes: number;
  deletes: number;
  errors: number;
  hitRate: number;
  averageLoadTime: number;
  averageWriteTime: number;
}