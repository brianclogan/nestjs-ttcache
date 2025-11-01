import { createHash } from 'crypto';
import { ObjectLiteral, SelectQueryBuilder } from 'typeorm';
import { getCacheKeys, getCacheOptions } from '../decorators';

export class CacheKeyGenerator {
  private static readonly SEPARATOR = ':';
  
  /**
   * Generate cache key for an entity by its primary key
   */
  static forEntity(entity: ObjectLiteral, entityName?: string): string {
    const name = entityName || entity.constructor.name;
    const options = getCacheOptions(entity);
    const prefix = options?.prefix || name;
    
    // Try to get custom cache keys first
    const customKeys = getCacheKeys(entity);
    if (customKeys.length > 0) {
      const keyValues = customKeys.map(key => entity[key]).filter(v => v !== undefined);
      if (keyValues.length > 0) {
        return this.buildKey(prefix, 'custom', ...keyValues);
      }
    }
    
    // Fallback to primary key
    if (entity.id) {
      return this.buildKey(prefix, 'id', entity.id);
    }
    
    // Handle composite keys
    const compositeKey = this.extractCompositeKey(entity);
    if (compositeKey) {
      return this.buildKey(prefix, 'composite', compositeKey);
    }
    
    throw new Error(`Cannot generate cache key for entity ${name}: no primary key found`);
  }
  
  /**
   * Generate cache key for a query
   */
  static forQuery(queryBuilder: SelectQueryBuilder<any>): string {
    const entityName = queryBuilder.alias;
    const query = queryBuilder.getQuery();
    const parameters = queryBuilder.getParameters();
    
    const hash = this.hashObject({ query, parameters });
    return this.buildKey(entityName, 'query', hash);
  }
  
  /**
   * Generate cache key for a find operation
   */
  static forFind(entityName: string, options: any): string {
    const hash = this.hashObject(options);
    return this.buildKey(entityName, 'find', hash);
  }
  
  /**
   * Generate cache key for a relation
   */
  static forRelation(entity: ObjectLiteral, relationName: string): string {
    const entityKey = this.forEntity(entity);
    return this.buildKey(entityKey, 'relation', relationName);
  }
  
  /**
   * Generate cache key pattern for invalidation
   */
  static pattern(entityName: string, type?: string): string {
    const parts = [entityName];
    if (type) {
      parts.push(type);
    }
    parts.push('*');
    return parts.join(this.SEPARATOR);
  }
  
  /**
   * Build a cache key from parts
   */
  static buildKey(...parts: (string | number | boolean)[]): string {
    return parts
      .filter(part => part !== undefined && part !== null)
      .map(part => String(part))
      .join(this.SEPARATOR);
  }
  
  /**
   * Parse a cache key into its components
   */
  static parseKey(key: string): { entity?: string; type?: string; id?: string; rest?: string[] } {
    const parts = key.split(this.SEPARATOR);
    return {
      entity: parts[0],
      type: parts[1],
      id: parts[2],
      rest: parts.slice(3)
    };
  }
  
  /**
   * Hash an object to create a consistent key
   */
  private static hashObject(obj: any): string {
    const str = JSON.stringify(this.sortObject(obj));
    return createHash('sha256').update(str).digest('hex').substring(0, 16);
  }
  
  /**
   * Sort object keys for consistent hashing
   */
  private static sortObject(obj: any): any {
    if (obj === null || typeof obj !== 'object') {
      return obj;
    }
    
    if (Array.isArray(obj)) {
      return obj.map(item => this.sortObject(item));
    }
    
    const sorted: any = {};
    Object.keys(obj).sort().forEach(key => {
      sorted[key] = this.sortObject(obj[key]);
    });
    
    return sorted;
  }
  
  /**
   * Extract composite key from entity
   */
  private static extractCompositeKey(entity: ObjectLiteral): string | null {
    // Check for common composite key patterns
    const compositePatterns = [
      ['userId', 'organizationId'],
      ['tenantId', 'id'],
      ['companyId', 'id']
    ];
    
    for (const pattern of compositePatterns) {
      const values = pattern.map(key => entity[key]).filter(v => v !== undefined);
      if (values.length === pattern.length) {
        return values.join('_');
      }
    }
    
    return null;
  }
  
  /**
   * Generate cache key for paginated results
   */
  static forPagination(entityName: string, page: number, limit: number, options?: any): string {
    const optionsHash = options ? this.hashObject(options) : 'default';
    return this.buildKey(entityName, 'page', page, limit, optionsHash);
  }
  
  /**
   * Generate cache key for count queries
   */
  static forCount(entityName: string, options?: any): string {
    const optionsHash = options ? this.hashObject(options) : 'all';
    return this.buildKey(entityName, 'count', optionsHash);
  }
  
  /**
   * Generate cache key for aggregate queries
   */
  static forAggregate(entityName: string, operation: string, field: string, options?: any): string {
    const optionsHash = options ? this.hashObject(options) : 'all';
    return this.buildKey(entityName, 'aggregate', operation, field, optionsHash);
  }
}