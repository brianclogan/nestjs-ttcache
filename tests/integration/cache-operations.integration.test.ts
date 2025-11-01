import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';
import { testDataSource, testRedis } from './setup';
import { CachedBaseEntity, CacheableEntity, TTCacheCore, RedisCacheProvider } from '../../src';

@Entity()
@CacheableEntity({ ttl: 60, writeThrough: true })
class TestUser extends CachedBaseEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  name!: string;

  @Column()
  email!: string;
}

describe('TTCache Integration Tests', () => {
  let cacheService: TTCacheCore;

  beforeAll(async () => {
    // Register entity
    testDataSource.options.entities = [TestUser];
    await testDataSource.synchronize();

    // Setup cache service
    const provider = new RedisCacheProvider(testRedis);
    cacheService = new TTCacheCore(provider, {
      defaultTTL: 60,
      writeThrough: true,
      readThrough: true,
      debug: false,
    });

    // Set cache service on base entity
    CachedBaseEntity.setCacheService(cacheService as any);
  });

  beforeEach(async () => {
    // Clear database
    await testDataSource.getRepository(TestUser).clear();
    // Clear cache
    await testRedis.flushdb();
  });

  describe('Write-through caching', () => {
    it('should cache entity on save', async () => {
      const user = new TestUser();
      user.name = 'John Doe';
      user.email = 'john@example.com';

      const saved = await user.save();
      
      // Check if cached
      const cacheKey = `TestUser:id:${saved.id}`;
      const cached = await cacheService.get(cacheKey);
      
      expect(cached).toBeDefined();
      expect(cached).toMatchObject({
        id: saved.id,
        name: 'John Doe',
        email: 'john@example.com',
      });
    });

    it('should update cache on entity update', async () => {
      const user = new TestUser();
      user.name = 'John Doe';
      user.email = 'john@example.com';
      await user.save();

      // Update entity
      user.name = 'Jane Doe';
      await user.save();

      // Check cache
      const cacheKey = `TestUser:id:${user.id}`;
      const cached = await cacheService.get(cacheKey);
      
      expect(cached).toMatchObject({
        name: 'Jane Doe',
        email: 'john@example.com',
      });
    });

    it('should remove from cache on entity delete', async () => {
      const user = new TestUser();
      user.name = 'John Doe';
      user.email = 'john@example.com';
      const saved = await user.save();
      const userId = saved.id;

      // Verify cached
      const cacheKey = `TestUser:id:${userId}`;
      let cached = await cacheService.get(cacheKey);
      expect(cached).toBeDefined();

      // Delete entity
      await saved.remove();

      // Verify removed from cache
      cached = await cacheService.get(cacheKey);
      expect(cached).toBeNull();
    });
  });

  describe('Read-through caching', () => {
    it('should cache on read miss', async () => {
      // Create user directly in database
      const repo = testDataSource.getRepository(TestUser);
      const user = repo.create({
        name: 'John Doe',
        email: 'john@example.com',
      });
      const saved = await repo.save(user);

      // Clear cache to ensure miss
      await testRedis.flushdb();

      // Read through cache
      const found = await TestUser.findByIdWithCache(saved.id);
      
      expect(found).toBeDefined();
      expect(found?.name).toBe('John Doe');

      // Verify cached
      const cacheKey = `TestUser:id:${saved.id}`;
      const cached = await cacheService.get(cacheKey);
      expect(cached).toBeDefined();
    });

    it('should serve from cache on hit', async () => {
      const user = new TestUser();
      user.name = 'John Doe';
      user.email = 'john@example.com';
      const saved = await user.save();

      // Get statistics before
      const statsBefore = cacheService.getStatistics();

      // Read from cache
      const found = await TestUser.findByIdWithCache(saved.id);
      
      expect(found).toBeDefined();
      expect(found?.name).toBe('John Doe');

      // Verify cache hit
      const statsAfter = cacheService.getStatistics();
      expect(statsAfter.hits).toBe(statsBefore.hits + 1);
    });
  });

  describe('Cache invalidation', () => {
    it('should invalidate related caches on update', async () => {
      // Create multiple users
      const users = [];
      for (let i = 0; i < 3; i++) {
        const user = new TestUser();
        user.name = `User ${i}`;
        user.email = `user${i}@example.com`;
        users.push(await user.save());
      }

      // Cache a find query
      const allUsers = await TestUser.findWithCache();
      expect(allUsers).toHaveLength(3);

      // Update one user
      users[0].name = 'Updated User';
      await users[0].save();

      // The query cache should be invalidated
      // This would need to be verified by checking cache keys
      const keys = await testRedis.keys('TestUser:find:*');
      expect(keys).toHaveLength(0);
    });

    it('should handle bulk operations', async () => {
      // Create multiple users
      const users = [];
      for (let i = 0; i < 5; i++) {
        const user = new TestUser();
        user.name = `User ${i}`;
        user.email = `user${i}@example.com`;
        users.push(user);
      }

      const repo = testDataSource.getRepository(TestUser);
      const saved = await repo.save(users);

      // Warm cache
      await TestUser.warmCache(saved);

      // Verify all cached
      for (const user of saved) {
        const cacheKey = `TestUser:id:${user.id}`;
        const cached = await cacheService.get(cacheKey);
        expect(cached).toBeDefined();
      }
    });
  });

  describe('Cache statistics', () => {
    it('should track cache operations', async () => {
      const user = new TestUser();
      user.name = 'John Doe';
      user.email = 'john@example.com';
      const saved = await user.save();

      // Reset statistics
      cacheService.resetStatistics();

      // Perform operations
      await TestUser.findByIdWithCache(saved.id); // Hit
      await TestUser.findByIdWithCache(999); // Miss
      
      const stats = cacheService.getStatistics();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
      expect(stats.hitRate).toBeCloseTo(0.5);
    });
  });
});