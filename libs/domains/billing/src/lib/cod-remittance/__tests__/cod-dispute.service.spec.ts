/**
 * SS-033 — CodDisputeService spec.
 *
 * Covers:
 *  - opening a dispute (idempotent on the same remittance)
 *  - starting review
 *  - resolving (comments required, resolvedAt timestamp set)
 *  - rejecting an invalid transition
 */
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CodDisputeService } from '../cod-dispute.service';
import { TenantContext } from '@swiftship/domains-tenants';
import { DISPUTE_REASONS } from '../cod-reconciliation.service';
import {
  BankCodDisputeEntity,
  BankCodRemittanceEntity,
} from '@swiftship/platform-typeorm';

describe('CodDisputeService (SS-033)', () => {
  let service: CodDisputeService;
  let disputes: any;
  let remittances: any;
  let tenantContext: any;

  beforeEach(async () => {
    disputes = {
      create: jest.fn((d) => ({ id: 'd-new', ...d })),
      save: jest.fn(async (d) => d),
      findOne: jest.fn(),
      find: jest.fn(),
    };
    remittances = {
      findOne: jest.fn(),
    };
    tenantContext = {
      getTenantId: jest.fn().mockReturnValue(7),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CodDisputeService,
        {
          provide: getRepositoryToken(BankCodDisputeEntity),
          useValue: disputes,
        },
        {
          provide: getRepositoryToken(BankCodRemittanceEntity),
          useValue: remittances,
        },
        { provide: TenantContext, useValue: tenantContext },
      ],
    }).compile();
    service = module.get(CodDisputeService);
  });

  describe('open', () => {
    it('throws when codRemittanceId is missing', async () => {
      await expect(
        service.open({ codRemittanceId: '', reason: 'X' } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws when reason is missing', async () => {
      await expect(
        service.open({ codRemittanceId: 'r-1', reason: '' } as any),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws when the remittance is not in this tenant', async () => {
      remittances.findOne.mockResolvedValueOnce(null);
      await expect(
        service.open({ codRemittanceId: 'r-x', reason: 'X' } as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('creates a dispute when no OPEN one exists', async () => {
      remittances.findOne.mockResolvedValueOnce({ id: 'r-1', tenantId: 7 });
      disputes.findOne.mockResolvedValueOnce(null);
      const d = await service.open({
        codRemittanceId: 'r-1',
        reason: DISPUTE_REASONS.AMOUNT_MISMATCH,
        comments: 'auto',
      });
      expect(d.status).toBe('OPEN');
      expect(d.reason).toBe('AMOUNT_MISMATCH');
      expect(disputes.create).toHaveBeenCalled();
    });

    it('is idempotent on a duplicate (codRemittanceId, status=OPEN)', async () => {
      remittances.findOne.mockResolvedValueOnce({ id: 'r-1', tenantId: 7 });
      const existing = { id: 'd-existing', status: 'OPEN' };
      disputes.findOne.mockResolvedValueOnce(existing);
      const d = await service.open({
        codRemittanceId: 'r-1',
        reason: DISPUTE_REASONS.AMOUNT_MISMATCH,
      });
      expect(d).toBe(existing);
      expect(disputes.create).not.toHaveBeenCalled();
    });
  });

  describe('lifecycle', () => {
    it('startReview moves OPEN -> UNDER_REVIEW', async () => {
      const d = { id: 'd-1', status: 'OPEN' };
      disputes.findOne.mockResolvedValueOnce(d);
      const out = await service.startReview('d-1', 7);
      expect(out.status).toBe('UNDER_REVIEW');
      expect(disputes.save).toHaveBeenCalledWith(d);
    });

    it('startReview refuses RESOLVED -> UNDER_REVIEW', async () => {
      disputes.findOne.mockResolvedValueOnce({ id: 'd-1', status: 'RESOLVED' });
      await expect(service.startReview('d-1', 7)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('resolve sets RESOLVED + resolvedAt + comments', async () => {
      const d = { id: 'd-1', status: 'UNDER_REVIEW' };
      disputes.findOne.mockResolvedValueOnce(d);
      const out = await service.resolve('d-1', 7, 'refund issued');
      expect(out.status).toBe('RESOLVED');
      expect(out.comments).toBe('refund issued');
      expect(out.resolvedAt).toBeInstanceOf(Date);
    });

    it('resolve requires non-empty comments', async () => {
      await expect(service.resolve('d-1', 7, '  ')).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
