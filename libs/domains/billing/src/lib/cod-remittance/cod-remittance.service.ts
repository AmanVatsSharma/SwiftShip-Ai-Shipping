/**
 * SS-033 — CodRemittanceService.
 *
 * Owns the lifecycle of `BankCodRemittanceEntity` rows: ingestion from
 * courier APIs, idempotency on re-ingest, and the read APIs that the
 * reconciliation engine and the admin portal use.
 *
 * Ingestion is intentionally decoupled from the bank-statement side
 * — the engine runs offline (cron) and joins the two halves. This
 * service is a thin TypeORM wrapper around the remittance side.
 */
import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BankCodRemittanceEntity } from '@swiftship/platform-typeorm';
import { TenantContext } from '@swiftship/domains-tenants';

export interface IngestRemittanceInput {
  courier: string;
  period: string;
  amount: number;
  depositDate: Date;
  courierRef?: string | null;
  externalId?: string | null;
  metadata?: Record<string, any> | null;
}

@Injectable()
export class CodRemittanceService {
  private readonly logger = new Logger(CodRemittanceService.name);

  constructor(
    @InjectRepository(BankCodRemittanceEntity)
    private readonly remittances: Repository<BankCodRemittanceEntity>,
    private readonly tenantContext: TenantContext,
  ) {}

  /**
   * Idempotently ingest a remittance record. If `externalId` is
   * provided and a row already exists with the same (tenantId,
   * externalId), we return the existing row instead of creating a
   * duplicate. This is what protects us from courier-API retries
   * double-counting.
   */
  async ingest(
    input: IngestRemittanceInput,
  ): Promise<{ remittance: BankCodRemittanceEntity; created: boolean }> {
    const tenantId = this.requireTenantId();
    if (!input.courier) throw new BadRequestException('courier is required');
    if (!input.period) throw new BadRequestException('period is required');
    if (!Number.isFinite(input.amount) || input.amount <= 0) {
      throw new BadRequestException('amount must be > 0');
    }
    if (!input.depositDate || Number.isNaN(input.depositDate.getTime())) {
      throw new BadRequestException('depositDate is invalid');
    }

    if (input.externalId) {
      const existing = await this.remittances.findOne({
        where: { tenantId, externalId: input.externalId } as any,
      });
      if (existing) {
        return { remittance: existing, created: false };
      }
    }

    const saved = await this.remittances.save({
      tenantId,
      courier: input.courier,
      period: input.period,
      amount: input.amount,
      depositDate: input.depositDate,
      courierRef: input.courierRef ?? null,
      externalId: input.externalId ?? null,
      status: 'PENDING' as any,
      metadata: input.metadata ?? null,
    });
    return { remittance: saved as any, created: true };
  }

  /** All PENDING / RECEIVED rows for this tenant. Used by the cron. */
  async listPending(tenantId: number): Promise<BankCodRemittanceEntity[]> {
    return this.remittances.find({
      where: [
        { tenantId, status: 'PENDING' },
        { tenantId, status: 'RECEIVED' },
      ] as any,
      order: { depositDate: 'ASC' } as any,
    });
  }

  /** Single tenant IDs that have at least one pending remittance. */
  async listTenantsWithPending(): Promise<number[]> {
    // Raw query — TypeORM's `find` can't do DISTINCT, but this is
    // cheap with the (tenantId, depositDate) index from the migration.
    const rows = await this.remittances
      .createQueryBuilder('r')
      .select('DISTINCT r.tenantId', 'tenantId')
      .where("r.status IN ('PENDING', 'RECEIVED')")
      .getRawMany<{ tenantId: number }>();
    return rows.map((r) => Number(r.tenantId));
  }

  /** Mark a remittance as RECEIVED (matched to a bank txn). */
  async markReceived(id: string, tenantId: number): Promise<void> {
    await this.remittances.update({ id, tenantId } as any, { status: 'RECEIVED' });
  }

  /** Mark a remittance as RECONCILED (agent confirmed). */
  async markReconciled(id: string, tenantId: number): Promise<void> {
    await this.remittances.update(
      { id, tenantId } as any,
      { status: 'RECONCILED' },
    );
  }

  /** Mark a remittance as DISPUTED (a dispute row was created). */
  async markDisputed(id: string, tenantId: number): Promise<void> {
    await this.remittances.update({ id, tenantId } as any, { status: 'DISPUTED' });
  }

  /** Find by id within tenant scope. */
  async findById(id: string, tenantId: number): Promise<BankCodRemittanceEntity | null> {
    return this.remittances.findOne({ where: { id, tenantId } as any });
  }

  private requireTenantId(): number {
    const tid = this.tenantContext.getTenantId();
    if (tid === null || tid === undefined) {
      throw new BadRequestException('Tenant context required');
    }
    return Number(tid);
  }
}
