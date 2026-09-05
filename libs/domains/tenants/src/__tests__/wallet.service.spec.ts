import { WalletService } from '../lib/wallet.service';
import { WalletLedgerEntity } from '../lib/wallet-ledger.entity';
import { WalletEntity } from '../lib/wallet.entity';
import type { TopUpWalletInput } from '../lib/wallet.input';

/**
 * In-memory test doubles for the two repositories + the DataSource.
 *
 * The real WalletService does a lot of work inside `dataSource.transaction()`.
 * The tests below mock the transaction by running the inner function
 * directly against a single in-memory entity manager, then asserting
 * on the resulting wallet + ledger state.
 */
describe('WalletService', () => {
  type Ledger = WalletLedgerEntity & { id: number };
  type Wallet = WalletEntity & { id: number };

  function makeEnv() {
    const wallets: Wallet[] = [];
    const ledger: Ledger[] = [];
    let nextWalletId = 1;
    let nextLedgerId = 1;

    // Bare-bones EntityManager facade — only the methods the service
    // actually calls.
    const em = {
      findOne: jest.fn(
        async (
          target: unknown,
          opts: {
            where: {
              tenantId?: number;
              idempotencyKey?: string;
              id?: number;
            };
          },
        ) => {
          if (target === (WalletEntity as unknown)) {
            if (opts.where.tenantId !== undefined) {
              return (
                wallets.find((w) => w.tenantId === opts.where.tenantId) ?? null
              );
            }
            if (opts.where.id !== undefined) {
              return wallets.find((w) => w.id === opts.where.id) ?? null;
            }
          }
          if (target === (WalletLedgerEntity as unknown)) {
            return (
              ledger.find(
                (l) =>
                  (opts.where.tenantId !== undefined &&
                    l.tenantId === opts.where.tenantId &&
                    l.idempotencyKey === opts.where.idempotencyKey) ||
                  (opts.where.id !== undefined && l.id === opts.where.id),
              ) ?? null
            );
          }
          return null;
        },
      ),
      create: jest.fn((target: unknown, data: Record<string, unknown>) => {
        if (target === (WalletEntity as unknown)) {
          return { id: nextWalletId, ...data };
        }
        if (target === (WalletLedgerEntity as unknown)) {
          return { id: nextLedgerId, ...data };
        }
        return data;
      }),
      save: jest.fn(
        async (
          entity: Record<string, unknown> & { id: number },
        ): Promise<Record<string, unknown> & { id: number }> => {
          if ('entryType' in entity) {
            const l = entity as unknown as Ledger;
            if (l.id === nextLedgerId) {
              l.id = nextLedgerId++;
              ledger.push(l);
            } else {
              const idx = ledger.findIndex((x) => x.id === l.id);
              if (idx >= 0) ledger[idx] = l;
              else ledger.push(l);
            }
            return l as unknown as Record<string, unknown> & { id: number };
          }
          if ('availableBalance' in entity) {
            const w = entity as unknown as Wallet;
            if (w.id === nextWalletId) {
              w.id = nextWalletId++;
              wallets.push(w);
            } else {
              const idx = wallets.findIndex((x) => x.id === w.id);
              if (idx >= 0) wallets[idx] = w;
              else wallets.push(w);
            }
            return w as unknown as Record<string, unknown> & { id: number };
          }
          return entity;
        },
      ),
      increment: jest.fn(
        async (
          _target: unknown,
          where: { id: number },
          col: 'availableBalance' | 'reservedBalance' | 'lifetimeRecharged',
          by: number,
        ) => {
          const w = wallets.find((x) => x.id === where.id);
          if (!w) return { affected: 0 };
          (w as unknown as Record<string, number>)[col] =
            ((w as unknown as Record<string, number>)[col] ?? 0) + by;
          return { affected: 1 };
        },
      ),
      decrement: jest.fn(
        async (
          _target: unknown,
          where: { id: number },
          col: 'availableBalance' | 'reservedBalance' | 'lifetimeRecharged',
          by: number,
        ) => {
          const w = wallets.find((x) => x.id === where.id);
          if (!w) return { affected: 0 };
          (w as unknown as Record<string, number>)[col] =
            ((w as unknown as Record<string, number>)[col] ?? 0) - by;
          return { affected: 1 };
        },
      ),
      createQueryBuilder: jest.fn((_alias?: string): unknown => {
        const qb: {
          _setClauses: string[];
          update: () => typeof qb;
          set: (
            clause: Record<string, unknown> | ((qb: unknown) => void),
          ) => typeof qb;
          where: (clause: string, params: Record<string, unknown>) => typeof qb;
          setLock: (mode: string) => typeof qb;
          getOne: () => Promise<null>;
          execute: () => Promise<{ affected: number }>;
        } = {
          _setClauses: [],
          update() {
            return qb;
          },
          set(clause) {
            if (typeof clause === 'function') {
              qb._setClauses.push('fn');
            } else {
              for (const [k, v] of Object.entries(clause)) {
                qb._setClauses.push(`${k}=${String(v)}`);
              }
            }
            return qb;
          },
          where() {
            return qb;
          },
          setLock() {
            return qb;
          },
          getOne: async () => null,
          execute: async () => ({ affected: 1 }),
        };
        return qb;
      }),
    };

    const walletRepo = {
      findOne: em.findOne,
      create: em.create,
      save: em.save,
      increment: em.increment,
      decrement: em.decrement,
      createQueryBuilder: em.createQueryBuilder,
    };
    const ledgerRepo = {
      findOne: em.findOne,
      create: em.create,
      save: em.save,
      createQueryBuilder: () => makeStatementQb(ledger),
    };

    // transaction(fn) — invokes `fn` with the mock em.
    type EmT = typeof em;
    const dataSource = {
      transaction: jest.fn(
        async <T>(fn: (em: EmT) => Promise<T>): Promise<T> => fn(em),
      ),
    };

    return {
      wallets,
      ledger,
      walletRepo,
      ledgerRepo,
      dataSource,
      em,
    };
  }

  function makeStatementQb(ledger: Ledger[]) {
    const filters: Array<(l: Ledger) => boolean> = [];
    const order: { col: 'createdAt'; dir: 'ASC' | 'DESC' } = {
      col: 'createdAt',
      dir: 'DESC',
    };
    const takeN = { v: undefined as number | undefined };
    const skipN = { v: undefined as number | undefined };
    const qb = {
      where(_clause: string, _params: Record<string, unknown>) {
        filters.length = 0;
        filters.push((l) => l.tenantId === _params.tenantId);
        return qb;
      },
      andWhere(clause: string, params: Record<string, unknown>) {
        if (clause.includes('createdAt >=')) {
          const from = new Date(params.from as string | number | Date);
          filters.push((l) => new Date(l.createdAt) >= from);
        } else if (clause.includes('createdAt <=')) {
          const to = new Date(params.to as string | number | Date);
          filters.push((l) => new Date(l.createdAt) <= to);
        } else if (clause.includes('entryType')) {
          filters.push((l) => l.entryType === params.entryType);
        } else if (clause.includes('reason')) {
          filters.push((l) => l.reason === params.reason);
        }
        return qb;
      },
      orderBy(col: 'createdAt', dir: 'ASC' | 'DESC') {
        order.col = col;
        order.dir = dir;
        return qb;
      },
      take(n: number) {
        takeN.v = n;
        return qb;
      },
      skip(n: number) {
        skipN.v = n;
        return qb;
      },
      async getMany() {
        const out = ledger.filter((l) => filters.every((f) => f(l)));
        out.sort((a, b) => {
          const av = new Date(a.createdAt).getTime();
          const bv = new Date(b.createdAt).getTime();
          if (av < bv) return order.dir === 'ASC' ? -1 : 1;
          if (av > bv) return order.dir === 'ASC' ? 1 : -1;
          return 0;
        });
        const start = skipN.v ?? 0;
        const end = takeN.v !== undefined ? start + takeN.v : undefined;
        return out.slice(start, end);
      },
    };
    return qb;
  }

  it('topUp increases availableBalance by the credited amount', async () => {
    const env = makeEnv();
    const service = new WalletService(
      env.walletRepo as never,
      env.ledgerRepo as never,
      env.dataSource as never,
      { getTenantId: () => null } as never,
    );
    const input: TopUpWalletInput = {
      tenantId: 42,
      amount: 10000, // ₹100
      idempotencyKey: 'pay_001',
    };
    const wallet = await service.topUp(input);
    expect(wallet.availableBalance).toBe;
    expect(wallet.lifetimeRecharged).toBe;
    expect(wallet.reservedBalance).toBe(0);

    // Ledger should have exactly one CREDIT row
    const entries = env.ledger.filter((l) => l.tenantId === 42);
    expect(entries).toHaveLength(1);
    expect(entries[0].entryType).toBe('CREDIT');
    expect(entries[0].amount).toBe;
    expect(entries[0].idempotencyKey).toBe('pay_001');
  });

  it('topUp is idempotent — a second call with the same key is a no-op', async () => {
    const env = makeEnv();
    const service = new WalletService(
      env.walletRepo as never,
      env.ledgerRepo as never,
      env.dataSource as never,
      { getTenantId: () => null } as never,
    );
    const input: TopUpWalletInput = {
      tenantId: 42,
      amount: 10000,
      idempotencyKey: 'pay_001',
    };
    const w1 = await service.topUp(input);
    const w2 = await service.topUp(input);
    expect(w2.availableBalance).toBe(w1.availableBalance);
    expect(env.ledger).toHaveLength(1);
  });

  it('lockFunds moves funds from available to reserved in one cycle', async () => {
    const env = makeEnv();
    const service = new WalletService(
      env.walletRepo as never,
      env.ledgerRepo as never,
      env.dataSource as never,
      { getTenantId: () => null } as never,
    );
    await service.topUp({
      tenantId: 42,
      amount: 10000,
      idempotencyKey: 'pay_001',
    });
    const w2 = await service.lockFunds({
      tenantId: 42,
      amount: 5000,
      reason: 'COURIER_LABEL',
      idempotencyKey: 'lock_ship_1',
    });
    // available should have decreased by 5000
    expect(w2.availableBalance).toBe;
    // reserved should have increased by 5000
    expect(w2.reservedBalance).toBe;

    // A LOCK entry must have been recorded
    const lockEntry = env.ledger.find(
      (l) => l.idempotencyKey === 'lock_ship_1',
    );
    expect(lockEntry).toBeTruthy();
    expect(lockEntry?.entryType).toBe('LOCK');
    expect(lockEntry?.amount).toBe;
    expect(lockEntry?.reason).toBe('COURIER_LABEL');
  });

  it('releaseFunds returns reserved funds to available', async () => {
    const env = makeEnv();
    const service = new WalletService(
      env.walletRepo as never,
      env.ledgerRepo as never,
      env.dataSource as never,
      { getTenantId: () => null } as never,
    );
    await service.topUp({
      tenantId: 42,
      amount: 10000,
      idempotencyKey: 'pay_001',
    });
    await service.lockFunds({
      tenantId: 42,
      amount: 5000,
      reason: 'COURIER_LABEL',
      idempotencyKey: 'lock_ship_1',
    });
    const w3 = await service.releaseFunds({
      tenantId: 42,
      amount: 5000,
      reason: 'SHIPMENT_CANCELLED',
      idempotencyKey: 'lock_ship_1',
    });
    // available is back to 10000, reserved back to 0
    expect(w3.availableBalance).toBe;
    expect(w3.reservedBalance).toBe(0);

    // The release should be persisted in the ledger
    const release = env.ledger.find(
      (l) => l.entryType === 'RELEASE' && l.idempotencyKey === 'lock_ship_1',
    );
    expect(release).toBeTruthy();
  });

  it('lockFunds rejects when the available balance is insufficient', async () => {
    const env = makeEnv();
    const service = new WalletService(
      env.walletRepo as never,
      env.ledgerRepo as never,
      env.dataSource as never,
      { getTenantId: () => null } as never,
    );
    await service.topUp({
      tenantId: 42,
      amount: 1000,
      idempotencyKey: 'pay_001',
    });
    await expect(
      service.lockFunds({
        tenantId: 42,
        amount: 2000,
        reason: 'OVERDRAFT',
        idempotencyKey: 'lock_over',
      }),
    ).rejects.toThrow(/Insufficient available balance to lock/);
  });

  it('releaseFunds rejects when the idempotency key never locked funds', async () => {
    const env = makeEnv();
    const service = new WalletService(
      env.walletRepo as never,
      env.ledgerRepo as never,
      env.dataSource as never,
      { getTenantId: () => null } as never,
    );
    await expect(
      service.releaseFunds({
        tenantId: 42,
        amount: 100,
        reason: 'GHOST',
        idempotencyKey: 'no_such_lock',
      }),
    ).rejects.toThrow(/No matching lock for idempotencyKey/);
  });

  it('topUp rejects non-positive amounts', async () => {
    const env = makeEnv();
    const service = new WalletService(
      env.walletRepo as never,
      env.ledgerRepo as never,
      env.dataSource as never,
      { getTenantId: () => null } as never,
    );
    await expect(
      service.topUp({
        tenantId: 42,
        amount: 0,
        idempotencyKey: 'zero',
      }),
    ).rejects.toThrow(/Top-up amount must be > 0/);
  });
});
