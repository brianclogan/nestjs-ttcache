# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Initial release of NestJS TTCache
- Write-through caching implementation for TypeORM entities
- Read-through caching with automatic database fallback
- Automatic cache invalidation on entity updates/deletes
- Support for entity relations with cascading invalidation
- Query result caching with fingerprinting
- Cache stampede protection with distributed locks
- Performance statistics tracking
- Redis and in-memory cache providers
- Circuit breaker for fault tolerance
- Cache warming capabilities
- Stale-while-revalidate support
- TypeScript decorators for cache configuration
- Base entity class with cache-aware methods
- TypeORM subscriber for automatic cache management
- Comprehensive test suite
- Performance benchmarks
- GitHub Actions CI/CD pipelines
- Docker Compose for local development

### Security
- Added dependency scanning with Dependabot
- CodeQL security analysis
- npm audit in CI pipeline

## [1.0.0] - TBD

### Added
- First stable release
- Full documentation and examples
- Integration tests with PostgreSQL and Redis
- Support for NestJS 10.x and TypeORM 0.3.x

[Unreleased]: https://github.com/yourusername/nestjs-ttcache/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/yourusername/nestjs-ttcache/releases/tag/v1.0.0