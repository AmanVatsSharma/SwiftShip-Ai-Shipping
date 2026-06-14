import { PostgresThrottlerStorage } from '../lib/postgres-storage.service';

describe('PostgresThrottlerStorage', () => {
  let storage: PostgresThrottlerStorage;
  let mockDataSource: any;

  beforeEach(() => {
    mockDataSource = {
      query: jest.fn(),
      transaction: jest.fn(),
    };
    storage = new PostgresThrottlerStorage(mockDataSource);
  });

  it('should resolve fresh bucket correctly', async () => {
    mockDataSource.query.mockImplementationOnce((sql: string) =>
      Promise.resolve([{ regclass: null }]),
    );

    mockDataSource.transaction.mockImplementationOnce((txFn) =>
      txFn(async (manager: any) => {
        await manager.query('INSERT ...', []);
        await manager.query('SELECT ...', [{ key: 'foo', count: 0, reset_at: new Date(Date.now() + 60_000), updated_at: new Date() }]);
        await manager.query('UPDATE ...', []);
      }),
    );

    const record = await storage.increment('tenant:1', 60_000, 60, 0, 'default');

    expect(record.totalHits).toBe(1);
    expect(record.timeToExpire).toBe(60_000);
    expect(record.isBlocked).toBe(false);
  });

  it('should increment existing bucket', async () => {
    mockDataSource.query.mockImplementationOnce((sql: string) =>
      Promise.resolve([{ regclass: 'throttler_buckets' }]),
    );

    mockDataSource.transaction.mockImplementationOnce((txFn) =>
      txFn(async (manager: any) => {
        await manager.query('INSERT ...', []);
        await manager.query('SELECT ...', [{ key: 'tenant:1', count: 2, reset_at: new Date(Date.now() + 30_000), updated_at: new Date() }]);
        await manager.query('UPDATE ...', []);
      }),
    );

    const record = await storage.increment('tenant:1', 60_000, 60, 0, 'default');

    expect(record.totalHits).toBe(3);
    expect(record.timeToExpire).toBe(30_000);
  });

  it('should reset expired bucket', async () => {
    mockDataSource.query.mockImplementationOnce((sql: string) =>
      Promise.resolve([{ regclass: 'throttler_buckets' }]),
    );

    mockDataSource.transaction.mockImplementationOnce((txFn) =>
      txFn(async (manager: any) => {
        await manager.query('INSERT ...', []);
        await manager.query('SELECT ...', [{ key: 'tenant:1', count: 5, reset_at: new Date(Date.now() - 1000), updated_at: new Date() }]);
        await manager.query('UPDATE ...', []);
      }),
    );

    const record = await storage.increment('tenant:1', 60_000, 60, 0, 'default');

    expect(record.totalHits).toBe(1);
    expect(record.timeToExpire).toBe(60_000);
  });
});
