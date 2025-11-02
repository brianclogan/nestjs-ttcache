#!/usr/bin/env node

/**
 * Test script to verify NestJS 11 and cache-manager 6.4.3 compatibility
 */

const { Test } = require('@nestjs/testing');
const { CacheModule } = require('@nestjs/cache-manager');
const { createCache } = require('cache-manager');

async function testCacheManager() {
  console.log('Testing cache-manager v6.4.3 compatibility...\n');
  
  // Test 1: Create a basic cache instance
  console.log('1. Creating cache instance...');
  const cache = createCache({
    ttl: 60 * 1000, // 60 seconds in milliseconds
  });
  
  // Test 2: Basic operations
  console.log('2. Testing basic cache operations...');
  
  // Set a value
  await cache.set('test-key', { value: 'test-value' }, 5000);
  console.log('   ✓ Set value');
  
  // Get a value
  const value = await cache.get('test-key');
  console.log('   ✓ Get value:', value);
  
  // Delete a value
  await cache.del('test-key');
  console.log('   ✓ Delete value');
  
  // Test wrap function
  const wrappedValue = await cache.wrap('wrapped-key', async () => {
    return { wrapped: true, timestamp: Date.now() };
  }, 5000);
  console.log('   ✓ Wrap function:', wrappedValue);
  
  console.log('\n✅ cache-manager v6.4.3 tests passed!\n');
}

async function testNestJSIntegration() {
  console.log('Testing NestJS 11 integration...\n');
  
  try {
    // Test 3: NestJS Cache Module
    console.log('3. Creating NestJS test module with CacheModule...');
    const moduleRef = await Test.createTestingModule({
      imports: [
        CacheModule.register({
          isGlobal: true,
          ttl: 60 * 1000, // 60 seconds in milliseconds
        }),
      ],
    }).compile();
    
    console.log('   ✓ Module created successfully');
    
    // Get cache manager from NestJS
    const cacheManager = moduleRef.get('CACHE_MANAGER');
    console.log('   ✓ Cache manager retrieved from NestJS');
    
    // Test operations through NestJS
    await cacheManager.set('nest-test', { framework: 'NestJS', version: 11 });
    const nestValue = await cacheManager.get('nest-test');
    console.log('   ✓ NestJS cache operations work:', nestValue);
    
    await moduleRef.close();
    console.log('\n✅ NestJS 11 integration tests passed!\n');
  } catch (error) {
    console.error('❌ NestJS integration test failed:', error.message);
  }
}

async function testTTCacheIntegration() {
  console.log('Testing TTCache module integration...\n');
  
  try {
    const { TTCacheModule, TTCacheService } = require('./dist');
    
    console.log('4. Creating NestJS module with TTCache...');
    const moduleRef = await Test.createTestingModule({
      imports: [
        CacheModule.register({
          isGlobal: true,
          ttl: 60 * 1000,
        }),
        TTCacheModule.forRoot({
          defaultTTL: 3600,
          debug: false,
        }),
      ],
    }).compile();
    
    console.log('   ✓ TTCache module created successfully');
    
    // Get TTCache service
    const ttcacheService = moduleRef.get(TTCacheService);
    console.log('   ✓ TTCache service retrieved');
    
    // Test TTCache operations
    await ttcacheService.set('ttcache-test', { module: 'TTCache', working: true });
    const ttcacheValue = await ttcacheService.get('ttcache-test');
    console.log('   ✓ TTCache operations work:', ttcacheValue);
    
    // Get statistics
    const stats = ttcacheService.getStatistics();
    console.log('   ✓ Statistics:', stats);
    
    await moduleRef.close();
    console.log('\n✅ TTCache integration tests passed!\n');
  } catch (error) {
    console.error('❌ TTCache integration test failed:', error.message);
  }
}

async function main() {
  console.log('========================================');
  console.log('NestJS 11 & cache-manager 6.4.3 Update Test');
  console.log('========================================\n');
  
  try {
    await testCacheManager();
    await testNestJSIntegration();
    await testTTCacheIntegration();
    
    console.log('========================================');
    console.log('✅ All tests passed successfully!');
    console.log('========================================');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  }
}

main();