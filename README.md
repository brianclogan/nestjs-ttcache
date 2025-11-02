# NestJS TTCache

[![CI](https://github.com/yourusername/nestjs-ttcache/actions/workflows/ci.yml/badge.svg)](https://github.com/yourusername/nestjs-ttcache/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/yourusername/nestjs-ttcache/branch/main/graph/badge.svg)](https://codecov.io/gh/yourusername/nestjs-ttcache)
[![npm version](https://badge.fury.io/js/nestjs-ttcache.svg)](https://badge.fury.io/js/nestjs-ttcache)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0%2B-blue)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-16%2B-green)](https://nodejs.org/)

A write-through cache implementation for NestJS with TypeORM inspired by Square's TTCache system. This package provides automatic caching for TypeORM entities with support for write-through and read-through caching patterns in NestJS applications.

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
# or
pnpm add nestjs-ttcache

# Optional: Install a cache store (if not using default memory store)
npm install cache-manager-ioredis-yet
# or
npm install @keyv/redis
```

## Quick Start

### 1. Configure the module

```typescript
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CacheModule } from '@nestjs/cache-manager';
import { TTCacheModule } from 'nestjs-ttcache';
import * as redisStore from 'cache-manager-ioredis-yet';

@Module({
  imports: [
    TypeOrmModule.forRoot({
      // Your TypeORM configuration
    }),
    
    // Option 1: Use with NestJS Cache Module (Recommended)
    CacheModule.register({
      store: redisStore,
      host: 'localhost',
      port: 6379,
      ttl: 3600, // seconds
      isGlobal: true,
    }),
    
    TTCacheModule.forRoot({
      // TTCache will automatically use the NestJS Cache Manager
      defaultTTL: 3600,
      writeThrough: true,
      readThrough: true,
      stampedeProtection: true,
      enableStatistics: true,
      keyPrefix: 'ttcache'
    })
  ]
})
export class AppModule {}
```

Or use the default in-memory cache:

```typescript
@Module({
  imports: [
    TypeOrmModule.forRoot({
      // Your TypeORM configuration
    }),
    
    // TTCache will automatically configure NestJS Cache Module with memory store
    TTCacheModule.forRoot({
      defaultTTL: 3600,
      writeThrough: true,
      readThrough: true
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
- `findAndCountWithCache(options)` - Find entities and get total count with cache
- `createAndSave(data)` - Create and save entity with cache
- `updateWithCache(criteria, data)` - Update with cache invalidation
- `deleteWithCache(criteria)` - Delete with cache invalidation
- `invalidateCache()` - Invalidate all caches for entity type
- `warmCache(entities)` - Pre-warm cache with entities
- `createCachedQueryBuilder(alias?)` - Create a query builder with cache-enabled methods

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

### Find and Count with Cache

```typescript
// Get paginated results with total count in a single cached operation
const [users, totalCount] = await User.findAndCountWithCache({
  skip: 0,
  take: 10,
  order: { createdAt: 'DESC' }
});

console.log(`Found ${users.length} users out of ${totalCount} total`);
```

This method is particularly useful for pagination scenarios where you need both the paginated results and the total count. Both the entities and count are cached separately, allowing for efficient cache hits even when pagination parameters change.

### QueryBuilder with Cache

You can use cache-aware methods directly on TypeORM's QueryBuilder. The extensions are automatically initialized when TTCacheModule is loaded, so no additional setup is required. The cache service is automatically injected, so you don't need to pass it manually.

There are two ways to use cached query builders:

**Option 1: Using the entity's helper method (Recommended)**

```typescript
// Get many results with cache
const users = await User.createCachedQueryBuilder()
  .where('user.isActive = :active', { active: true })
  .getManyWithCache();

// Get one result with cache
const user = await User.createCachedQueryBuilder()
  .where('user.id = :id', { id: 1 })
  .getOneWithCache();

// Get count with cache
const count = await User.createCachedQueryBuilder()
  .where('user.isActive = :active', { active: true })
  .getCountWithCache();

// Get many results and count with cache (useful for pagination)
const [users, totalCount] = await User.createCachedQueryBuilder()
  .where('user.isActive = :active', { active: true })
  .orderBy('user.createdAt', 'DESC')
  .skip(0)
  .take(10)
  .getManyAndCountWithCache();

console.log(`Found ${users.length} users out of ${totalCount} total`);
```

**Option 2: Using the repository directly**

```typescript
// Get many results with cache
const users = await userRepository
  .createQueryBuilder('user')
  .where('user.isActive = :active', { active: true })
  .getManyWithCache();

// Get one result with cache
const user = await userRepository
  .createQueryBuilder('user')
  .where('user.id = :id', { id: 1 })
  .getOneWithCache();

// Get count with cache
const count = await userRepository
  .createQueryBuilder('user')
  .where('user.isActive = :active', { active: true })
  .getCountWithCache();

// Get many results and count with cache (useful for pagination)
const [users, totalCount] = await userRepository
  .createQueryBuilder('user')
  .where('user.isActive = :active', { active: true })
  .orderBy('user.createdAt', 'DESC')
  .skip(0)
  .take(10)
  .getManyAndCountWithCache();

console.log(`Found ${users.length} users out of ${totalCount} total`);
```

All QueryBuilder cache methods support an optional TTL parameter:

```typescript
const [users, count] = await userRepository
  .createQueryBuilder('user')
  .getManyAndCountWithCache(1800); // 30 minutes TTL
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

### Logging and Debugging

TTCache provides comprehensive logging at multiple levels to help you debug cache operations in production:

```typescript
TTCacheModule.forRoot({
  defaultTTL: 3600,
  // Set log level: 'log' (default), 'debug', 'verbose', 'warn', 'error'
  logLevel: 'debug',
  // Enable debug mode for additional cache operation details
  debug: true
})
```

**Log Levels:**
- `'log'` (default) - Basic operational logs (initialization, cache warming)
- `'debug'` - Detailed cache operations (hits, misses, sets, deletes)
- `'verbose'` - Very detailed information for deep debugging
- `'warn'` - Warning messages (circuit breaker, missing datasource)
- `'error'` - Error messages only

**Example logs:**
```
[Nest] 12345 - 11/02/2025, 11:19:05 AM LOG [TTCacheService] TTCacheService initialized with logLevel: debug
[Nest] 12345 - 11/02/2025, 11:19:05 AM LOG [TTCacheModule] Cache subscriber registered with TypeORM
[Nest] 12345 - 11/02/2025, 11:19:05 AM LOG [TTCacheModule] Warmed cache with 50 User entities
[Nest] 12345 - 11/02/2025, 11:19:06 AM DEBUG [TTCacheService] Cache HIT: ttcache:User:find:abc123def456
[Nest] 12345 - 11/02/2025, 11:19:07 AM DEBUG [TTCacheService] Cache SET: ttcache:User:id:1 (TTL: 3600s)
```

**Verbose logging example (with cache service details):**
```
[Nest] 12345 - 11/02/2025, 11:19:05 AM LOG [TTCacheService] TTCacheService initialized with logLevel: verbose
[Nest] 12345 - 11/02/2025, 11:19:05 AM VERBOSE [TTCacheService] Cache Service: Redis | Version: 6.0.0 | Store: cache-manager-redis
[Nest] 12345 - 11/02/2025, 11:19:05 AM LOG [TTCacheModule] Cache subscriber registered with TypeORM
```

When using verbose logging, TTCache will automatically detect and log:
- **Cache Service Type**: Redis, Memory, Memcached, MongoDB, or custom store
- **Version**: The version of the cache-manager package being used
- **Store**: The specific cache store implementation

## Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `provider` | CacheProvider | Required | Cache provider instance (Redis/Memory) |
| `defaultTTL` | number | 3600 | Default TTL in seconds |
| `debug` | boolean | false | Enable debug logging |
| `logLevel` | LogLevel | 'log' | Log level for TTCache operations ('log', 'error', 'warn', 'debug', 'verbose') |
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

## Cache Integration

NestJS TTCache integrates seamlessly with the NestJS Cache Module, allowing you to:
- **Reuse existing cache configuration** - No duplicate Redis connections
- **Share cache storage** - Use the same cache store for all caching needs
- **Leverage NestJS patterns** - Consistent with NestJS best practices

### Using with Redis

```typescript
import { CacheModule } from '@nestjs/cache-manager';
import * as redisStore from 'cache-manager-ioredis-yet';

@Module({
  imports: [
    CacheModule.register({
      store: redisStore,
      host: 'localhost',
      port: 6379,
      ttl: 3600,
      isGlobal: true,
    }),
    TTCacheModule.forRoot({
      keyPrefix: 'ttcache' // Prefix to avoid key collisions
    })
  ]
})
```

### Using with Custom Cache Instance

```typescript
import { Cache } from 'cache-manager';
import { caching } from 'cache-manager';

// Create a custom cache instance
const customCache = await caching('memory', {
  max: 100,
  ttl: 10 * 1000 // 10 seconds
});

@Module({
  imports: [
    TTCacheModule.forRoot({
      cache: customCache, // Use custom cache instance
      defaultTTL: 3600
    })
  ]
})
```

### Using Different Caches for Different Modules

```typescript
// App Module - Global cache configuration
@Module({
  imports: [
    CacheModule.register({ isGlobal: true }),
    TTCacheModule.forRoot({
      keyPrefix: 'global'
    })
  ]
})
export class AppModule {}

// Feature Module - Custom cache configuration
@Module({
  imports: [
    TTCacheModule.forFeature({
      keyPrefix: 'feature',
      defaultTTL: 300 // 5 minutes for this module
    })
  ]
})
export class FeatureModule {}
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

## Development

### Setup

```bash
# Clone the repository
git clone https://github.com/yourusername/nestjs-ttcache.git
cd nestjs-ttcache

# Install dependencies
npm install

# Build the package
npm run build

# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Run integration tests (requires Docker)
docker-compose up -d
npm run test:integration
```

### Running Benchmarks

```bash
npm run benchmark
```

### Project Structure

```
nestjs-ttcache/
├── src/                    # Source code
│   ├── base/              # Base entity classes
│   ├── decorators/        # TypeScript decorators
│   ├── interfaces/        # TypeScript interfaces
│   ├── providers/         # Cache provider implementations
│   ├── services/          # Core services
│   ├── subscribers/       # TypeORM subscribers
│   └── utils/             # Utility functions
├── tests/                  # Test files
│   ├── integration/       # Integration tests
│   └── unit/              # Unit tests
├── benchmarks/            # Performance benchmarks
├── examples/              # Usage examples
└── .github/               # GitHub Actions workflows
```

## CI/CD

This project uses GitHub Actions for continuous integration and deployment:

- **CI Pipeline**: Runs on every push and PR
  - Tests on Node.js 16.x, 18.x, and 20.x
  - Tests on Ubuntu, Windows, and macOS
  - Linting and type checking
  - Security scanning with CodeQL
  - Dependency review

- **Release Pipeline**: Triggered by version tags
  - Publishes to npm
  - Publishes to GitHub Packages
  - Creates GitHub releases with changelogs

- **Benchmark Pipeline**: Tracks performance over time
  - Runs on every push to main
  - Comments on PRs with performance impact

## Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

### Development Workflow

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Code Style

- We use ESLint for linting
- Prettier for code formatting
- Follow TypeScript best practices
- Write tests for new features
- Update documentation as needed

### Testing

All contributions should include appropriate tests:

```bash
# Run all tests
npm test

# Run specific test file
npm test -- cache-key.utils.test.ts

# Run with coverage
npm run test:coverage

# Run in watch mode
npm run test:watch
```

## License

MIT

## Inspired By

This package is inspired by [Square's TTCache](https://github.com/square/ttcache) system, adapted for NestJS and TypeORM.