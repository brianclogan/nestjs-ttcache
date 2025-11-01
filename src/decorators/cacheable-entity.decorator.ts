import 'reflect-metadata';

export const CACHEABLE_ENTITY_KEY = Symbol('CACHEABLE_ENTITY');
export const CACHE_KEY_METADATA = Symbol('CACHE_KEY');
export const CACHE_TTL_METADATA = Symbol('CACHE_TTL');

export interface CacheableEntityOptions {
  /**
   * Time to live in seconds
   */
  ttl?: number;
  /**
   * Cache key prefix
   */
  prefix?: string;
  /**
   * Whether to cache relations
   */
  cacheRelations?: boolean;
  /**
   * Whether to use write-through caching
   */
  writeThrough?: boolean;
}

/**
 * Decorator to mark an entity as cacheable
 * @param options Cache configuration options
 */
export function CacheableEntity(options: CacheableEntityOptions = {}): ClassDecorator {
  return (target: any) => {
    const defaultOptions: CacheableEntityOptions = {
      ttl: 3600, // 1 hour default
      cacheRelations: false,
      writeThrough: true,
      prefix: target.name,
      ...options
    };
    
    Reflect.defineMetadata(CACHEABLE_ENTITY_KEY, defaultOptions, target);
    
    // Store in global metadata for easy access
    const entities = getCacheableEntities();
    entities.set(target.name, { target, options: defaultOptions });
  };
}

/**
 * Decorator to mark a property as part of the cache key
 */
export function CacheKey(): PropertyDecorator {
  return (target: any, propertyKey: string | symbol) => {
    const existingKeys = Reflect.getMetadata(CACHE_KEY_METADATA, target.constructor) || [];
    existingKeys.push(propertyKey);
    Reflect.defineMetadata(CACHE_KEY_METADATA, existingKeys, target.constructor);
  };
}

/**
 * Decorator to set TTL for specific methods or properties
 * @param ttl Time to live in seconds
 */
export function CacheTTL(ttl: number): MethodDecorator & PropertyDecorator {
  return (target: any, propertyKey: string | symbol, descriptor?: PropertyDescriptor) => {
    Reflect.defineMetadata(CACHE_TTL_METADATA, ttl, target, propertyKey);
    return descriptor;
  };
}

// Global registry for cacheable entities
const cacheableEntities = new Map<string, { target: any; options: CacheableEntityOptions }>();

export function getCacheableEntities() {
  return cacheableEntities;
}

export function isCacheable(entity: any): boolean {
  return Reflect.hasMetadata(CACHEABLE_ENTITY_KEY, entity.constructor);
}

export function getCacheOptions(entity: any): CacheableEntityOptions | undefined {
  return Reflect.getMetadata(CACHEABLE_ENTITY_KEY, entity.constructor);
}

export function getCacheKeys(entity: any): string[] {
  return Reflect.getMetadata(CACHE_KEY_METADATA, entity.constructor) || [];
}

export function getMethodTTL(target: any, propertyKey: string | symbol): number | undefined {
  return Reflect.getMetadata(CACHE_TTL_METADATA, target, propertyKey);
}