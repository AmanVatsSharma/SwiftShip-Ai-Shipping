import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import {
  ThrottlerStorage,
  ThrottlerStorageRecord,
} from '@nestjs/throttler';

/**
 * Postgres-backed throttler storage.
 *
 * Schema (created lazily on first use, idempotent):
 *
 *   CREATE TABLE throttler_buckets (
 *     key VARCHAR(255) PRIMARY KEY,
 *     count INTEGER NOT NULL DEFAULT 0,
 *     reset_at TIMESTAMP NOT NULL,
 *     updated_at TIMESTAMP NOT NULL DEFAULT NOW()
 *   );
 *
 * Concurrency model: each `increment()` runs in a transaction with
 * `SELECT ... FOR UPDATE` so two API instances racing on the same key
 * serialize through Postgres row locks. The single round-trip
 * `INSERT ... ON CONFLICT DO NOTHING` + `SELECT FOR UPDATE` + `UPDATE` keeps
 * the hot path to 3 statements inside one transaction.
 */
@Injectable()
export class PostgresThrottlerStorage
  implements ThrottlerStorage, OnModuleInit
{
  private readonly logger = new Logger(PostgresThrottlerStorage.name);
  private tableEnsured = false;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.ensureTable();
  }

  async increment(
    key: string,
    ttl: number,
    _limit: number,
    blockDuration: number,
    _throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    await this.ensureTable();

    return this.dataSource.transaction(async (manager) => {
      // 1) Try to claim the row. If it's a fresh key, insert it with count=0
      //    and reset_at = now() + ttl.
      const now = new Date();
      const initialReset = new Date(now.getTime() + ttl);

      await manager.query(
        `INSERT INTO throttler_buckets (key, count, reset_at, updated_at)
         VALUES ($1, 0, $2, NOW())
         ON CONFLICT (key) DO NOTHING`,
        [key, initialReset],
      );

      // 2) Lock the row for the rest of the transaction.
      const rows: Array<{
        key: string;
        count: number;
        reset_at: Date;
        updated_at: Date;
      }> = await manager.query(
        `SELECT key, count, reset_at, updated_at
         FROM throttler_buckets
         WHERE key = $1
         FOR UPDATE`,
        [key],
      );

      if (rows.length === 0) {
        // Should be unreachable given the INSERT above, but be defensive.
        return {
          totalHits: 1,
          timeToExpire: ttl,
          isBlocked: false,
          timeToBlockExpire: 0,
        };
      }

      const current = rows[0];
      const resetAt = new Date(current.reset_at);
      const nowMs = now.getTime();
      const resetMs = resetAt.getTime();

      // 3) If the window has expired, reset the bucket and start a fresh one.
      if (resetMs <= nowMs) {
        const newReset = new Date(nowMs + ttl);
        await manager.query(
          `UPDATE throttler_buckets
           SET count = 1,
               reset_at = $2,
               updated_at = NOW()
           WHERE key = $1`,
          [key, newReset],
        );
        return {
          totalHits: 1,
          timeToExpire: ttl,
          isBlocked: false,
          timeToBlockExpire: 0,
        };
      }

      // 4) Otherwise, increment and report remaining window.
      await manager.query(
        `UPDATE throttler_buckets
         SET count = count + 1,
             updated_at = NOW()
         WHERE key = $1`,
        [key],
      );

      const timeToExpire = Math.max(0, resetMs - nowMs);

      return {
        totalHits: current.count + 1,
        timeToExpire,
        isBlocked: false,
        timeToBlockExpire: blockDuration > 0 ? blockDuration : 0,
      };
    });
  }

  /**
   * Idempotent DDL. The throttler table is shared infrastructure, not a
   * domain entity, so we don't model it as a TypeORM entity — we just
   * create it inline. Run once per process; subsequent calls are cheap
   * `to_regclass` probes.
   */
  private async ensureTable(): Promise<void> {
    if (this.tableEnsured) return;

    try {
      const exists: Array<{ regclass: string | null }> =
        await this.dataSource.query(
          `SELECT to_regclass('public.throttler_buckets') AS regclass`,
        );

      if (!exists[0]?.regclass) {
        this.logger.log('Creating throttler_buckets table');
        await this.dataSource.query(`
          CREATE TABLE throttler_buckets (
            key VARCHAR(255) PRIMARY KEY,
            count INTEGER NOT NULL DEFAULT 0,
            reset_at TIMESTAMP NOT NULL,
            updated_at TIMESTAMP NOT NULL DEFAULT NOW()
          )
        `);
      }
      this.tableEnsured = true;
    } catch (err) {
      // Don't crash boot if the DB is briefly unavailable; the throttler
      // storage will retry on the next call. Surface the error for logs.
      this.logger.error(
        'Failed to ensure throttler_buckets table',
        err instanceof Error ? err.stack : String(err),
      );
    }
  }
}
