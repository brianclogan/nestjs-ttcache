import { Redis } from 'ioredis';
import { CacheProvider } from '../interfaces';

export class RedisCacheProvider implements CacheProvider {
  constructor(private readonly redis: Redis) {}
  
  async get<T = any>(key: string): Promise<T | null> {
    const value = await this.redis.get(key);
    if (!value) return null;
    
    try {
      return JSON.parse(value);
    } catch {
      return value as T;
    }
  }
  
  async set<T = any>(key: string, value: T, ttl?: number): Promise<void> {
    const serialized = typeof value === 'string' ? value : JSON.stringify(value);
    
    if (ttl) {
      await this.redis.setex(key, ttl, serialized);
    } else {
      await this.redis.set(key, serialized);
    }
  }
  
  async delete(key: string): Promise<boolean> {
    const result = await this.redis.del(key);
    return result > 0;
  }
  
  async deletePattern(pattern: string): Promise<number> {
    const keys = await this.keys(pattern);
    if (keys.length === 0) return 0;
    
    const pipeline = this.redis.pipeline();
    keys.forEach(key => pipeline.del(key));
    
    const results = await pipeline.exec();
    return results?.length || 0;
  }
  
  async exists(key: string): Promise<boolean> {
    const result = await this.redis.exists(key);
    return result === 1;
  }
  
  async mget<T = any>(keys: string[]): Promise<(T | null)[]> {
    if (keys.length === 0) return [];
    
    const values = await this.redis.mget(...keys);
    return values.map(value => {
      if (!value) return null;
      
      try {
        return JSON.parse(value);
      } catch {
        return value as T;
      }
    });
  }
  
  async mset(items: Array<{ key: string; value: any; ttl?: number }>): Promise<void> {
    const pipeline = this.redis.pipeline();
    
    items.forEach(({ key, value, ttl }) => {
      const serialized = typeof value === 'string' ? value : JSON.stringify(value);
      
      if (ttl) {
        pipeline.setex(key, ttl, serialized);
      } else {
        pipeline.set(key, serialized);
      }
    });
    
    await pipeline.exec();
  }
  
  async flush(): Promise<void> {
    await this.redis.flushdb();
  }
  
  async keys(pattern: string): Promise<string[]> {
    return await this.redis.keys(pattern);
  }
  
  async expire(key: string, ttl: number): Promise<boolean> {
    const result = await this.redis.expire(key, ttl);
    return result === 1;
  }
  
  async ttl(key: string): Promise<number> {
    return await this.redis.ttl(key);
  }
  
  async transaction<T>(operations: () => Promise<T>): Promise<T> {
    // Redis transactions are handled differently
    // This is a simplified implementation
    return await operations();
  }
  
  async increment(key: string, by: number = 1): Promise<number> {
    return await this.redis.incrby(key, by);
  }
  
  async decrement(key: string, by: number = 1): Promise<number> {
    return await this.redis.decrby(key, by);
  }
  
  /**
   * Execute a Redis pipeline
   */
  pipeline() {
    return this.redis.pipeline();
  }
  
  /**
   * Subscribe to Redis pub/sub channel
   */
  async subscribe(channel: string, callback: (message: string) => void): Promise<void> {
    const subscriber = this.redis.duplicate();
    await subscriber.subscribe(channel);
    subscriber.on('message', (_channel, message) => {
      if (_channel === channel) {
        callback(message);
      }
    });
  }
  
  /**
   * Publish to Redis pub/sub channel
   */
  async publish(channel: string, message: string): Promise<number> {
    return await this.redis.publish(channel, message);
  }
}