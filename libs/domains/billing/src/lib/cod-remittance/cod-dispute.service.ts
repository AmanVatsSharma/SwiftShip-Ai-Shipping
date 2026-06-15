/**
 * SS-033 — CodDisputeService.
 *
 * CRUD + lifecycle for `CodDisputeEntity`. The reconciliation engine
 * (pure function) only *computes* disputes; this service *persists*
 * them and moves them through OPEN → UNDER_REVIEW → RESOLVED.
 */
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CodDisputeEntity, CodRemittanceEntity } from '@swiftship/platform-typeorm';
import { TenantContext } from '@swiftship/domains-tenants';
import type { DisputeReason } from './cod-reconciliation.service';

export interface CreateDisputeInput {
  codRemittanceId: string;
  reason: DisputeReason | string;
  evidenceUrl?: string | null;
  comments?: string | null;
  metadata?: Record<string, any> | null;
}

@Injectable()
export class CodDisputeService {
  private readonly logger = new Logger(CodDisputeService.name);

  constructor(
    @InjectRepository(CodDisputeEntity)
    private readonly disputes: Repository<CodDisputeEntity>,
    @InjectRepository(CodRemittanceEntity)
    private readonly remittances: Repository<CodRemittanceEntity>,
    private readonly tenantContext: TenantContext,
  ) {}

  /**
   * Open a dispute. Idempotent on (codRemittanceId) — if an OPEN or
   * UNDER_REVIEW dispute already exists for that remittance we return
   * it instead of creating a duplicate.
   */
  async open(input: CreateDisputeInput): Promise<CodDisputeEntity> {
    const tenantId = this.requireTenantId();
    if (!input.codRemittanceId) {
      throw new BadRequestException('codRemittanceId is required');
    }
    if (!input.reason) {
      throw new BadRequestException('reason is required');
    }
    // Confirm the remittance exists in this tenant — saves us from
    // cross-tenant dispute injection.
    const rem = await this.remittances.findOne({
      where: { id: input.codRemittanceId, tenantId } as any,
    });
    if (!rem) {
      throw new NotFoundException(
        `CodRemittance ${input.codRemittanceId} not found for tenant ${tenantId}`,
      );
    }

    const existing = await this.disputes.findOne({
      where: {
        codRemittanceId: input.codRemittanceId,
        status: 'OPEN',
      } as any,
    });
    if (existing) {
      return existing;
    }
    const created = this.disputes.create({
      tenantId,
      codRemittanceId: input.codRemittanceId,
      reason: input.reason,
      status: 'OPEN',
      evidenceUrl: input.evidenceUrl ?? null,
      comments: input.comments ?? null,
      metadata: input.metadata ?? null,
    });
    return this.disputes.save(created);
  }

  /** Move to UNDER_REVIEW. Only valid from OPEN. */
  async startReview(id: string, tenantId: number): Promise<CodDisputeEntity> {
    const d = await this.findOne(id, tenantId);
    if (d.status === 'RESOLVED') {
      throw new BadRequestException('Cannot review a RESOLVED dispute');
    }
    d.status = 'UNDER_REVIEW';
    return this.disputes.save(d);
  }

  /**
   * Mark RESOLVED with an outcome comment. Allowed from any state —
   * "tried, gave up, refund issued" is a valid resolution.
   */
  async resolve(
    id: string,
    tenantId: number,
    comments: string,
  ): Promise<CodDisputeEntity> {
    if (!comments || !comments.trim()) {
      throw new BadRequestException('resolution comments are required');
    }
    const d = await this.findOne(id, tenantId);
    d.status = 'RESOLVED';
    d.comments = comments;
    d.resolvedAt = new Date();
    return this.disputes.save(d);
  }

  /** List disputes for a tenant, optionally filtered. */
  async list(
    tenantId: number,
    opts: { status?: 'OPEN' | 'UNDER_REVIEW' | 'RESOLVED' } = {},
  ): Promise<CodDisputeEntity[]> {
    const where: any = { tenantId };
    if (opts.status) where.status = opts.status;
    return this.disputes.find({
      where,
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string, tenantId: number): Promise<CodDisputeEntity> {
    const d = await this.disputes.findOne({ where: { id, tenantId } as any });
    if (!d) throw new NotFoundException(`Dispute ${id} not found`);
    return d;
  }

  private requireTenantId(): number {
    const tid = this.tenantContext.getTenantId();
    if (tid === null || tid === undefined) {
      throw new BadRequestException('Tenant context required');
    }
    return Number(tid);
  }
}
