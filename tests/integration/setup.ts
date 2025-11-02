import 'reflect-metadata';
import { DataSource } from 'typeorm';

// Global test database connection
export let testDataSource: DataSource;

beforeAll(async () => {
  // Setup test database (using in-memory SQLite for tests)
  testDataSource = new DataSource({
    type: 'sqlite',
    database: ':memory:',
    synchronize: true,
    logging: false,
    entities: ['tests/integration/entities/*.ts'],
  });

  await testDataSource.initialize();
});

afterAll(async () => {
  if (testDataSource?.isInitialized) {
    await testDataSource.destroy();
  }
});