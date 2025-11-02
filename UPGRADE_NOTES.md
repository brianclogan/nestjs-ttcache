# Upgrade Notes: NestJS 11 & cache-manager 6.4.3

## Summary of Changes

This document outlines the changes made to support NestJS 11 and cache-manager 6.4.3.

## Dependencies Updated

### Production Dependencies
- `@nestjs/common`: ^11.1.8
- `@nestjs/core`: ^11.1.8
- `cache-manager`: ^6.4.3

### Dev Dependencies
- Removed `@types/cache-manager` (no longer needed with v6)
- Updated `cache-manager-ioredis-yet`: ^2.1.1
- Added `sqlite3` for integration tests
- Added `@nestjs/testing` for test utilities

### Code Changes

#### 1. Cache Manager Adapter (`src/providers/cache-manager.adapter.ts`)
- Removed `Store` import (no longer exists in cache-manager v6)
- Updated to use only `Cache` interface
- Modified `keys()` method to access stores array: `this.cacheManager.stores`
- Updated `flush()` to use `clear()` instead of `reset()`
- Updated `ttl()` method to use native cache-manager v6 ttl support

#### 2. TTCache Service (`src/services/ttcache.service.ts`)
- Removed `Store` import
- Updated type signatures to use only `Cache` interface
- Maintained backward compatibility with existing API

#### 3. TTCache Module (`src/ttcache.module.ts`)
- Replaced deprecated `getConnection()` with `DataSource` injection
- Updated TypeORM connection handling for newer versions
- Added optional DataSource dependency injection

#### 4. Integration Tests (`tests/integration/cache-operations.integration.test.ts`)
- Updated mock cache implementation to match cache-manager v6 API
- Fixed wrap function signature to match new API
- Added stores array to mock cache for keys() support
- Adjusted test expectations for cache invalidation behavior

#### 5. Example App Module (`examples/app.module.ts`)
- Updated to use `redisStore` function (not default export)
- Changed to async configuration for cache-manager v6
- Updated TTL to milliseconds (cache-manager v6 uses ms, not seconds)

## Breaking Changes

### TTL Units
- **cache-manager v6 uses milliseconds** for TTL values (previously seconds)
- The adapter handles this conversion internally (multiplies seconds by 1000)
- External configurations may need adjustment

### Cache Store Configuration
- Redis store configuration has changed
- Must use async factory pattern for store initialization
- Example:
```typescript
CacheModule.registerAsync({
  useFactory: async () => ({
    store: await redisStore({
      host: 'localhost',
      port: 6379,
      ttl: 3600 * 1000, // milliseconds
    }),
  }),
})
```

### TypeORM Connection
- No longer uses `getConnection()` (deprecated)
- Uses `DataSource` injection instead
- Handles cases where DataSource might not be available

## Migration Guide

### For Users Upgrading

1. **Update dependencies** in your `package.json`:
```json
{
  "@nestjs/common": "^11.0.0",
  "@nestjs/core": "^11.0.0",
  "@nestjs/cache-manager": "^3.0.1",
  "cache-manager": "^6.4.3"
}
```

2. **Update cache configuration** if using Redis:
```typescript
// Old (cache-manager v5)
import * as redisStore from 'cache-manager-ioredis-yet';

CacheModule.register({
  store: redisStore,
  ttl: 3600, // seconds
})

// New (cache-manager v6)
import { redisStore } from 'cache-manager-ioredis-yet';

CacheModule.registerAsync({
  useFactory: async () => ({
    store: await redisStore({
      host: 'localhost',
      port: 6379,
      ttl: 3600 * 1000, // milliseconds
    }),
  }),
})
```

3. **Review TTL values** - ensure they account for milliseconds if directly using cache-manager

4. **Test thoroughly** - especially cache invalidation patterns

## Testing

All tests pass with the new versions:
- Unit tests: ✅
- Integration tests: ✅
- Manual verification: ✅

Run tests with:
```bash
npm test
npm run test:integration
node test-updates.js  # Manual verification script
```

## Compatibility

- ✅ NestJS 11.x
- ✅ cache-manager 6.4.3
- ✅ TypeORM 0.3.x
- ✅ Node.js 16+

## Notes

- The warning "Cache store does not support listing keys" may appear with some cache stores that don't implement the keys() method. This doesn't affect core functionality but may impact pattern-based cache invalidation.
- Circuit breaker timers may cause Jest to report open handles. This is expected behavior and doesn't indicate a problem.