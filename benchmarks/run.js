const { performance } = require('perf_hooks');
const fs = require('fs');
const path = require('path');

// Mock implementations for benchmarking
class MockCacheProvider {
  constructor() {
    this.store = new Map();
  }

  async get(key) {
    // Simulate network latency
    await new Promise(resolve => setTimeout(resolve, 1));
    return this.store.get(key) || null;
  }

  async set(key, value, ttl) {
    await new Promise(resolve => setTimeout(resolve, 1));
    this.store.set(key, value);
  }

  async delete(key) {
    await new Promise(resolve => setTimeout(resolve, 1));
    return this.store.delete(key);
  }

  async deletePattern(pattern) {
    await new Promise(resolve => setTimeout(resolve, 1));
    const regex = new RegExp(pattern.replace('*', '.*'));
    let count = 0;
    for (const key of this.store.keys()) {
      if (regex.test(key)) {
        this.store.delete(key);
        count++;
      }
    }
    return count;
  }

  async exists(key) {
    return this.store.has(key);
  }

  async mget(keys) {
    await new Promise(resolve => setTimeout(resolve, 1));
    return keys.map(key => this.store.get(key) || null);
  }

  async mset(items) {
    await new Promise(resolve => setTimeout(resolve, 1));
    items.forEach(({ key, value }) => this.store.set(key, value));
  }

  async flush() {
    this.store.clear();
  }

  async keys(pattern) {
    const regex = new RegExp(pattern.replace('*', '.*'));
    return Array.from(this.store.keys()).filter(key => regex.test(key));
  }

  async expire(key, ttl) {
    return this.store.has(key);
  }

  async ttl(key) {
    return this.store.has(key) ? 60 : -2;
  }

  async increment(key, by = 1) {
    const current = this.store.get(key) || 0;
    const newValue = current + by;
    this.store.set(key, newValue);
    return newValue;
  }

  async decrement(key, by = 1) {
    const current = this.store.get(key) || 0;
    const newValue = current - by;
    this.store.set(key, newValue);
    return newValue;
  }
}

async function runBenchmark(name, fn, iterations = 1000) {
  console.log(`Running benchmark: ${name}`);
  
  // Warmup
  for (let i = 0; i < 100; i++) {
    await fn();
  }

  // Actual benchmark
  const times = [];
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    await fn();
    const end = performance.now();
    times.push(end - start);
  }

  // Calculate statistics
  times.sort((a, b) => a - b);
  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  const median = times[Math.floor(times.length / 2)];
  const p95 = times[Math.floor(times.length * 0.95)];
  const p99 = times[Math.floor(times.length * 0.99)];
  const min = times[0];
  const max = times[times.length - 1];

  return {
    name,
    iterations,
    avg: parseFloat(avg.toFixed(3)),
    median: parseFloat(median.toFixed(3)),
    p95: parseFloat(p95.toFixed(3)),
    p99: parseFloat(p99.toFixed(3)),
    min: parseFloat(min.toFixed(3)),
    max: parseFloat(max.toFixed(3)),
    opsPerSec: Math.round(1000 / avg)
  };
}

async function main() {
  console.log('NestJS TTCache Benchmark Suite\n');
  console.log('==============================\n');

  const provider = new MockCacheProvider();
  const results = [];

  // Benchmark cache operations
  results.push(await runBenchmark('Cache SET', async () => {
    await provider.set(`key-${Math.random()}`, { data: 'test' }, 60);
  }));

  // Pre-populate some data
  for (let i = 0; i < 1000; i++) {
    await provider.set(`key-${i}`, { data: `value-${i}` }, 60);
  }

  results.push(await runBenchmark('Cache GET (hit)', async () => {
    await provider.get(`key-${Math.floor(Math.random() * 1000)}`);
  }));

  results.push(await runBenchmark('Cache GET (miss)', async () => {
    await provider.get(`missing-${Math.random()}`);
  }));

  results.push(await runBenchmark('Cache DELETE', async () => {
    const key = `temp-${Math.random()}`;
    await provider.set(key, 'value', 60);
    await provider.delete(key);
  }));

  results.push(await runBenchmark('Cache MGET (10 keys)', async () => {
    const keys = Array.from({ length: 10 }, (_, i) => `key-${i}`);
    await provider.mget(keys);
  }));

  results.push(await runBenchmark('Cache MSET (10 items)', async () => {
    const items = Array.from({ length: 10 }, (_, i) => ({
      key: `batch-${Math.random()}-${i}`,
      value: `value-${i}`,
      ttl: 60
    }));
    await provider.mset(items);
  }));

  // Print results
  console.log('\nBenchmark Results:');
  console.log('==================\n');
  
  const table = results.map(r => ({
    'Operation': r.name,
    'Avg (ms)': r.avg,
    'Median (ms)': r.median,
    'P95 (ms)': r.p95,
    'P99 (ms)': r.p99,
    'Ops/sec': r.opsPerSec
  }));
  
  console.table(table);

  // Save results to JSON for GitHub Actions
  const output = {
    results: results.map(r => ({
      name: r.name,
      unit: 'ops/sec',
      value: r.opsPerSec
    }))
  };

  fs.writeFileSync(
    path.join(__dirname, '..', 'benchmark-results.json'),
    JSON.stringify(output, null, 2)
  );

  console.log('\nBenchmark complete! Results saved to benchmark-results.json');
}

main().catch(console.error);