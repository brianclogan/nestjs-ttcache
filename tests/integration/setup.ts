import 'reflect-metadata';
import { DataSource } from 'typeorm';
import Redis from 'ioredis';

// Global test database connection
export let testDataSource: DataSource;
export let testRedis: Redis;

beforeAll(async () => {
  // Setup test database
  testDataSource = new DataSource({
    type: 'postgres',
    host: process.env.DATABASE_HOST || 'localhost',
    port: parseInt(process.env.DATABASE_PORT || '5432'),
    username: process.env.DATABASE_USER || 'test',
    password: process.env.DATABASE_PASSWORD || 'test',
    database: process.env.DATABASE_NAME || 'testdb',
    synchronize: true,
    logging: false,
    entities: ['tests/integration/entities/*.ts'],
  });

  await testDataSource.initialize();

  // Setup Redis connection
  testRedis = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
  });
});

afterAll(async () => {
  if (testDataSource?.isInitialized) {
    await testDataSource.destroy();
  }
  
  if (testRedis) {
    testRedis.disconnect();
  }
});