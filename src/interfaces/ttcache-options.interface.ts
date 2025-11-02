import { Cache } from 'cache-manager';
import { LogLevel } from '@nestjs/common';

export interface TTCacheModuleOptions {
  /**
   * Optional custom cache instance. If not provided, will use NestJS's CACHE_MANAGER
   */
  cache?: Cache;
  
  /**
   * Global TTL in seconds (default: 3600)
   */
  defaultTTL?: number;
  
  /**
   * Enable debug logging
   */
  debug?: boolean;
  
  /**
   * Log level for TTCache operations (default: 'log')
   * Options: 'log', 'error', 'warn', 'debug', 'verbose'
   */
  logLevel?: LogLevel;
  
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
  
  /**
   * Optional logger instance
   */
  logger?: {
    debug: (msg: string) => void;
    warn: (msg: string) => void;
    log: (msg: string) => void;
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