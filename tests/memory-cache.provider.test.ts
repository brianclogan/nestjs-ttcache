import { MemoryCacheProvider } from '../src/providers/memory-cache.provider';

describe('MemoryCacheProvider', () => {
  let provider: MemoryCacheProvider;
  
  beforeEach(() => {
    provider = new MemoryCacheProvider();
  });
  
  afterEach(async () => {
    await provider.flush();
  });
  
  describe('get/set', () => {
    it('should set and get a value', async () => {
      await provider.set('key1', 'value1');
      const value = await provider.get('key1');
      expect(value).toBe('value1');
    });
    
    it('should return null for non-existent key', async () => {
      const value = await provider.get('nonexistent');
      expect(value).toBeNull();
    });
    
    it('should handle objects', async () => {
      const obj = { name: 'test', value: 123 };
      await provider.set('obj', obj);
      const retrieved = await provider.get('obj');
      expect(retrieved).toEqual(obj);
    });
    
    it('should respect TTL', async () => {
      await provider.set('ttl-key', 'value', 1); // 1 second TTL
      
      // Should exist immediately
      let value = await provider.get('ttl-key');
      expect(value).toBe('value');
      
      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 1100));
      
      // Should be expired
      value = await provider.get('ttl-key');
      expect(value).toBeNull();
    });
  });
  
  describe('delete', () => {
    it('should delete a key', async () => {
      await provider.set('key1', 'value1');
      const deleted = await provider.delete('key1');
      expect(deleted).toBe(true);
      
      const value = await provider.get('key1');
      expect(value).toBeNull();
    });
    
    it('should return false for non-existent key', async () => {
      const deleted = await provider.delete('nonexistent');
      expect(deleted).toBe(false);
    });
  });
  
  describe('exists', () => {
    it('should check if key exists', async () => {
      await provider.set('key1', 'value1');
      
      const exists1 = await provider.exists('key1');
      expect(exists1).toBe(true);
      
      const exists2 = await provider.exists('nonexistent');
      expect(exists2).toBe(false);
    });
  });
  
  describe('mget/mset', () => {
    it('should get multiple values', async () => {
      await provider.set('key1', 'value1');
      await provider.set('key2', 'value2');
      
      const values = await provider.mget(['key1', 'key2', 'key3']);
      expect(values).toEqual(['value1', 'value2', null]);
    });
    
    it('should set multiple values', async () => {
      await provider.mset([
        { key: 'key1', value: 'value1', ttl: 10 },
        { key: 'key2', value: 'value2' },
        { key: 'key3', value: { nested: true } }
      ]);
      
      const values = await provider.mget(['key1', 'key2', 'key3']);
      expect(values).toEqual(['value1', 'value2', { nested: true }]);
    });
  });
  
  describe('keys', () => {
    it('should find keys by pattern', async () => {
      await provider.set('user:1', 'user1');
      await provider.set('user:2', 'user2');
      await provider.set('post:1', 'post1');
      
      const userKeys = await provider.keys('user:*');
      expect(userKeys.sort()).toEqual(['user:1', 'user:2']);
      
      const allKeys = await provider.keys('*');
      expect(allKeys.sort()).toEqual(['post:1', 'user:1', 'user:2']);
    });
  });
  
  describe('deletePattern', () => {
    it('should delete keys by pattern', async () => {
      await provider.set('cache:user:1', 'user1');
      await provider.set('cache:user:2', 'user2');
      await provider.set('cache:post:1', 'post1');
      
      const deleted = await provider.deletePattern('cache:user:*');
      expect(deleted).toBe(2);
      
      const remaining = await provider.keys('cache:*');
      expect(remaining).toEqual(['cache:post:1']);
    });
  });
  
  describe('increment/decrement', () => {
    it('should increment a value', async () => {
      const result1 = await provider.increment('counter');
      expect(result1).toBe(1);
      
      const result2 = await provider.increment('counter', 5);
      expect(result2).toBe(6);
    });
    
    it('should decrement a value', async () => {
      await provider.set('counter', 10);
      
      const result1 = await provider.decrement('counter');
      expect(result1).toBe(9);
      
      const result2 = await provider.decrement('counter', 3);
      expect(result2).toBe(6);
    });
  });
  
  describe('expire', () => {
    it('should set expiration on existing key', async () => {
      await provider.set('key1', 'value1');
      
      const success = await provider.expire('key1', 1);
      expect(success).toBe(true);
      
      // Should still exist
      let value = await provider.get('key1');
      expect(value).toBe('value1');
      
      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 1100));
      
      // Should be expired
      value = await provider.get('key1');
      expect(value).toBeNull();
    });
    
    it('should return false for non-existent key', async () => {
      const success = await provider.expire('nonexistent', 10);
      expect(success).toBe(false);
    });
  });
  
  describe('ttl', () => {
    it('should return remaining TTL', async () => {
      await provider.set('key1', 'value1', 10);
      
      const ttl = await provider.ttl('key1');
      expect(ttl).toBeGreaterThan(8);
      expect(ttl).toBeLessThanOrEqual(10);
    });
    
    it('should return -1 for key without expiration', async () => {
      await provider.set('key1', 'value1');
      const ttl = await provider.ttl('key1');
      expect(ttl).toBe(-1);
    });
    
    it('should return -2 for non-existent key', async () => {
      const ttl = await provider.ttl('nonexistent');
      expect(ttl).toBe(-2);
    });
  });
  
  describe('flush', () => {
    it('should clear all keys', async () => {
      await provider.set('key1', 'value1');
      await provider.set('key2', 'value2');
      await provider.set('key3', 'value3');
      
      await provider.flush();
      
      const keys = await provider.keys('*');
      expect(keys).toEqual([]);
    });
  });
});