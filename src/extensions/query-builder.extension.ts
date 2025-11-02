import { SelectQueryBuilder, ObjectLiteral } from 'typeorm';
import { TTCacheService } from '../services/ttcache.service';
import { CacheKeyGenerator } from '../utils';

/**
 * Extension for SelectQueryBuilder to support caching
 * This module extends TypeORM's SelectQueryBuilder with cache-aware methods
 */

declare module 'typeorm' {
  interface SelectQueryBuilder<Entity> {
    /**
     * Get many results and count with cache support
     * Returns both entities and total count in a single cached operation
     */
    getManyAndCountWithCache(
      cacheService: TTCacheService,
      ttl?: number
    ): Promise<[Entity[], number]>;

    /**
     * Get many results with cache support
     */
    getManyWithCache(
      cacheService: TTCacheService,
      ttl?: number
    ): Promise<Entity[]>;

    /**
     * Get one result with cache support
     */
    getOneWithCache(
      cacheService: TTCacheService,
      ttl?: number
    ): Promise<Entity | null>;

    /**
     * Get count with cache support
     */
    getCountWithCache(
      cacheService: TTCacheService,
      ttl?: number
    ): Promise<number>;
  }
}

/**
 * Extend SelectQueryBuilder prototype with cache methods
 */
export function extendQueryBuilder(): void {
  (SelectQueryBuilder.prototype as any).getManyAndCountWithCache = async function<Entity extends ObjectLiteral>(
    this: SelectQueryBuilder<Entity>,
    cacheService: TTCacheService,
    ttl?: number
  ): Promise<[Entity[], number]> {
    const cacheKey = CacheKeyGenerator.forQuery(this);
    const countCacheKey = CacheKeyGenerator.buildKey(cacheKey, 'count');

    // Try to get both from cache
    const cachedEntities = await cacheService.get<Entity[]>(cacheKey);
    const cachedCount = await cacheService.get<number>(countCacheKey);

    if (cachedEntities !== null && cachedCount !== null) {
      return [cachedEntities, cachedCount];
    }

    // If either is missing, fetch both from database
    const [entities, count] = await this.getManyAndCount();

    // Cache both results
    await Promise.all([
      cacheService.set(cacheKey, entities, ttl),
      cacheService.set(countCacheKey, count, ttl)
    ]);

    return [entities, count];
  };

  (SelectQueryBuilder.prototype as any).getManyWithCache = async function<Entity extends ObjectLiteral>(
    this: SelectQueryBuilder<Entity>,
    cacheService: TTCacheService,
    ttl?: number
  ): Promise<Entity[]> {
    const cacheKey = CacheKeyGenerator.forQuery(this);

    return await cacheService.readThrough(
      cacheKey,
      () => this.getMany(),
      ttl
    ) || [];
  };

  (SelectQueryBuilder.prototype as any).getOneWithCache = async function<Entity extends ObjectLiteral>(
    this: SelectQueryBuilder<Entity>,
    cacheService: TTCacheService,
    ttl?: number
  ): Promise<Entity | null> {
    const cacheKey = CacheKeyGenerator.forQuery(this);

    return await cacheService.readThrough(
      cacheKey,
      () => this.getOne(),
      ttl
    );
  };

  (SelectQueryBuilder.prototype as any).getCountWithCache = async function<Entity extends ObjectLiteral>(
    this: SelectQueryBuilder<Entity>,
    cacheService: TTCacheService,
    ttl?: number
  ): Promise<number> {
    const cacheKey = CacheKeyGenerator.buildKey(CacheKeyGenerator.forQuery(this), 'count');

    const cached = await cacheService.get<number>(cacheKey);
    if (cached !== null) {
      return cached;
    }

    const count = await this.getCount();
    await cacheService.set(cacheKey, count, ttl);

    return count;
  };
}
