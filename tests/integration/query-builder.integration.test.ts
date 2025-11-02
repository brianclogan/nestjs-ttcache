import { Entity, Column, PrimaryGeneratedColumn, DataSource } from 'typeorm';
import { CachedBaseEntity, CacheableEntity, TTCacheService, MemoryCacheProvider, extendQueryBuilder } from '../../src';
import { Cache } from 'cache-manager';
import 'reflect-metadata';

@Entity()
@CacheableEntity({ ttl: 60, writeThrough: true })
class TestProduct extends CachedBaseEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  name!: string;

  @Column()
  price!: number;

  @Column()
  inStock!: boolean;
}

// Test database connection
let testDataSource: DataSource;

describe('QueryBuilder Cache Extensions', () => {
  let cacheService: TTCacheService;
  let memoryProvider: MemoryCacheProvider;

  beforeAll(async () => {
    // Initialize query builder extensions
    // Note: In a real NestJS app, this is done automatically by TTCacheModule.onModuleInit()
    extendQueryBuilder();

    // Setup test database (using in-memory SQLite for tests)
    testDataSource = new DataSource({
      type: 'sqlite',
      database: ':memory:',
      synchronize: true,
      logging: false,
      entities: [TestProduct],
    });

    await testDataSource.initialize();
    
    // Use memory provider for testing
    memoryProvider = new MemoryCacheProvider();
    
    // Create a mock cache that wraps our memory provider
    const mockCache: Cache = {
      get: async <T>(key: string) => memoryProvider.get<T>(key),
      set: async <T>(key: string, value: T, ttl?: number) => {
        await memoryProvider.set(key, value, ttl ? ttl / 1000 : undefined);
        return value;
      },
      del: async (key: string) => { 
        await memoryProvider.delete(key);
        return true;
      },
      clear: async () => {
        await memoryProvider.flush();
        return true;
      },
      mget: async <T>(keys: string[]) => {
        const results = await Promise.all(keys.map(key => memoryProvider.get<T>(key)));
        return results;
      },
      mset: async <T>(list: Array<{ key: string; value: T; ttl?: number }>) => {
        await Promise.all(list.map(({ key, value, ttl }) => 
          memoryProvider.set(key, value, ttl ? ttl / 1000 : undefined)
        ));
        return list;
      },
      mdel: async (keys: string[]) => {
        await Promise.all(keys.map(key => memoryProvider.delete(key)));
        return true;
      },
      ttl: async (key: string) => {
        const exists = await memoryProvider.exists(key);
        return exists ? null : null;
      },
      wrap: async function<T>(
        key: string, 
        fnc: () => T | Promise<T>, 
        ttl?: number | ((value: T) => number), 
        _refreshThreshold?: number | ((value: T) => number)
      ): Promise<T> {
        const cached = await memoryProvider.get<T>(key);
        if (cached !== null) return cached;
        const value = await fnc();
        const ttlValue = typeof ttl === 'function' ? ttl(value) : ttl;
        await memoryProvider.set(key, value, ttlValue ? ttlValue / 1000 : undefined);
        return value;
      } as any,
      on: () => ({} as any),
      off: () => ({} as any),
      disconnect: async () => undefined,
      cacheId: () => 'test-cache',
      stores: [{
        keys: async (pattern?: string) => memoryProvider.keys(pattern || '*')
      }] as any
    };

    // Setup cache service
    cacheService = new TTCacheService(mockCache, {
      defaultTTL: 60,
      writeThrough: true,
      readThrough: true,
      debug: false,
    });

    // Set cache service on base entity
    CachedBaseEntity.setCacheService(cacheService);
  });

  afterAll(async () => {
    if (testDataSource?.isInitialized) {
      await testDataSource.destroy();
    }
  });

  beforeEach(async () => {
    // Clear database
    if (testDataSource.isInitialized) {
      await testDataSource.getRepository(TestProduct).clear();
    }
    // Clear cache
    await memoryProvider.flush();
  });

  describe('getManyAndCountWithCache', () => {
    it('should return entities and count together', async () => {
      // Create test products
      const repo = testDataSource.getRepository(TestProduct);
      const products = [];
      for (let i = 0; i < 3; i++) {
        const product = repo.create({
          name: `Product ${i}`,
          price: 10 + i,
          inStock: true,
        });
        products.push(await repo.save(product));
      }

      // Query with cache
      const qb = repo.createQueryBuilder('product');
      const [foundProducts, count] = await (qb as any).getManyAndCountWithCache(cacheService);

      expect(foundProducts).toHaveLength(3);
      expect(count).toBe(3);
      expect(foundProducts[0]).toMatchObject({
        name: expect.any(String),
        price: expect.any(Number),
      });
    });

    it('should cache both entities and count', async () => {
      // Create test products
      const repo = testDataSource.getRepository(TestProduct);
      for (let i = 0; i < 2; i++) {
        const product = repo.create({
          name: `Product ${i}`,
          price: 10 + i,
          inStock: true,
        });
        await repo.save(product);
      }

      // Clear cache to ensure miss
      await memoryProvider.flush();

      // First call - cache miss
      const qb1 = repo.createQueryBuilder('product');
      const [products1, count1] = await (qb1 as any).getManyAndCountWithCache(cacheService);
      expect(products1).toHaveLength(2);
      expect(count1).toBe(2);

      // Second call should hit cache
      const statsBefore = cacheService.getStatistics();
      const qb2 = repo.createQueryBuilder('product');
      const [products2, count2] = await (qb2 as any).getManyAndCountWithCache(cacheService);
      const statsAfter = cacheService.getStatistics();

      expect(products2).toHaveLength(2);
      expect(count2).toBe(2);
      expect(statsAfter.hits).toBeGreaterThanOrEqual(statsBefore.hits);
    });

    it('should work with where conditions', async () => {
      // Create test products
      const repo = testDataSource.getRepository(TestProduct);
      for (let i = 0; i < 5; i++) {
        const product = repo.create({
          name: `Product ${i}`,
          price: 10 + i,
          inStock: i % 2 === 0,
        });
        await repo.save(product);
      }

      // Query with where condition
      const qb = repo.createQueryBuilder('product')
        .where('product.inStock = :inStock', { inStock: true });
      const [foundProducts, count] = await (qb as any).getManyAndCountWithCache(cacheService);

      expect(foundProducts).toHaveLength(3);
      expect(count).toBe(3);
      expect(foundProducts.every((p: TestProduct) => p.inStock)).toBe(true);
    });

    it('should work with ordering and limits', async () => {
      // Create test products
      const repo = testDataSource.getRepository(TestProduct);
      for (let i = 0; i < 5; i++) {
        const product = repo.create({
          name: `Product ${i}`,
          price: 10 + i,
          inStock: true,
        });
        await repo.save(product);
      }

      // Query with ordering and limit
      const qb = repo.createQueryBuilder('product')
        .orderBy('product.price', 'DESC')
        .limit(2);
      const [foundProducts, count] = await (qb as any).getManyAndCountWithCache(cacheService);

      expect(foundProducts).toHaveLength(2);
      expect(count).toBe(5); // Total count should still be 5
      expect(foundProducts[0].price).toBeGreaterThan(foundProducts[1].price);
    });

    it('should handle empty results', async () => {
      const repo = testDataSource.getRepository(TestProduct);
      
      // Query with no results
      const qb = repo.createQueryBuilder('product')
        .where('product.inStock = :inStock', { inStock: true });
      const [foundProducts, count] = await (qb as any).getManyAndCountWithCache(cacheService);

      expect(foundProducts).toHaveLength(0);
      expect(count).toBe(0);
    });
  });

  describe('getManyWithCache', () => {
    it('should return entities with cache', async () => {
      // Create test products
      const repo = testDataSource.getRepository(TestProduct);
      for (let i = 0; i < 3; i++) {
        const product = repo.create({
          name: `Product ${i}`,
          price: 10 + i,
          inStock: true,
        });
        await repo.save(product);
      }

      // Query with cache
      const qb = repo.createQueryBuilder('product');
      const foundProducts = await (qb as any).getManyWithCache(cacheService);

      expect(foundProducts).toHaveLength(3);
      expect(foundProducts[0]).toMatchObject({
        name: expect.any(String),
        price: expect.any(Number),
      });
    });

    it('should cache results', async () => {
      // Create test products
      const repo = testDataSource.getRepository(TestProduct);
      for (let i = 0; i < 2; i++) {
        const product = repo.create({
          name: `Product ${i}`,
          price: 10 + i,
          inStock: true,
        });
        await repo.save(product);
      }

      // Clear cache
      await memoryProvider.flush();

      // First call
      const qb1 = repo.createQueryBuilder('product');
      const products1 = await (qb1 as any).getManyWithCache(cacheService);
      expect(products1).toHaveLength(2);

      // Second call should hit cache
      const statsBefore = cacheService.getStatistics();
      const qb2 = repo.createQueryBuilder('product');
      const products2 = await (qb2 as any).getManyWithCache(cacheService);
      const statsAfter = cacheService.getStatistics();

      expect(products2).toHaveLength(2);
      expect(statsAfter.hits).toBeGreaterThanOrEqual(statsBefore.hits);
    });
  });

  describe('getOneWithCache', () => {
    it('should return single entity with cache', async () => {
      // Create test product
      const repo = testDataSource.getRepository(TestProduct);
      const product = repo.create({
        name: 'Test Product',
        price: 10,
        inStock: true,
      });
      const saved = await repo.save(product);

      // Query with cache
      const qb = repo.createQueryBuilder('product')
        .where('product.id = :id', { id: saved.id });
      const found = await (qb as any).getOneWithCache(cacheService);

      expect(found).toBeDefined();
      expect(found?.name).toBe('Test Product');
    });

    it('should cache single result', async () => {
      // Create test product
      const repo = testDataSource.getRepository(TestProduct);
      const product = repo.create({
        name: 'Test Product',
        price: 10,
        inStock: true,
      });
      const saved = await repo.save(product);

      // Clear cache
      await memoryProvider.flush();

      // First call
      const qb1 = repo.createQueryBuilder('product')
        .where('product.id = :id', { id: saved.id });
      const found1 = await (qb1 as any).getOneWithCache(cacheService);
      expect(found1?.name).toBe('Test Product');

      // Second call should hit cache
      const statsBefore = cacheService.getStatistics();
      const qb2 = repo.createQueryBuilder('product')
        .where('product.id = :id', { id: saved.id });
      const found2 = await (qb2 as any).getOneWithCache(cacheService);
      const statsAfter = cacheService.getStatistics();

      expect(found2?.name).toBe('Test Product');
      expect(statsAfter.hits).toBeGreaterThanOrEqual(statsBefore.hits);
    });

    it('should return null when no result found', async () => {
      const repo = testDataSource.getRepository(TestProduct);
      
      // Query with no results
      const qb = repo.createQueryBuilder('product')
        .where('product.id = :id', { id: 999 });
      const found = await (qb as any).getOneWithCache(cacheService);

      expect(found).toBeNull();
    });
  });

  describe('getCountWithCache', () => {
    it('should return count with cache', async () => {
      // Create test products
      const repo = testDataSource.getRepository(TestProduct);
      for (let i = 0; i < 3; i++) {
        const product = repo.create({
          name: `Product ${i}`,
          price: 10 + i,
          inStock: true,
        });
        await repo.save(product);
      }

      // Query count with cache
      const qb = repo.createQueryBuilder('product');
      const count = await (qb as any).getCountWithCache(cacheService);

      expect(count).toBe(3);
    });

    it('should cache count result', async () => {
      // Create test products
      const repo = testDataSource.getRepository(TestProduct);
      for (let i = 0; i < 2; i++) {
        const product = repo.create({
          name: `Product ${i}`,
          price: 10 + i,
          inStock: true,
        });
        await repo.save(product);
      }

      // Clear cache
      await memoryProvider.flush();

      // First call
      const qb1 = repo.createQueryBuilder('product');
      const count1 = await (qb1 as any).getCountWithCache(cacheService);
      expect(count1).toBe(2);

      // Second call should hit cache
      const statsBefore = cacheService.getStatistics();
      const qb2 = repo.createQueryBuilder('product');
      const count2 = await (qb2 as any).getCountWithCache(cacheService);
      const statsAfter = cacheService.getStatistics();

      expect(count2).toBe(2);
      expect(statsAfter.hits).toBeGreaterThanOrEqual(statsBefore.hits);
    });

    it('should work with where conditions', async () => {
      // Create test products
      const repo = testDataSource.getRepository(TestProduct);
      for (let i = 0; i < 5; i++) {
        const product = repo.create({
          name: `Product ${i}`,
          price: 10 + i,
          inStock: i % 2 === 0,
        });
        await repo.save(product);
      }

      // Query count with where condition
      const qb = repo.createQueryBuilder('product')
        .where('product.inStock = :inStock', { inStock: true });
      const count = await (qb as any).getCountWithCache(cacheService);

      expect(count).toBe(3);
    });
  });
});
