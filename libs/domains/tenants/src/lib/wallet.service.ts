import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { TenantEntity } from './entities';
import {
  LockFundsInput,
  ReleaseFundsInput,
  TopUpWalletInput,
  WalletStatementFilterInput,
} from './wallet.input';
import {
  WalletLedgerEntity,
  WalletLedgerEntryType,
} from './wallet-ledger.entity';
import { WalletEntity } from './wallet.entity';
import { TenantContext } from './tenant.context';

const REASON_TOPUP = 'WALLET_TOPUP';
const REASON_INTERNAL_TRANSFER = 'INTERNAL_TRANSFER';
const REASON_LOCK = 'WALLET_LOCK';
const REASON_RELEASE = 'WALLET_RELEASE';

@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);

  constructor(
    @InjectRepository(WalletEntity)
    private readonly wallets: Repository<WalletEntity>,
    @InjectRepository(WalletLedgerEntity)
    private readonly ledger: Repository<WalletLedgerEntity>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly tenantContext: TenantContext,
  ) {}

  /**
   * SS-002c: explicit tenantId filter on the read path. The wallet table
   * already has a `tenantId` column from the SS-002 migration; we add it
   * to every `findOne` / `find` / `where` so a request from tenant A
   * cannot read tenant B's wallet balance.
   *
   * `findByTenant(tenantId)` is preserved as the system path — it's the
   * call sites used by onboarding and admin tools that *legitimately* need
   * to look up a wallet by tenantId. The system callers should wrap the
   * call in `withSystemContext` (see prisma-compat.types.ts) for clarity.
   */
  async getWallet(): Promise<WalletEntity> {
    const tid = this.tenantContext.getTenantId();
    if (tid === null || tid === undefined) {
      throw new BadRequestException('Tenant context required for wallet read');
    }
    const wallet = await this.wallets.findOne({ where: { tenantId: Number(tid) } });
    if (!wallet) {
      throw new NotFoundException(`Wallet for tenant ${tid} not found`);
    }
    return wallet;
  }

  // ---------------------------------------------------------------------
  // topUp
  // ---------------------------------------------------------------------
  async topUp(input: TopUpWalletInput): Promise<WalletEntity> {
    if (input.amount <= 0) {
      throw new BadRequestException('Top-up amount must be > 0 paise');
    }
    return this.dataSource.transaction(async (em) =>
      this.applyTopUp(em, input),
    );
  }

  private async applyTopUp(
    em: EntityManager,
    input: TopUpWalletInput,
  ): Promise<WalletEntity> {
    const existing = await this.findPriorLedgerByKey(
      em,
      input.tenantId,
      input.idempotencyKey,
    );
    if (existing) {
      // Idempotent replay — return the wallet as it stands right now.
      return this.getOrCreateWallet(em, input.tenantId);
    }

    const wallet = await this.getOrCreateWallet(em, input.tenantId);

    // Ledger row first — its unique idempotency index is the gatekeeper.
    const ledger = em.create(WalletLedgerEntity, {
      tenantId: input.tenantId,
      walletId: wallet.id,
      entryType: 'CREDIT',
      amount: input.amount,
      reason: REASON_TOPUP,
      idempotencyKey: input.idempotencyKey,
      metadata: input.metadata ?? {},
    });
    await em.save(ledger);

    // Then update the running balance.
    await em.increment(
      WalletEntity,
      { id: wallet.id },
      'availableBalance',
      input.amount,
    );
    await em.increment(
      WalletEntity,
      { id: wallet.id },
      'lifetimeRecharged',
      input.amount,
    );

    const updated = await em.findOne(WalletEntity, { where: { id: wallet.id } });
    if (!updated) {
      throw new NotFoundException(`Wallet ${wallet.id} disappeared mid-transaction`);
    }
    this.logger.log(
      `topUp tenant=${input.tenantId} +${input.amount}p key=${input.idempotencyKey}`,
    );
    return updated;
  }

  // ---------------------------------------------------------------------
  // transferBetweenWallets
  // ---------------------------------------------------------------------
  async transferBetweenWallets(
    fromTenantId: number,
    toTenantId: number,
    amount: number,
    reason: string,
    idempotencyKey: string,
  ): Promise<void> {
    if (amount <= 0) {
      throw new BadRequestException('Transfer amount must be > 0 paise');
    }
    if (fromTenantId === toTenantId) {
      throw new BadRequestException('Cannot transfer to the same wallet');
    }

    await this.dataSource.transaction(async (em) => {
      const prior = await this.findPriorLedgerByKey(
        em,
        fromTenantId,
        idempotencyKey,
      );
      if (prior) return; // already applied; no-op

      // Lock the from-wallet row first to enforce the available-balance check.
      const from = await this.getOrCreateWalletForUpdate(em, fromTenantId);
      if (from.availableBalance < amount) {
        throw new BadRequestException(
          `Insufficient available balance: have ${from.availableBalance}p, need ${amount}p`,
        );
      }

      // Insert both legs' ledger rows in the same transaction.
      const outLedger = em.create(WalletLedgerEntity, {
        tenantId: fromTenantId,
        walletId: from.id,
        entryType: 'DEBIT',
        amount,
        reason: reason || REASON_INTERNAL_TRANSFER,
        idempotencyKey,
        metadata: { fromTenantId, toTenantId },
      });
      await em.save(outLedger);

      const to = await this.getOrCreateWallet(em, toTenantId);
      const inLedger = em.create(WalletLedgerEntity, {
        tenantId: toTenantId,
        walletId: to.id,
        entryType: 'CREDIT',
        amount,
        reason: reason || REASON_INTERNAL_TRANSFER,
        idempotencyKey: `${idempotencyKey}:in`,
        metadata: { fromTenantId, toTenantId },
      });
      await em.save(inLedger);

      // Apply balance changes.
      await em.decrement(
        WalletEntity,
        { id: from.id },
        'availableBalance',
        amount,
      );
      await em.increment(
        WalletEntity,
        { id: to.id },
        'availableBalance',
        amount,
      );
    });
  }

  // ---------------------------------------------------------------------
  // lockFunds
  // ---------------------------------------------------------------------
  async lockFunds(input: LockFundsInput): Promise<WalletEntity> {
    if (input.amount <= 0) {
      throw new BadRequestException('Lock amount must be > 0 paise');
    }

    return this.dataSource.transaction(async (em) => {
      const prior = await this.findPriorLedgerByKey(
        em,
        input.tenantId,
        input.idempotencyKey,
      );
      if (prior) {
        return this.getOrCreateWallet(em, input.tenantId);
      }

      const wallet = await this.getOrCreateWalletForUpdate(em, input.tenantId);
      if (wallet.availableBalance < input.amount) {
        throw new BadRequestException(
          `Insufficient available balance to lock: have ${wallet.availableBalance}p, need ${input.amount}p`,
        );
      }

      const ledger = em.create(WalletLedgerEntity, {
        tenantId: input.tenantId,
        walletId: wallet.id,
        entryType: 'LOCK',
        amount: input.amount,
        reason: input.reason || REASON_LOCK,
        idempotencyKey: input.idempotencyKey,
        metadata: input.metadata ?? {},
      });
      await em.save(ledger);

      // Single UPDATE: move the funds from available → reserved in one statement.
      await em
        .createQueryBuilder()
        .update(WalletEntity)
        .set({
          availableBalance: () => `"availableBalance" - ${input.amount}`,
          reservedBalance: () => `"reservedBalance" + ${input.amount}`,
        })
        .where('id = :id', { id: wallet.id })
        .execute();

      const updated = await em.findOne(WalletEntity, { where: { id: wallet.id } });
      if (!updated) {
        throw new NotFoundException(`Wallet ${wallet.id} disappeared mid-transaction`);
      }
      return updated;
    });
  }

  // ---------------------------------------------------------------------
  // releaseFunds
  // ---------------------------------------------------------------------
  async releaseFunds(input: ReleaseFundsInput): Promise<WalletEntity> {
    if (input.amount <= 0) {
      throw new BadRequestException('Release amount must be > 0 paise');
    }

    return this.dataSource.transaction(async (em) => {
      const prior = await this.findPriorLedgerByKey(
        em,
        input.tenantId,
        input.idempotencyKey,
      );
      if (prior) {
        return this.getOrCreateWallet(em, input.tenantId);
      }

      // Reject release without a matching LOCK — the key must have been
      // a LOCK key previously.
      const lockEntry = await em.findOne(WalletLedgerEntity, {
        where: { tenantId: input.tenantId, idempotencyKey: input.idempotencyKey },
      });
      if (!lockEntry) {
        throw new BadRequestException(
          `No matching lock for idempotencyKey=${input.idempotencyKey}`,
        );
      }
      if (lockEntry.entryType !== 'LOCK') {
        throw new BadRequestException(
          `Idempotency key ${input.idempotencyKey} was used for ${lockEntry.entryType}, not LOCK`,
        );
      }

      const wallet = await this.getOrCreateWalletForUpdate(em, input.tenantId);
      if (wallet.reservedBalance < input.amount) {
        throw new BadRequestException(
          `Insufficient reserved balance to release: have ${wallet.reservedBalance}p, need ${input.amount}p`,
        );
      }

      const ledger = em.create(WalletLedgerEntity, {
        tenantId: input.tenantId,
        walletId: wallet.id,
        entryType: 'RELEASE',
        amount: input.amount,
        reason: input.reason || REASON_RELEASE,
        idempotencyKey: input.idempotencyKey,
        metadata: input.metadata ?? {},
      });
      await em.save(ledger);

      await em
        .createQueryBuilder()
        .update(WalletEntity)
        .set({
          reservedBalance: () => `"reservedBalance" - ${input.amount}`,
          availableBalance: () => `"availableBalance" + ${input.amount}`,
        })
        .where('id = :id', { id: wallet.id })
        .execute();

      const updated = await em.findOne(WalletEntity, { where: { id: wallet.id } });
      if (!updated) {
        throw new NotFoundException(`Wallet ${wallet.id} disappeared mid-transaction`);
      }
      return updated;
    });
  }

  // ---------------------------------------------------------------------
  // walletStatement
  // ---------------------------------------------------------------------
  async walletStatement(
    filter: WalletStatementFilterInput,
  ): Promise<WalletLedgerEntity[]> {
    const qb = this.ledger.createQueryBuilder('l');
    qb.where('l.tenantId = :tenantId', { tenantId: filter.tenantId });
    if (filter.fromDate) {
      qb.andWhere('l.createdAt >= :from', { from: filter.fromDate });
    }
    if (filter.toDate) {
      qb.andWhere('l.createdAt <= :to', { to: filter.toDate });
    }
    if (filter.entryType) {
      qb.andWhere('l.entryType = :entryType', { entryType: filter.entryType });
    }
    if (filter.reason) {
      qb.andWhere('l.reason = :reason', { reason: filter.reason });
    }
    qb.orderBy('l.createdAt', 'DESC');
    qb.take(filter.limit ?? 100);
    qb.skip(filter.offset ?? 0);
    return qb.getMany();
  }

  // ---------------------------------------------------------------------
  // helpers
  // ---------------------------------------------------------------------
  async findByTenant(tenantId: number): Promise<WalletEntity | null> {
    return this.wallets.findOne({ where: { tenantId } });
  }

  /**
   * Internal hook used by SS-004's invoice flow. We re-fetch the wallet
   * inside the same transaction as the ledger write so a top-up is never
   * observable without a ledger row.
   */
  private async findPriorLedgerByKey(
    em: EntityManager,
    tenantId: number,
    idempotencyKey: string,
  ): Promise<WalletLedgerEntity | null> {
    return em.findOne(WalletLedgerEntity, {
      where: { tenantId, idempotencyKey },
    });
  }

  private async getOrCreateWallet(
    em: EntityManager,
    tenantId: number,
  ): Promise<WalletEntity> {
    const existing = await em.findOne(WalletEntity, { where: { tenantId } });
    if (existing) return existing;

    // Confirm the tenant exists before minting a wallet for it.
    const tenant = await em.findOne(TenantEntity, { where: { id: tenantId } });
    if (!tenant) {
      throw new NotFoundException(`Tenant ${tenantId} not found`);
    }

    const wallet = em.create(WalletEntity, {
      tenantId,
      availableBalance: 0,
      reservedBalance: 0,
      lifetimeRecharged: 0,
    });
    return em.save(wallet);
  }

  /**
   * Like getOrCreateWallet but issues a `SELECT ... FOR UPDATE` so the
   * balance-check + write pair is race-free across concurrent mutators.
   */
  private async getOrCreateWalletForUpdate(
    em: EntityManager,
    tenantId: number,
  ): Promise<WalletEntity> {
    const existing = await em
      .createQueryBuilder(WalletEntity, 'w')
      .setLock('pessimistic_write')
      .where('w.tenantId = :tenantId', { tenantId })
      .getOne();
    if (existing) return existing;

    const tenant = await em.findOne(TenantEntity, { where: { id: tenantId } });
    if (!tenant) {
      throw new NotFoundException(`Tenant ${tenantId} not found`);
    }

    const wallet = em.create(WalletEntity, {
      tenantId,
      availableBalance: 0,
      reservedBalance: 0,
      lifetimeRecharged: 0,
    });
    return em.save(wallet);
  }
}

// Re-export the entry-type union so resolvers can reference it without
// pulling the entity file directly.
export type { WalletLedgerEntryType };
