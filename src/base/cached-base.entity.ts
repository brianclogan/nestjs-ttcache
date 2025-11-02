import {
  BaseEntity,
  FindOneOptions,
  FindManyOptions,
  DeepPartial,
  SaveOptions,
  RemoveOptions,
  Repository,
  FindOptionsWhere,
  ObjectLiteral
} from 'typeorm';
import { TTCacheService } from '../services/ttcache.service';
import { CacheKeyGenerator } from '../utils';
import { isCacheable, getCacheOptions } from '../decorators';

/**
 * Base entity with built-in cache support
 */
export abstract class CachedBaseEntity extends BaseEntity {
  private static cacheService: TTCacheService;
  
  /**
   * Set the cache service for all entities
   */
  static setCacheService(service: TTCacheService): void {
    CachedBaseEntity.cacheService = service;
  }
  
  /**
   * Get the cache service
   */
  protected static getCacheService(): TTCacheService | null {
    return CachedBaseEntity.cacheService;
  }
  
  /**
   * Override save to implement write-through caching
   */
  async save(options?: SaveOptions): Promise<this> {
    const result = await super.save(options);
    
    const cacheService = CachedBaseEntity.getCacheService();
    if (cacheService && isCacheable(result)) {
      const cacheOptions = getCacheOptions(result);
      if (cacheOptions?.writeThrough) {
        try {
          const cacheKey = CacheKeyGenerator.forEntity(result);
          await cacheService.set(cacheKey, result, cacheOptions.ttl);
          
          // Invalidate query caches
          const entityName = result.constructor.name;
          await cacheService.invalidatePattern(
            CacheKeyGenerator.pattern(entityName, 'query')
          );
        } catch (error) {
          // Log but don't fail the save
          console.error('Cache write failed:', error);
        }
      }
    }
    
    return result;
  }
  
  /**
   * Override remove to invalidate cache
   */
  async remove(options?: RemoveOptions): Promise<this> {
    const cacheService = CachedBaseEntity.getCacheService();
    
    if (cacheService && isCacheable(this)) {
      try {
        const cacheKey = CacheKeyGenerator.forEntity(this);
        await cacheService.delete(cacheKey);
        
        // Invalidate related caches
        const entityName = this.constructor.name;
        await cacheService.invalidatePattern(
          CacheKeyGenerator.pattern(entityName, 'query')
        );
        await cacheService.invalidatePattern(
          `${cacheKey}:relation:*`
        );
      } catch (error) {
        console.error('Cache invalidation failed:', error);
      }
    }
    
    return await super.remove(options);
  }
  
  /**
   * Find one with cache support
   */
  static async findOneWithCache<T extends CachedBaseEntity>(
    this: (new() => T) & typeof CachedBaseEntity,
    options: FindOneOptions<T>
  ): Promise<T | null> {
    const cacheService = CachedBaseEntity.getCacheService();
    const repository = (this as any).getRepository() as Repository<T>;
    
    // Create a dummy instance for checking cacheability
    const dummyInstance = Object.create(this.prototype);
    
    if (!cacheService || !isCacheable(dummyInstance)) {
      return await repository.findOne(options);
    }
    
    // Generate cache key based on options
    const cacheKey = CacheKeyGenerator.forFind(this.name, options);
    const cacheOptions = getCacheOptions(dummyInstance);
    
    return await cacheService.readThrough(
      cacheKey,
      () => repository.findOne(options),
      cacheOptions?.ttl
    );
  }
  
  /**
   * Find one by ID with cache support
   */
  static async findByIdWithCache<T extends CachedBaseEntity>(
    this: (new() => T) & typeof CachedBaseEntity,
    id: any
  ): Promise<T | null> {
    const cacheService = CachedBaseEntity.getCacheService();
    const repository = (this as any).getRepository() as Repository<T>;
    
    // Create a dummy instance for checking cacheability
    const dummyInstance = Object.create(this.prototype);
    
    if (!cacheService || !isCacheable(dummyInstance)) {
      return await repository.findOne({ where: { id } as any });
    }
    
    (dummyInstance as any).id = id;
    const cacheKey = CacheKeyGenerator.forEntity(dummyInstance);
    const cacheOptions = getCacheOptions(dummyInstance);
    
    return await cacheService.readThrough(
      cacheKey,
      () => repository.findOne({ where: { id } as any }),
      cacheOptions?.ttl
    );
  }
  
  /**
   * Find many with cache support
   */
  static async findWithCache<T extends CachedBaseEntity>(
    this: (new() => T) & typeof CachedBaseEntity,
    options?: FindManyOptions<T>
  ): Promise<T[]> {
    const cacheService = CachedBaseEntity.getCacheService();
    const repository = (this as any).getRepository() as Repository<T>;
    
    // Create a dummy instance for checking cacheability
    const dummyInstance = Object.create(this.prototype);
    
    if (!cacheService || !isCacheable(dummyInstance)) {
      return await repository.find(options);
    }
    
    const cacheKey = CacheKeyGenerator.forFind(this.name, options || {});
    const cacheOptions = getCacheOptions(dummyInstance);
    
    const result = await cacheService.readThrough(
      cacheKey,
      () => repository.find(options),
      cacheOptions?.ttl
    );
    
    return result || [];
  }
  
  /**
   * Count with cache support
   */
  static async countWithCache<T extends CachedBaseEntity>(
    this: (new() => T) & typeof CachedBaseEntity,
    options?: FindManyOptions<T>
  ): Promise<number> {
    const cacheService = CachedBaseEntity.getCacheService();
    const repository = (this as any).getRepository() as Repository<T>;
    
    // Create a dummy instance for checking cacheability
    const dummyInstance = Object.create(this.prototype);
    
    if (!cacheService || !isCacheable(dummyInstance)) {
      return await repository.count(options);
    }
    
    const cacheKey = CacheKeyGenerator.forCount(this.name, options);
    const cacheOptions = getCacheOptions(dummyInstance);
    
    // Use a separate method for count caching
    const cached = await cacheService.get<number>(cacheKey);
    if (cached !== null) {
      return cached;
    }
    
    const count = await repository.count(options);
    await cacheService.set(cacheKey, count, cacheOptions?.ttl);
    
    return count;
  }
  
  /**
   * Find and count with cache support
   * Returns both entities and total count in a single operation
   */
  static async findAndCountWithCache<T extends CachedBaseEntity>(
    this: (new() => T) & typeof CachedBaseEntity,
    options?: FindManyOptions<T>
  ): Promise<[T[], number]> {
    const cacheService = CachedBaseEntity.getCacheService();
    const repository = (this as any).getRepository() as Repository<T>;
    
    // Create a dummy instance for checking cacheability
    const dummyInstance = Object.create(this.prototype);
    
    if (!cacheService || !isCacheable(dummyInstance)) {
      return await repository.findAndCount(options);
    }
    
    const cacheOptions = getCacheOptions(dummyInstance);
    
    // Generate separate cache keys for entities and count
    const entitiesCacheKey = CacheKeyGenerator.forFind(this.name, options || {});
    const countCacheKey = CacheKeyGenerator.forCount(this.name, options);
    
    // Try to get both from cache
    const cachedEntities = await cacheService.get<T[]>(entitiesCacheKey);
    const cachedCount = await cacheService.get<number>(countCacheKey);
    
    if (cachedEntities !== null && cachedCount !== null) {
      return [cachedEntities, cachedCount];
    }
    
    // If either is missing, fetch both from database
    const [entities, count] = await repository.findAndCount(options);
    
    // Cache both results
    await Promise.all([
      cacheService.set(entitiesCacheKey, entities, cacheOptions?.ttl),
      cacheService.set(countCacheKey, count, cacheOptions?.ttl)
    ]);
    
    return [entities, count];
  }
  
  /**
   * Create and save entity with cache support
   */
  static async createAndSave<T extends CachedBaseEntity>(
    this: (new() => T) & typeof CachedBaseEntity,
    data: DeepPartial<T>
  ): Promise<T> {
    const repository = (this as any).getRepository() as Repository<T>;
    const entity = repository.create(data) as T;
    return await entity.save() as T;
  }
  
  /**
   * Update with cache invalidation (custom method to avoid conflict)
   */
  static async updateWithCache<T extends CachedBaseEntity>(
    this: (new() => T) & typeof CachedBaseEntity,
    criteria: FindOptionsWhere<T>,
    partialEntity: DeepPartial<T>
  ): Promise<void> {
    const repository = (this as any).getRepository() as Repository<T>;
    await repository.update(criteria, partialEntity as any);
    
    const cacheService = CachedBaseEntity.getCacheService();
    const dummyInstance = Object.create(this.prototype);
    
    if (cacheService && isCacheable(dummyInstance)) {
      // Invalidate all caches for this entity type
      const entityName = this.name;
      await cacheService.invalidateEntity(entityName);
    }
  }
  
  /**
   * Delete with cache invalidation (custom method to avoid conflict)
   */
  static async deleteWithCache<T extends CachedBaseEntity>(
    this: (new() => T) & typeof CachedBaseEntity,
    criteria: FindOptionsWhere<T>
  ): Promise<void> {
    const repository = (this as any).getRepository() as Repository<T>;
    
    // Find entities to delete for cache invalidation
    const entities = await repository.find({ where: criteria });
    
    await repository.delete(criteria);
    
    const cacheService = CachedBaseEntity.getCacheService();
    const dummyInstance = Object.create(this.prototype);
    
    if (cacheService && isCacheable(dummyInstance)) {
      // Invalidate cache for each deleted entity
      for (const entity of entities) {
        const cacheKey = CacheKeyGenerator.forEntity(entity);
        await cacheService.delete(cacheKey);
      }
      
      // Invalidate query caches
      const entityName = this.name;
      await cacheService.invalidatePattern(
        CacheKeyGenerator.pattern(entityName, 'query')
      );
    }
  }
  
  /**
   * Invalidate all caches for this entity type
   */
  static async invalidateCache<T extends CachedBaseEntity>(
    this: (new() => T) & typeof CachedBaseEntity
  ): Promise<void> {
    const cacheService = CachedBaseEntity.getCacheService();
    if (cacheService) {
      await cacheService.invalidateEntity(this.name);
    }
  }
  
  /**
   * Warm cache with entities
   */
  static async warmCache<T extends CachedBaseEntity>(
    this: (new() => T) & typeof CachedBaseEntity,
    entities: T[]
  ): Promise<void> {
    const cacheService = CachedBaseEntity.getCacheService();
    if (cacheService) {
      await cacheService.warmCache(entities as ObjectLiteral[]);
    }
  }
  
  /**
   * Create a query builder with cache support
   * Returns a SelectQueryBuilder with cache-enabled methods
   * 
   * @example
   * const users = await User.createCachedQueryBuilder()
   *   .where('user.isActive = :active', { active: true })
   *   .getManyWithCache();
   */
  static createCachedQueryBuilder<T extends CachedBaseEntity>(
    this: (new() => T) & typeof CachedBaseEntity,
    alias?: string
  ): any {
    const repository = (this as any).getRepository() as Repository<T>;
    return repository.createQueryBuilder(alias || this.name.toLowerCase());
  }
}