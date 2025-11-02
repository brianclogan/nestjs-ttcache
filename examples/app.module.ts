import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CacheModule } from '@nestjs/cache-manager';
import { redisStore } from 'cache-manager-ioredis-yet';
import { TTCacheModule } from '../src';
import { User, Role } from './user.entity';
import { UserService } from './user.service';

@Module({
  imports: [
    // TypeORM configuration
    TypeOrmModule.forRoot({
      type: 'postgres',
      host: 'localhost',
      port: 5432,
      username: 'your_username',
      password: 'your_password',
      database: 'your_database',
      entities: [User, Role],
      synchronize: true, // Don't use in production
    }),
    
    // NestJS Cache Module configuration (shared with TTCache)
    // cache-manager v6 configuration
    CacheModule.registerAsync({
      isGlobal: true,
      useFactory: async () => ({
        store: await redisStore({
          host: 'localhost',
          port: 6379,
          ttl: 3600 * 1000, // 1 hour in milliseconds (cache-manager v6 uses ms)
        }),
      }),
    }),
    
    // TTCache configuration (uses the NestJS Cache Module)
    TTCacheModule.forRoot({
      // No need to specify provider - uses NestJS Cache Manager
      defaultTTL: 3600, // 1 hour default
      debug: true, // Enable debug logging
      enableStatistics: true,
      writeThrough: true,
      readThrough: true,
      keyPrefix: 'ttcache:myapp', // Prefix to avoid collisions with other cache usage
      warmOnStartup: true,
      staleWhileRevalidate: true,
      staleTTL: 300, // 5 minutes
      stampedeProtection: true,
      maxConcurrentRefreshes: 10,
      invalidateRelations: true,
      circuitBreaker: {
        enabled: true,
        threshold: 5,
        timeout: 60000,
        resetTimeout: 30000
      }
    }),
    
    // Register entities with TypeORM
    TypeOrmModule.forFeature([User, Role])
  ],
  providers: [UserService],
  exports: [UserService]
})
export class AppModule {}