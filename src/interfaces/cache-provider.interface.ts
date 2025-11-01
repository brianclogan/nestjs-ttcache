export interface CacheProvider {
  /**
   * Get a value from cache
   */
  get<T = any>(key: string): Promise<T | null>;
  
  /**
   * Set a value in cache
   */
  set<T = any>(key: string, value: T, ttl?: number): Promise<void>;
  
  /**
   * Delete a value from cache
   */
  delete(key: string): Promise<boolean>;
  
  /**
   * Delete multiple keys matching a pattern
   */
  deletePattern(pattern: string): Promise<number>;
  
  /**
   * Check if a key exists
   */
  exists(key: string): Promise<boolean>;
  
  /**
   * Get multiple values
   */
  mget<T = any>(keys: string[]): Promise<(T | null)[]>;
  
  /**
   * Set multiple values
   */
  mset(items: Array<{ key: string; value: any; ttl?: number }>): Promise<void>;
  
  /**
   * Clear all cache
   */
  flush(): Promise<void>;
  
  /**
   * Get all keys matching a pattern
   */
  keys(pattern: string): Promise<string[]>;
  
  /**
   * Set expiration time for a key
   */
  expire(key: string, ttl: number): Promise<boolean>;
  
  /**
   * Get remaining TTL for a key
   */
  ttl(key: string): Promise<number>;
  
  /**
   * Execute operations in a transaction
   */
  transaction<T>(operations: () => Promise<T>): Promise<T>;
  
  /**
   * Increment a numeric value
   */
  increment(key: string, by?: number): Promise<number>;
  
  /**
   * Decrement a numeric value
   */
  decrement(key: string, by?: number): Promise<number>;
}