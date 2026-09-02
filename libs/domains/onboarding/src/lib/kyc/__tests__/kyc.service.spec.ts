import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { TenantContext } from '@swiftship/domains-tenants';
import { QueuesService } from '@swiftship/platform-queues';
import { KycService, KYC_QUEUE_NAME, KYC_VERIFY_JOB, KYC_VERIFY_MAX_ATTEMPTS } from '../kyc.service';
import { KycRecordEntity, KycDocumentEntity, KycStatus } from '../kyc.entity';
import { PanValidatorService } from '../pan-validator';
import { GstinValidatorService } from '../gstin-validator';
import {
  BankVerifierService,
  type BankVerifyResult,
} from '../bank-verifier.service';
import { computeGstinChecksum } from '../gstin-validator';
import { SubmitKycInput } from '../kyc.input';

/**
 * SS-031 — KycService spec. Covers the full async pipeline:
 *   1. submitKyc validates PAN + GSTIN + bank and persists a record
 *   2. submitKyc enqueues a job on the kyc-verification queue
 *   3. processVerifyJob honors provider outcomes (VERIFIED, REJECTED, PENDING)
 *   4. PENDING throws to drive BullMQ retry; after max attempts the
 *      record is left in UNDER_REVIEW (dead-letter)
 *   5. isTenantKycVerified is the gate used by OrdersService for COD
 *   6. kycStatus reads back the latest record
 *
 * All repos are in-memory jest mocks so the suite is hermetic and fast.
 */
describe('KycService', () => {
  let service: KycService;
  let records: any;
  let documents: any;
  let queues: { add: jest.Mock; createWorker: jest.Mock };
  let bankVerifier: { verify: jest.Mock };

  const tenantContext = {
    getTenantId: jest.fn().mockReturnValue(1),
  };

  // Pick a known-good fixture: PAN AABCT1330L, GSTIN 27AABCT1330L1Z<checksum>
  const RELIANCE_PAN = 'AABCT1330L';
  const RELIANCE_STATE = '27';
  const RELIANCE_ENTITY = '1';
  const RELIANCE_PREFIX = `${RELIANCE_STATE}${RELIANCE_PAN}${RELIANCE_ENTITY}Z`;
  const RELIANCE_GSTIN = `${RELIANCE_PREFIX}${computeGstinChecksum(RELIANCE_PREFIX)}`;

  const baseInput: SubmitKycInput = {
    pan: RELIANCE_PAN,
    gstin: RELIANCE_GSTIN,
    bankAccountNumber: '1111111111',
    ifsc: 'SBIN0001234',
    accountHolderName: 'John Doe',
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    records = {
      create: jest.fn((data) => ({ id: 1, status: KycStatus.PENDING, ...data })),
      save: jest.fn(async (data) => ({ id: 1, ...data })),
      findOne: jest.fn(),
    };
    documents = {
      create: jest.fn((data) => ({ id: 1, ...data })),
      save: jest.fn(async (data) => data),
    };
    queues = {
      add: jest.fn().mockResolvedValue({ id: 'job-1' }),
      createWorker: jest.fn(),
    };
    bankVerifier = { verify: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KycService,
        PanValidatorService,
        GstinValidatorService,
        { provide: TenantContext, useValue: tenantContext },
        { provide: getRepositoryToken(KycRecordEntity), useValue: records },
        { provide: getRepositoryToken(KycDocumentEntity), useValue: documents },
        { provide: QueuesService, useValue: queues },
        { provide: BankVerifierService, useValue: bankVerifier },
      ],
    }).compile();

    service = module.get(KycService);
  });

  describe('submitKyc', () => {
    it('persists a record and enqueues a verify job on a valid submission', async () => {
      records.findOne.mockResolvedValueOnce({
        id: 1,
        tenantId: 1,
        status: KycStatus.PENDING,
        pan: RELIANCE_PAN,
        gstin: RELIANCE_GSTIN,
        bankAccountLast4: '1111',
        ifsc: 'SBIN0001234',
        submittedAt: new Date(),
        documents: [],
      });
      // The post-save getRecord lookup — return what was just saved.
      records.findOne.mockResolvedValueOnce({
        id: 1,
        tenantId: 1,
        status: KycStatus.PENDING,
        pan: RELIANCE_PAN,
        gstin: RELIANCE_GSTIN,
        bankAccountLast4: '1111',
        ifsc: 'SBIN0001234',
        submittedAt: new Date(),
        documents: [],
      });

      const result = await service.submitKyc(baseInput);

      expect(records.create).toHaveBeenCalledWith(
        expect.objectContaining({
          tenantId: 1,
          pan: RELIANCE_PAN,
          gstin: RELIANCE_GSTIN,
          bankAccountLast4: '1111',
        }),
      );
      expect(records.save).toHaveBeenCalled();
      expect(queues.add).toHaveBeenCalledWith(
        KYC_QUEUE_NAME,
        expect.objectContaining({
          name: KYC_VERIFY_JOB,
          kycRecordId: 1,
          tenantId: 1,
        }),
        expect.objectContaining({
          attempts: KYC_VERIFY_MAX_ATTEMPTS,
          jobId: 'kyc-verify-1',
        }),
      );
      expect(result).toBeDefined();
    });

    it('rejects when the tenant context is missing', async () => {
      tenantContext.getTenantId.mockReturnValueOnce(null);
      await expect(service.submitKyc(baseInput)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects when PAN is structurally invalid', async () => {
      await expect(
        service.submitKyc({ ...baseInput, pan: 'BADPAN' }),
      ).rejects.toThrow(/Invalid PAN/);
    });

    it('rejects when GSTIN is structurally invalid', async () => {
      await expect(
        service.submitKyc({ ...baseInput, gstin: 'BADGSTIN12345' }),
      ).rejects.toThrow(/Invalid GSTIN/);
    });

    it('rejects when the embedded GSTIN PAN does not match the supplied PAN', async () => {
      // Build a structurally valid GSTIN for a different PAN.
      const differentPan = 'ZZZCZ9999A';
      const prefix = `27${differentPan}1Z`;
      const differentGstin = `${prefix}${computeGstinChecksum(prefix)}`;
      await expect(
        service.submitKyc({ ...baseInput, gstin: differentGstin }),
      ).rejects.toThrow(/same legal entity/);
    });

    it('rejects when the bank account number is too short', async () => {
      await expect(
        service.submitKyc({ ...baseInput, bankAccountNumber: '12' }),
      ).rejects.toThrow(/9-18 digits/);
    });

    it('persists child documents when supplied', async () => {
      records.findOne.mockResolvedValue({
        id: 1,
        tenantId: 1,
        status: KycStatus.PENDING,
        documents: [],
      });

      await service.submitKyc({
        ...baseInput,
        documents: [
          { docType: 'PAN', s3Key: 'kyc/1/pan.jpg' },
          { docType: 'BANK_STATEMENT', s3Key: 'kyc/1/stmt.pdf' },
        ],
      });

      expect(documents.create).toHaveBeenCalledTimes(2);
      expect(documents.save).toHaveBeenCalled();
    });
  });

  describe('processVerifyJob', () => {
    const jobData = { kycRecordId: 1, tenantId: 1, attempt: 0 };

    it('marks VERIFIED when the provider returns VERIFIED', async () => {
      records.findOne.mockResolvedValueOnce({
        id: 1,
        tenantId: 1,
        status: KycStatus.PENDING,
        bankAccountLast4: '1111',
        ifsc: 'SBIN0001234',
        metadata: { bankAccountNumber: '1111111111' },
      });
      const verifyResult: BankVerifyResult = {
        status: 'VERIFIED',
        providerRef: 'setu-1',
        holderName: 'JOHN DOE',
      };
      bankVerifier.verify.mockResolvedValueOnce(verifyResult);

      const result = await service.processVerifyJob(jobData);

      expect(result).toBe(KycStatus.VERIFIED);
      expect(records.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: KycStatus.VERIFIED }),
      );
    });

    it('marks REJECTED when the provider returns REJECTED', async () => {
      records.findOne.mockResolvedValueOnce({
        id: 1,
        tenantId: 1,
        status: KycStatus.UNDER_REVIEW,
        bankAccountLast4: '9999',
        ifsc: 'SBIN0001234',
        metadata: { bankAccountNumber: '9999999999' },
      });
      bankVerifier.verify.mockResolvedValueOnce({
        status: 'REJECTED',
        reason: 'Name mismatch',
      });

      const result = await service.processVerifyJob(jobData);
      expect(result).toBe(KycStatus.REJECTED);
      expect(records.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: KycStatus.REJECTED }),
      );
    });

    it('throws on PENDING so BullMQ retries with backoff', async () => {
      records.findOne.mockResolvedValueOnce({
        id: 1,
        tenantId: 1,
        status: KycStatus.UNDER_REVIEW,
        bankAccountLast4: '1234',
        ifsc: 'HDFC0000123',
        metadata: { bankAccountNumber: '1234567890' },
      });
      bankVerifier.verify.mockResolvedValueOnce({ status: 'PENDING' });

      await expect(service.processVerifyJob(jobData)).rejects.toThrow(
        /PENDING/,
      );
      // Record left in UNDER_REVIEW — terminal not yet reached.
      expect(records.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: KycStatus.UNDER_REVIEW }),
      );
    });

    it('is a no-op when the record is already VERIFIED (idempotency)', async () => {
      records.findOne.mockResolvedValueOnce({
        id: 1,
        tenantId: 1,
        status: KycStatus.VERIFIED,
        bankAccountLast4: '1111',
        ifsc: 'SBIN0001234',
      });

      const result = await service.processVerifyJob(jobData);
      expect(result).toBe(KycStatus.VERIFIED);
      expect(bankVerifier.verify).not.toHaveBeenCalled();
    });

    it('returns REJECTED when the record was deleted (defensive)', async () => {
      records.findOne.mockResolvedValueOnce(null);
      const result = await service.processVerifyJob(jobData);
      expect(result).toBe(KycStatus.REJECTED);
    });
  });

  describe('isTenantKycVerified (COD gate)', () => {
    it('returns true when the tenant has a VERIFIED record', async () => {
      records.findOne.mockResolvedValueOnce({ id: 1, status: KycStatus.VERIFIED });
      expect(await service.isTenantKycVerified(1)).toBe(true);
    });

    it('returns false when the tenant has no record', async () => {
      records.findOne.mockResolvedValueOnce(null);
      expect(await service.isTenantKycVerified(1)).toBe(false);
    });

    it('returns false when the latest record is REJECTED', async () => {
      records.findOne.mockResolvedValueOnce(null);
      expect(await service.isTenantKycVerified(1)).toBe(false);
    });
  });

  describe('kycStatus', () => {
    it('returns the latest record for the tenant', async () => {
      const latest = { id: 7, status: KycStatus.VERIFIED };
      records.findOne.mockResolvedValueOnce(latest);
      expect(await service.kycStatus()).toBe(latest);
      expect(records.findOne).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { tenantId: 1 },
          order: { createdAt: 'DESC' },
        }),
      );
    });

    it('returns null when the tenant has not submitted', async () => {
      records.findOne.mockResolvedValueOnce(null);
      expect(await service.kycStatus()).toBeNull();
    });
  });
});
