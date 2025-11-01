import {
  EntitySubscriberInterface,
  EventSubscriber,
  InsertEvent,
  UpdateEvent,
  RemoveEvent,
  LoadEvent,
  TransactionStartEvent,
  TransactionCommitEvent,
  TransactionRollbackEvent
} from 'typeorm';
import { Injectable } from '@nestjs/common';
import { TTCacheService } from '../services/ttcache.service';
import { CacheKeyGenerator } from '../utils';
import { isCacheable, getCacheOptions } from '../decorators';

@EventSubscriber()
@Injectable()
export class CacheSubscriber implements EntitySubscriberInterface {
  private transactionCache = new Map<string, any[]>();
  
  constructor(private readonly cacheService: TTCacheService) {}
  
  /**
   * Called after entity insertion
   */
  async afterInsert(event: InsertEvent<any>): Promise<void> {
    if (!event.entity || !isCacheable(event.entity)) {
      return;
    }
    
    const cacheOptions = getCacheOptions(event.entity);
    if (!cacheOptions?.writeThrough) {
      return;
    }
    
    try {
      const cacheKey = CacheKeyGenerator.forEntity(event.entity);
      await this.cacheService.set(
        cacheKey,
        event.entity,
        cacheOptions.ttl
      );
      
      // Invalidate query caches for this entity type
      const entityName = event.entity.constructor.name;
      await this.cacheService.invalidatePattern(
        CacheKeyGenerator.pattern(entityName, 'query')
      );
      await this.cacheService.invalidatePattern(
        CacheKeyGenerator.pattern(entityName, 'find')
      );
      await this.cacheService.invalidatePattern(
        CacheKeyGenerator.pattern(entityName, 'count')
      );
    } catch (error) {
      // Log error but don't fail the operation
      console.error('Cache write failed after insert:', error);
    }
  }
  
  /**
   * Called after entity update
   */
  async afterUpdate(event: UpdateEvent<any>): Promise<void> {
    if (!event.entity || !isCacheable(event.entity)) {
      return;
    }
    
    const cacheOptions = getCacheOptions(event.entity);
    if (!cacheOptions?.writeThrough) {
      return;
    }
    
    try {
      const cacheKey = CacheKeyGenerator.forEntity(event.entity);
      
      // Update the cache with new data
      await this.cacheService.set(
        cacheKey,
        event.entity,
        cacheOptions.ttl
      );
      
      // Invalidate related caches
      const entityName = event.entity.constructor.name;
      
      // Invalidate query and find caches
      await this.cacheService.invalidatePattern(
        CacheKeyGenerator.pattern(entityName, 'query')
      );
      await this.cacheService.invalidatePattern(
        CacheKeyGenerator.pattern(entityName, 'find')
      );
      
      // Invalidate relation caches for this entity
      await this.cacheService.invalidatePattern(
        `${cacheKey}:relation:*`
      );
      
      // If columns changed, invalidate specific caches
      if (event.updatedColumns && event.updatedColumns.length > 0) {
        const changedRelations = event.updatedColumns
          .filter(col => col.relationMetadata)
          .map(col => col.propertyName);
        
        for (const relation of changedRelations) {
          await this.cacheService.delete(
            CacheKeyGenerator.forRelation(event.entity, relation)
          );
        }
      }
    } catch (error) {
      console.error('Cache update failed after update:', error);
    }
  }
  
  /**
   * Called after entity removal
   */
  async afterRemove(event: RemoveEvent<any>): Promise<void> {
    if (!event.entity || !isCacheable(event.entity)) {
      return;
    }
    
    try {
      const cacheKey = CacheKeyGenerator.forEntity(event.entity);
      
      // Delete from cache
      await this.cacheService.delete(cacheKey);
      
      // Invalidate related caches
      const entityName = event.entity.constructor.name;
      
      // Invalidate query and find caches
      await this.cacheService.invalidatePattern(
        CacheKeyGenerator.pattern(entityName, 'query')
      );
      await this.cacheService.invalidatePattern(
        CacheKeyGenerator.pattern(entityName, 'find')
      );
      await this.cacheService.invalidatePattern(
        CacheKeyGenerator.pattern(entityName, 'count')
      );
      
      // Invalidate all relation caches for this entity
      await this.cacheService.invalidatePattern(
        `${cacheKey}:relation:*`
      );
    } catch (error) {
      console.error('Cache deletion failed after remove:', error);
    }
  }
  
  /**
   * Called before entity is loaded from database
   */
  async beforeLoad(_event: LoadEvent<any>): Promise<void> {
    // This could be used to intercept and serve from cache
    // but it's complex with TypeORM's current architecture
  }
  
  /**
   * Called after entity is loaded from database
   */
  async afterLoad(event: LoadEvent<any>): Promise<void> {
    if (!event.entity || !isCacheable(event.entity)) {
      return;
    }
    
    const cacheOptions = getCacheOptions(event.entity);
    if (!cacheOptions?.writeThrough) {
      return;
    }
    
    try {
      // Cache the loaded entity
      const cacheKey = CacheKeyGenerator.forEntity(event.entity);
      await this.cacheService.set(
        cacheKey,
        event.entity,
        cacheOptions.ttl
      );
    } catch (error) {
      // Silent fail - don't break the load operation
      console.error('Cache write failed after load:', error);
    }
  }
  
  /**
   * Called when a transaction starts
   */
  async beforeTransactionStart(event: TransactionStartEvent): Promise<void> {
    // Initialize transaction cache
    const transactionId = this.getTransactionId(event);
    if (transactionId) {
      this.transactionCache.set(transactionId, []);
    }
  }
  
  /**
   * Called when a transaction is committed
   */
  async afterTransactionCommit(event: TransactionCommitEvent): Promise<void> {
    const transactionId = this.getTransactionId(event);
    if (!transactionId) return;
    
    const operations = this.transactionCache.get(transactionId);
    if (operations && operations.length > 0) {
      // Apply all cached operations
      for (const operation of operations) {
        await this.executeOperation(operation);
      }
    }
    
    // Clean up
    this.transactionCache.delete(transactionId);
  }
  
  /**
   * Called when a transaction is rolled back
   */
  async afterTransactionRollback(event: TransactionRollbackEvent): Promise<void> {
    const transactionId = this.getTransactionId(event);
    if (!transactionId) return;
    
    // Discard all cached operations
    this.transactionCache.delete(transactionId);
  }
  
  /**
   * Get a unique transaction ID
   */
  private getTransactionId(event: any): string | null {
    // This is a simplified implementation
    // In reality, you'd need to track the actual transaction
    return event.queryRunner?.data?.transactionId || null;
  }
  
  /**
   * Execute a cached operation
   */
  private async executeOperation(operation: any): Promise<void> {
    switch (operation.type) {
      case 'set':
        await this.cacheService.set(operation.key, operation.value, operation.ttl);
        break;
      case 'delete':
        await this.cacheService.delete(operation.key);
        break;
      case 'invalidate':
        await this.cacheService.invalidatePattern(operation.pattern);
        break;
    }
  }
  
  /**
   * Check if this subscriber is applicable to the given entity
   */
  listenTo(): Function | string {
    // Listen to all entities
    return Object;
  }
}