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
npm install nestjs-ttcache ioredis
# or
yarn add nestjs-ttcache ioredis
# or
pnpm add nestjs-ttcache ioredis
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