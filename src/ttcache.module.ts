import { Module, DynamicModule, Global, OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { getConnection } from 'typeorm';
import { TTCacheService } from './services/ttcache.service';
import { CacheSubscriber } from './subscribers/cache.subscriber';
import { TTCacheModuleOptions } from './interfaces';
import { CachedBaseEntity } from './base/cached-base.entity';
import { getCacheableEntities, getPreloadOptions } from './decorators';

@Global()
@Module({})
export class TTCacheModule implements OnModuleInit {
  private static options: TTCacheModuleOptions;
  
  constructor(
    private readonly moduleRef: ModuleRef,
    private readonly cacheService: TTCacheService
  ) {}
  
  static forRoot(options: TTCacheModuleOptions): DynamicModule {
    TTCacheModule.options = options;
    
    return {
      module: TTCacheModule,
      providers: [
        {
          provide: TTCacheService,
          useFactory: () => new TTCacheService(options.provider, options)
        },
        {
          provide: CacheSubscriber,
          useFactory: (cacheService: TTCacheService) => new CacheSubscriber(cacheService),
          inject: [TTCacheService]
        },
        {
          provide: 'TTCACHE_OPTIONS',
          useValue: options
        }
      ],
      exports: [TTCacheService, 'TTCACHE_OPTIONS']
    };
  }
  
  static forRootAsync(options: {
    useFactory: (...args: any[]) => Promise<TTCacheModuleOptions> | TTCacheModuleOptions;
    inject?: any[];
    imports?: any[];
  }): DynamicModule {
    return {
      module: TTCacheModule,
      imports: options.imports || [],
      providers: [
        {
          provide: 'TTCACHE_OPTIONS',
          useFactory: options.useFactory,
          inject: options.inject || []
        },
        {
          provide: TTCacheService,
          useFactory: (moduleOptions: TTCacheModuleOptions) => {
            TTCacheModule.options = moduleOptions;
            return new TTCacheService(moduleOptions.provider, moduleOptions);
          },
          inject: ['TTCACHE_OPTIONS']
        },
        {
          provide: CacheSubscriber,
          useFactory: (cacheService: TTCacheService) => new CacheSubscriber(cacheService),
          inject: [TTCacheService]
        }
      ],
      exports: [TTCacheService, 'TTCACHE_OPTIONS']
    };
  }
  
  async onModuleInit(): Promise<void> {
    // Set cache service on base entity
    CachedBaseEntity.setCacheService(this.cacheService);
    
    // Register subscriber with TypeORM
    try {
      const connection = getConnection();
      const subscriber = this.moduleRef.get(CacheSubscriber);
      connection.subscribers.push(subscriber);
    } catch (error) {
      console.warn('Could not register cache subscriber:', error);
    }
    
    // Warm cache if enabled
    if (TTCacheModule.options.warmOnStartup) {
      await this.warmCache();
    }
  }
  
  private async warmCache(): Promise<void> {
    const cacheableEntities = getCacheableEntities();
    
    for (const [entityName, { target, options }] of cacheableEntities) {
      const preloadOptions = getPreloadOptions(target);
      
      if (preloadOptions?.onStartup) {
        try {
          const repository = getConnection().getRepository(target);
          
          const queryOptions: any = {};
          if (preloadOptions.relations) {
            queryOptions.relations = preloadOptions.relations;
          }
          
          const entities = await repository.find(queryOptions);
          
          if (entities.length > 0) {
            await this.cacheService.warmCache(entities, options.ttl);
            console.log(`Warmed cache with ${entities.length} ${entityName} entities`);
          }
        } catch (error) {
          console.error(`Failed to warm cache for ${entityName}:`, error);
        }
      }
    }
  }
}