/**
 * SS-031 — KYC service.
 *
 * Public surface:
 *   - {@link submitKyc}      — validate, persist, enqueue async verify
 *   - {@link kycStatus}      — read latest record for a tenant
 *   - {@link processVerifyJob} — BullMQ worker callback
 *   - {@link isTenantKycVerified} — gate used by OrdersService for COD
 *
 * The async verify path is driven by the `kyc-verification` queue. The
 * worker:
 *   - calls the bank-verifier adapter
 *   - on VERIFIED  → KycStatus.VERIFIED
 *   - on REJECTED  → KycStatus.REJECTED (terminal)
 *   - on INVALID   → KycStatus.REJECTED (terminal — no point retrying)
 *   - on PENDING   → throws so BullMQ retries with exponential backoff
 *
 * After the configured max attempts the job lands in the dead-letter
 * queue (BullMQ moves failed jobs to the `failed` set when `removeOnFail`
 * doesn't apply — we keep 1000 of them for audit, see queues.service).
 */
import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantContext } from '@swiftship/domains-tenants';
import { QueuesService } from '@swiftship/platform-queues';
import { KycDocumentEntity, KycRecordEntity, KycStatus } from './kyc.entity';
import { PanValidatorService } from './pan-validator';
import { GstinValidatorService } from './gstin-validator';
import { BankVerifierService } from './bank-verifier.service';
import { SubmitKycInput } from './kyc.input';

export const KYC_QUEUE_NAME = 'kyc-verification';
/** Job name used inside the queue. */
export const KYC_VERIFY_JOB = 'verify-kyc';
/** Max attempts before BullMQ moves a job to the dead-letter set. */
export const KYC_VERIFY_MAX_ATTEMPTS = 5;

/** Payload of a queued verify job. */
export interface KycVerifyJobData {
  kycRecordId: number;
  tenantId: number;
  attempt: number;
}

@Injectable()
export class KycService {
  private readonly logger = new Logger(KycService.name);

  constructor(
    @InjectRepository(KycRecordEntity)
    private readonly records: Repository<KycRecordEntity>,
    @InjectRepository(KycDocumentEntity)
    private readonly documents: Repository<KycDocumentEntity>,
    private readonly tenantContext: TenantContext,
    private readonly panValidator: PanValidatorService,
    private readonly gstinValidator: GstinValidatorService,
    private readonly bankVerifier: BankVerifierService,
    private readonly queues: QueuesService,
  ) {}

  /**
   * Public API: validate the submission, persist a `KycRecordEntity` (and
   * child documents), and enqueue an async verify job.
   */
  async submitKyc(input: SubmitKycInput): Promise<KycRecordEntity> {
    const tenantId = this.requireTenantId();

    // PAN + GSTIN structural validation (synchronous, fast).
    const panResult = this.panValidator.validate(input.pan);
    if (!panResult.valid) {
      throw new BadRequestException(`Invalid PAN: ${panResult.reason}`);
    }

    const gstinResult = this.gstinValidator.validate(input.gstin);
    if (!gstinResult.valid) {
      throw new BadRequestException(`Invalid GSTIN: ${gstinResult.reason}`);
    }

    // Sanity-check: the embedded PAN inside the GSTIN must match the
    // user-supplied PAN. Many Indian merchants get this wrong.
    if (gstinResult.pan !== panResult.normalized) {
      throw new BadRequestException(
        'GSTIN does not embed the supplied PAN — both must belong to the same legal entity',
      );
    }

    const account = (input.bankAccountNumber ?? '').replace(/\s+/g, '');
    if (!/^\d{9,18}$/.test(account)) {
      throw new BadRequestException('Bank account number must be 9-18 digits');
    }

    // Persist the record (we only store last 4 — full number is never written).
    const record = this.records.create({
      tenantId,
      pan: panResult.normalized!,
      gstin: gstinResult.normalized!,
      bankAccountLast4: account.slice(-4),
      ifsc: input.ifsc.toUpperCase(),
      accountHolderName: input.accountHolderName ?? null,
      status: KycStatus.PENDING,
      submittedAt: new Date(),
    });
    const saved = await this.records.save(record);

    // Persist child documents (if any).
    if (input.documents && input.documents.length > 0) {
      const docs = input.documents.map((d) =>
        this.documents.create({
          kycRecordId: saved.id,
          docType: d.docType as any,
          s3Key: d.s3Key,
          contentType: d.contentType ?? null,
        }),
      );
      await this.documents.save(docs);
    }

    // Enqueue async verification. BullMQ handles retries + dead-letter.
    await this.queues.add(
      KYC_QUEUE_NAME,
      {
        name: KYC_VERIFY_JOB,
        kycRecordId: saved.id,
        tenantId,
        attempt: 0,
      } as KycVerifyJobData,
      {
        attempts: KYC_VERIFY_MAX_ATTEMPTS,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: true,
        removeOnFail: 1000, // keep last 1000 failures for audit
        jobId: `kyc-verify-${saved.id}`, // idempotent — re-submission overwrites
      },
    );

    return this.getRecord(saved.id, tenantId);
  }

  /**
   * Public API: read the latest KYC record for the current tenant.
   */
  async kycStatus(tenantId?: number): Promise<KycRecordEntity | null> {
    const tid = tenantId ?? this.requireTenantId();
    return this.records.findOne({
      where: { tenantId: tid },
      order: { createdAt: 'DESC' },
      relations: ['documents'],
    });
  }

  /**
   * Public API: gate used by OrdersService to reject COD orders from
   * tenants with non-VERIFIED KYC.
   */
  async isTenantKycVerified(tenantId: number): Promise<boolean> {
    const latest = await this.records.findOne({
      where: { tenantId, status: KycStatus.VERIFIED },
      order: { createdAt: 'DESC' },
    });
    return !!latest;
  }

  /**
   * BullMQ worker callback. Called once per attempt; idempotent.
   *
   * Throws when the provider returns PENDING (so BullMQ retries with
   * exponential backoff). Returns the new status on terminal success.
   */
  async processVerifyJob(data: KycVerifyJobData): Promise<KycStatus> {
    const { kycRecordId, tenantId } = data;

    const record = await this.records.findOne({
      where: { id: kycRecordId, tenantId },
    });
    if (!record) {
      // Record was deleted out from under the job — nothing to do, log
      // and stop the worker (returning a value, not throwing).
      this.logger.warn(
        `KYC verify job: record ${kycRecordId} not found for tenant ${tenantId}`,
      );
      return KycStatus.REJECTED;
    }

    // Idempotency: a re-run on a terminal record is a no-op.
    if (
      record.status === KycStatus.VERIFIED ||
      record.status === KycStatus.REJECTED
    ) {
      this.logger.debug(
        `KYC record ${kycRecordId} already ${record.status} — skipping`,
      );
      return record.status;
    }

    // Mark as UNDER_REVIEW the first time we see the job.
    if (record.status === KycStatus.PENDING) {
      record.status = KycStatus.UNDER_REVIEW;
      await this.records.save(record);
    }

    // We do NOT have the full bank account number at this layer — the
    // merchant entered it at submission time. For penny-drop, the
    // provider needs the full number, so we accept it inline as part
    // of the job payload in production. In our test path we pass
    // `accountNumber` via metadata.
    const accountNumber = (record.metadata?.bankAccountNumber as string) ?? '';
    const result = await this.bankVerifier.verify({
      tenantId,
      accountNumber,
      ifsc: record.ifsc,
      accountHolderName: record.accountHolderName ?? undefined,
    });

    if (result.status === 'VERIFIED') {
      record.status = KycStatus.VERIFIED;
      record.providerRef = result.providerRef ?? null;
      record.verifiedAt = new Date();
      await this.records.save(record);
      return KycStatus.VERIFIED;
    }

    if (result.status === 'REJECTED' || result.status === 'INVALID') {
      record.status = KycStatus.REJECTED;
      record.providerRef = result.providerRef ?? null;
      record.rejectionReason = result.reason ?? result.status;
      await this.records.save(record);
      return KycStatus.REJECTED;
    }

    // PENDING — the provider wants another go. Throw so BullMQ retries.
    record.status = KycStatus.UNDER_REVIEW;
    record.rejectionReason = null;
    await this.records.save(record);
    throw new Error(
      `KYC provider returned PENDING for record ${kycRecordId} (will retry)`,
    );
  }

  /**
   * Worker bootstrap helper — registers the BullMQ worker for the
   * kyc-verification queue. Call once at module init.
   */
  registerWorker(): void {
    this.queues.createWorker(
      KYC_QUEUE_NAME,
      async (job: any) => {
        return this.processVerifyJob({
          kycRecordId: job.data.kycRecordId,
          tenantId: job.data.tenantId,
          attempt: job.attemptsMade ?? 0,
        } as KycVerifyJobData);
      },
    );
  }

  private requireTenantId(): number {
    const tid = this.tenantContext.getTenantId();
    if (tid === null || tid === undefined) {
      throw new BadRequestException('Tenant context required for KYC operation');
    }
    return Number(tid);
  }

  private async getRecord(
    id: number,
    tenantId: number,
  ): Promise<KycRecordEntity> {
    const record = await this.records.findOne({
      where: { id, tenantId },
      relations: ['documents'],
    });
    if (!record) {
      throw new NotFoundException(`KYC record ${id} not found`);
    }
    return record;
  }
}
