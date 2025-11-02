import { Module, DynamicModule, Global, OnModuleInit, Inject, Optional } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { CacheModule } from '@nestjs/cache-manager';
import { DataSource } from 'typeorm';
import { TTCacheService } from './services/ttcache.service';
import { CacheSubscriber } from './subscribers/cache.subscriber';
import { TTCacheModuleOptions } from './interfaces';
import { CachedBaseEntity } from './base/cached-base.entity';
import { getCacheableEntities, getPreloadOptions } from './decorators';

@Global()
@Module({})
export class TTCacheModule implements OnModuleInit {
  private static options: TTCacheModuleOptions = {};
  
  constructor(
    private readonly moduleRef: ModuleRef,
    @Optional() @Inject('TTCACHE_OPTIONS') moduleOptions: TTCacheModuleOptions,
    private readonly cacheService: TTCacheService,
    @Optional() private readonly dataSource?: DataSource
  ) {
    if (moduleOptions) {
      TTCacheModule.options = moduleOptions;
    }
  }
  
  /**
   * Configure TTCache with custom options
   * This will import NestJS CacheModule if not already imported
   */
  static forRoot(options: TTCacheModuleOptions = {}): DynamicModule {
    TTCacheModule.options = options;
    
    const imports = [];
    
    // If no custom cache is provided, ensure CacheModule is imported
    if (!options.cache) {
      imports.push(CacheModule.register({
        isGlobal: true,
        ttl: options.defaultTTL ? options.defaultTTL * 1000 : 3600000, // Convert to milliseconds
      }));
    }
    
    return {
      module: TTCacheModule,
      imports,
      providers: [
        {
          provide: 'TTCACHE_OPTIONS',
          useValue: options
        },
        TTCacheService,
        {
          provide: CacheSubscriber,
          useFactory: (cacheService: TTCacheService) => new CacheSubscriber(cacheService),
          inject: [TTCacheService]
        }
      ],
      exports: [TTCacheService, 'TTCACHE_OPTIONS']
    };
  }
  
  /**
   * Configure TTCache with async options
   * This allows for dynamic configuration based on other providers
   */
  static forRootAsync(options: {
    useFactory: (...args: any[]) => Promise<TTCacheModuleOptions> | TTCacheModuleOptions;
    inject?: any[];
    imports?: any[];
  }): DynamicModule {
    const imports = options.imports || [];
    
    // Always include CacheModule as it might be needed
    imports.push(CacheModule.register({
      isGlobal: true,
    }));
    
    return {
      module: TTCacheModule,
      imports,
      providers: [
        {
          provide: 'TTCACHE_OPTIONS',
          useFactory: async (...args: any[]) => {
            const moduleOptions = await options.useFactory(...args);
            TTCacheModule.options = moduleOptions;
            return moduleOptions;
          },
          inject: options.inject || []
        },
        TTCacheService,
        {
          provide: CacheSubscriber,
          useFactory: (cacheService: TTCacheService) => new CacheSubscriber(cacheService),
          inject: [TTCacheService]
        }
      ],
      exports: [TTCacheService, 'TTCACHE_OPTIONS']
    };
  }
  
  /**
   * Register TTCache as a feature module
   * This is useful when you want to use different cache configurations for different modules
   */
  static forFeature(options: TTCacheModuleOptions = {}): DynamicModule {
    return {
      module: TTCacheModule,
      providers: [
        {
          provide: 'TTCACHE_FEATURE_OPTIONS',
          useValue: options
        },
        {
          provide: TTCacheService,
          useFactory: (defaultService: TTCacheService) => {
            // If feature options are provided, create a new service instance
            if (Object.keys(options).length > 0) {
              return new TTCacheService(
                defaultService.getCacheManager(),
                { ...TTCacheModule.options, ...options }
              );
            }
            return defaultService;
          },
          inject: [TTCacheService]
        }
      ],
      exports: [TTCacheService]
    };
  }
  
  async onModuleInit(): Promise<void> {
    // Set cache service on base entity
    CachedBaseEntity.setCacheService(this.cacheService);
    
    // Register subscriber with TypeORM
    if (this.dataSource && this.dataSource.isInitialized) {
      try {
        const subscriber = this.moduleRef.get(CacheSubscriber);
        this.dataSource.subscribers.push(subscriber);
      } catch (error) {
        console.warn('Could not register cache subscriber:', error);
      }
    } else {
      console.warn('DataSource not available or not initialized. Cache subscriber not registered.');
    }
    
    // Warm cache if enabled
    if (TTCacheModule.options.warmOnStartup) {
      await this.warmCache();
    }
  }
  
  private async warmCache(): Promise<void> {
    if (!this.dataSource || !this.dataSource.isInitialized) {
      console.warn('DataSource not available for cache warming');
      return;
    }
    
    const cacheableEntities = getCacheableEntities();
    
    for (const [entityName, { target, options }] of cacheableEntities) {
      const preloadOptions = getPreloadOptions(target);
      
      if (preloadOptions?.onStartup) {
        try {
          const repository = this.dataSource.getRepository(target);
          
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