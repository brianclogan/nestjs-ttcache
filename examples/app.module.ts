import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import Redis from 'ioredis';
import { TTCacheModule } from '../src';
import { RedisCacheProvider } from '../src';
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
    
    // TTCache configuration
    TTCacheModule.forRoot({
      provider: new RedisCacheProvider(new Redis({
        host: 'localhost',
        port: 6379,
        // password: 'your_redis_password',
      })),
      defaultTTL: 3600, // 1 hour default
      debug: true, // Enable debug logging
      enableStatistics: true,
      writeThrough: true,
      readThrough: true,
      keyPrefix: 'myapp',
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