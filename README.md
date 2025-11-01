# TypeORM TTCache

A write-through cache implementation for TypeORM inspired by Square's TTCache system. This package provides automatic caching for TypeORM entities with support for write-through and read-through caching patterns.

## Features

- 🚀 **Write-through caching** - Automatically cache entities on write operations
- 📖 **Read-through caching** - Serve reads from cache with automatic fallback to database
- 🔄 **Automatic cache invalidation** - Invalidate cache on updates/deletes
- 🔗 **Relation support** - Handle complex entity relations and cascading invalidation
- 🎯 **Query caching** - Cache complex query results with fingerprinting
- 🛡️ **Cache stampede protection** - Prevent thundering herd on cache misses
- 📊 **Statistics tracking** - Monitor cache performance with built-in metrics
- 🔌 **Multiple cache providers** - Support for Redis and in-memory caching
- 🏗️ **Circuit breaker** - Automatic fallback when cache fails
- 🔥 **Cache warming** - Preload frequently accessed data on startup

## Installation

```bash
npm install nestjs-ttcache
# or
yarn add nestjs-ttcache
```

## Installation

```bash
npm install nestjs-ttcache ioredis
# or
yarn add nestjs-ttcache ioredis
```

## Quick Start

### 1. Configure the module

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import Redis from 'ioredis';
import { TTCacheModule, RedisCacheProvider } from 'nestjs-ttcache';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      // Your TypeORM configuration
    }),
    
    TTCacheModule.forRoot({
      provider: new RedisCacheProvider(new Redis()),
      defaultTTL: 3600,
      writeThrough: true,
      readThrough: true,
      stampedeProtection: true,
      enableStatistics: true
    })
  ]
})
export class AppModule {}
```

### 2. Mark entities as cacheable

```typescript
import { Entity, Column, PrimaryGeneratedColumn } from 'typeorm';
import { CachedBaseEntity, CacheableEntity, CacheKey } from 'nestjs-ttcache';

@Entity()
@CacheableEntity({
  ttl: 3600,
  writeThrough: true
})
export class User extends CachedBaseEntity {
  @PrimaryGeneratedColumn()
  id: number;
  
  @Column()
  @CacheKey() // Use as part of cache key
  email: string;
  
  @Column()
  name: string;
}
```

### 3. Use cached operations

```typescript
// Automatically cached reads
const user = await User.findByIdWithCache(1);

// Automatically cached writes
const newUser = new User();
newUser.email = 'user@example.com';
newUser.name = 'John Doe';
await newUser.save(); // Writes to DB and cache

// Automatic cache invalidation
await user.remove(); // Removes from DB and cache
```

## Decorators

### @CacheableEntity(options)

Mark an entity as cacheable with configuration options:

```typescript
@CacheableEntity({
  ttl: 3600,              // Time to live in seconds
  prefix: 'user',         // Cache key prefix
  cacheRelations: true,   // Cache entity relations
  writeThrough: true      // Enable write-through caching
})
```

### @CacheKey()

Mark properties that should be part of the cache key:

```typescript
@Column()
@CacheKey()
email: string;
```

### @CacheTTL(seconds)

Set TTL for specific methods or properties:

```typescript
@CacheTTL(7200)
async getExpensiveData() {
  // This result will be cached for 2 hours
}
```

### @PreloadCache(options)

Mark entities for cache preloading on startup:

```typescript
@PreloadCache({
  onStartup: true,
  relations: ['roles', 'permissions']
})
```

## Cache-Enabled Methods

The `CachedBaseEntity` provides these cache-aware methods:

- `findOneWithCache(options)` - Find one entity with cache support
- `findByIdWithCache(id)` - Find entity by ID with cache
- `findWithCache(options)` - Find multiple entities with cache
- `countWithCache(options)` - Count entities with cache
- `createAndSave(data)` - Create and save entity with cache
- `updateWithCache(criteria, data)` - Update with cache invalidation
- `deleteWithCache(criteria)` - Delete with cache invalidation
- `invalidateCache()` - Invalidate all caches for entity type
- `warmCache(entities)` - Pre-warm cache with entities

## Advanced Usage

### Custom Cache Operations

```typescript
import { TTCacheService, CacheKeyGenerator } from 'nestjs-ttcache';

@Injectable()
export class UserService {
  constructor(private cacheService: TTCacheService) {}
  
  async findByEmail(email: string): Promise<User> {
    const cacheKey = CacheKeyGenerator.buildKey('user', 'email', email);
    
    return await this.cacheService.readThrough(
      cacheKey,
      () => this.userRepository.findOne({ where: { email } }),
      3600 // TTL
    );
  }
}
```

### Query Caching

```typescript
const queryBuilder = userRepository
  .createQueryBuilder('user')
  .where('user.isActive = :active', { active: true });

const users = await cacheService.cacheQuery(queryBuilder, 1800);
```

### Cache Warming

```typescript
// Warm cache with frequently accessed data
const popularUsers = await userRepository.find({ 
  where: { isPopular: true } 
});
await User.warmCache(popularUsers);
```

### Cache Statistics

```typescript
const stats = cacheService.getStatistics();
console.log(`Cache hit rate: ${stats.hitRate * 100}%`);
console.log(`Average load time: ${stats.averageLoadTime}ms`);
```

## Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `provider` | CacheProvider | Required | Cache provider instance (Redis/Memory) |
| `defaultTTL` | number | 3600 | Default TTL in seconds |
| `debug` | boolean | false | Enable debug logging |
| `enableStatistics` | boolean | false | Track cache statistics |
| `writeThrough` | boolean | true | Enable write-through caching |
| `readThrough` | boolean | true | Enable read-through caching |
| `keyPrefix` | string | '' | Global cache key prefix |
| `warmOnStartup` | boolean | false | Warm cache on application startup |
| `staleWhileRevalidate` | boolean | false | Serve stale data while fetching fresh |
| `staleTTL` | number | 300 | TTL for stale data in seconds |
| `stampedeProtection` | boolean | false | Prevent cache stampede |
| `invalidateRelations` | boolean | true | Auto-invalidate relation caches |
| `circuitBreaker` | object | undefined | Circuit breaker configuration |

## Cache Providers

### Redis Provider

```typescript
import Redis from 'ioredis';
import { RedisCacheProvider } from 'nestjs-ttcache';

const redis = new Redis({
  host: 'localhost',
  port: 6379
});

const provider = new RedisCacheProvider(redis);
```

### Memory Provider (for testing)

```typescript
import { MemoryCacheProvider } from 'nestjs-ttcache';

const provider = new MemoryCacheProvider();
```

## Best Practices

1. **Use appropriate TTLs** - Set TTLs based on data volatility
2. **Enable stampede protection** - Prevent thundering herd for popular keys
3. **Monitor statistics** - Track hit rates and adjust caching strategy
4. **Warm critical data** - Preload frequently accessed data
5. **Use circuit breaker** - Protect against cache failures
6. **Invalidate wisely** - Use pattern invalidation for related data

## Performance Considerations

- **Batch operations** - Use `mget`/`mset` for multiple keys
- **Pipeline Redis commands** - Reduce round trips
- **Use appropriate data structures** - Leverage Redis data types
- **Monitor memory usage** - Set appropriate max memory policies
- **Use compression** - For large objects

## Testing

The package includes testing utilities:

```typescript
import { MemoryCacheProvider } from 'nestjs-ttcache';

// Use in-memory cache for tests
const testProvider = new MemoryCacheProvider();

// Clear cache between tests
afterEach(async () => {
  await testProvider.flush();
});
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT

## Inspired By

This package is inspired by [Square's TTCache](https://github.com/square/ttcache) system, adapted for TypeORM and NestJS.