import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * AddWalletTables — SS-004b.
 *
 * Creates the two new tables backing the per-tenant wallet domain
 * (SS-004): `wallets` and `wallet_ledger`.
 *
 * Design notes
 * ------------
 * - All amounts are BIGINT paise (integer minor units). Never use
 *   NUMERIC / DECIMAL / float — integer arithmetic is the only way
 *   to keep the wallet honest.
 * - The `wallets` table is keyed by `tenant_id` with a UNIQUE
 *   constraint — there is exactly one wallet per tenant.
 * - The `wallet_ledger` table is append-only and idempotency-keyed.
 *   The `idempotency_key` column is UNIQUE — that unique index is
 *   the entire correctness story for the wallet. Two concurrent
 *   top-up requests with the same key race on the INSERT; the loser
 *   hits the unique violation and we return the prior result
 *   instead of double-debiting.
 * - Three lookup indexes: (tenant_id), (wallet_id), (created_at).
 *   The (tenant_id, created_at) composite would also be a fine
 *   default for "show me the last 30 days" queries; for now the
 *   three single-column indexes are enough and they leave room for
 *   the query planner to pick.
 * - All FKs are added with `NOT VALID`. Postgres skips the full
 *   table scan when you `ADD CONSTRAINT ... NOT VALID`, so the
 *   migration stays fast even on a large `wallet_ledger`. A
 *   follow-up migration (SS-002d) will `VALIDATE CONSTRAINT` each
 *   one after the system has settled. The data integrity guarantee
 *   is identical to a validated FK from the moment a row is
 *   inserted (or modified) — only the historical scan is deferred.
 * - ON DELETE CASCADE on all three FKs: deleting a tenant (rare,
 *   admin-only) should not orphan wallets; deleting a wallet (e.g.
 *   when a tenant is re-onboarded) should not orphan ledger rows
 *   that audit-trail prior balances.
 */
export class AddWalletTables1718160000001 implements MigrationInterface {
  name = 'AddWalletTables1718160000001';

  public async up(qr: QueryRunner): Promise<void> {
    // 1. Create wallets table
    await qr.query(`
      CREATE TABLE IF NOT EXISTS wallets (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER NOT NULL,
        available_balance BIGINT NOT NULL DEFAULT 0,
        reserved_balance BIGINT NOT NULL DEFAULT 0,
        lifetime_recharged BIGINT NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_wallets_tenant_id UNIQUE (tenant_id)
      )
    `);

    // 2. Create wallet_ledger table
    await qr.query(`
      CREATE TABLE IF NOT EXISTS wallet_ledger (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER NOT NULL,
        wallet_id INTEGER NOT NULL,
        entry_type VARCHAR(16) NOT NULL CHECK (entry_type IN ('CREDIT','DEBIT','LOCK','RELEASE')),
        amount BIGINT NOT NULL,
        reason VARCHAR(255) NOT NULL,
        idempotency_key VARCHAR(128) NOT NULL,
        metadata JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_wallet_ledger_idempotency_key UNIQUE (idempotency_key)
      )
    `);

    // 3. Create indexes
    await qr.query(
      `CREATE INDEX IF NOT EXISTS idx_wallet_ledger_tenant_id ON wallet_ledger(tenant_id)`,
    );
    await qr.query(
      `CREATE INDEX IF NOT EXISTS idx_wallet_ledger_wallet_id ON wallet_ledger(wallet_id)`,
    );
    await qr.query(
      `CREATE INDEX IF NOT EXISTS idx_wallet_ledger_created_at ON wallet_ledger(created_at)`,
    );

    // 4. Add FK from wallets.tenant_id → tenants.id (NOT VALID initially, then VALIDATE in SS-002d)
    await qr.query(`
      ALTER TABLE wallets
      ADD CONSTRAINT fk_wallets_tenant_id
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
      NOT VALID
    `);

    // 5. Add FK from wallet_ledger.tenant_id → tenants.id (NOT VALID)
    await qr.query(`
      ALTER TABLE wallet_ledger
      ADD CONSTRAINT fk_wallet_ledger_tenant_id
      FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
      NOT VALID
    `);

    // 6. Add FK from wallet_ledger.wallet_id → wallets.id (NOT VALID)
    await qr.query(`
      ALTER TABLE wallet_ledger
      ADD CONSTRAINT fk_wallet_ledger_wallet_id
      FOREIGN KEY (wallet_id) REFERENCES wallets(id) ON DELETE CASCADE
      NOT VALID
    `);
  }

  public async down(qr: QueryRunner): Promise<void> {
    // Drop in reverse order
    await qr.query(
      `ALTER TABLE IF EXISTS wallet_ledger DROP CONSTRAINT IF EXISTS fk_wallet_ledger_wallet_id`,
    );
    await qr.query(
      `ALTER TABLE IF EXISTS wallet_ledger DROP CONSTRAINT IF EXISTS fk_wallet_ledger_tenant_id`,
    );
    await qr.query(
      `ALTER TABLE IF EXISTS wallets DROP CONSTRAINT IF EXISTS fk_wallets_tenant_id`,
    );
    await qr.query(`DROP TABLE IF EXISTS wallet_ledger`);
    await qr.query(`DROP TABLE IF EXISTS wallets`);
  }
}
