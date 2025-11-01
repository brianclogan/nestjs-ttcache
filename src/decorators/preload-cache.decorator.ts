import 'reflect-metadata';

export const PRELOAD_CACHE_KEY = Symbol('PRELOAD_CACHE');

export interface PreloadCacheOptions {
  /**
   * Whether to preload on application startup
   */
  onStartup?: boolean;
  /**
   * Custom query to use for preloading
   */
  query?: any;
  /**
   * Relations to include in preload
   */
  relations?: string[];
}

/**
 * Decorator to mark an entity for cache preloading
 * @param options Preload configuration options
 */
export function PreloadCache(options: PreloadCacheOptions = {}): ClassDecorator {
  return (target: any) => {
    const defaultOptions: PreloadCacheOptions = {
      onStartup: true,
      relations: [],
      ...options
    };
    
    Reflect.defineMetadata(PRELOAD_CACHE_KEY, defaultOptions, target);
  };
}

export function getPreloadOptions(entity: any): PreloadCacheOptions | undefined {
  return Reflect.getMetadata(PRELOAD_CACHE_KEY, entity.constructor);
}

export function shouldPreload(entity: any): boolean {
  return Reflect.hasMetadata(PRELOAD_CACHE_KEY, entity.constructor);
}