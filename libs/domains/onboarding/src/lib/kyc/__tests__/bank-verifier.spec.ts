import { Test } from '@nestjs/testing';
import {
  BankVerifierService,
  SetuSandboxBankVerifier,
  IFSC_REGEX,
  type BankVerifierAdapter,
} from '../bank-verifier.service';

describe('BankVerifierService', () => {
  describe('SetuSandboxBankVerifier', () => {
    let service: SetuSandboxBankVerifier;

    beforeEach(async () => {
      const module = await Test.createTestingModule({
        providers: [SetuSandboxBankVerifier],
      }).compile();

      service = module.get(SetuSandboxBankVerifier);
    });

    it('isReady always returns true for sandbox', () => {
      expect(service.isReady()).toBe(true);
    });

    it('VERIFIES account 1111111111', async () => {
      const r = await service.verify({
        tenantId: 1,
        accountNumber: '1111111111',
        ifsc: 'SBIN0001234',
        accountHolderName: 'John Doe',
      });
      expect(r.status).toBe('VERIFIED');
      expect(r.holderName).toBe('JOHN DOE');
      expect(r.providerRef).toBeDefined();
    });

    it('REJECTS account 9999999999', async () => {
      const r = await service.verify({
        tenantId: 1,
        accountNumber: '9999999999',
        ifsc: 'SBIN0001234',
      });
      expect(r.status).toBe('REJECTED');
      expect(r.reason).toMatch(/Name mismatch/);
    });

    it('returns PENDING for unknown accounts', async () => {
      const r = await service.verify({
        tenantId: 1,
        accountNumber: '123456789012',
        ifsc: 'HDFC0000123',
      });
      expect(r.status).toBe('PENDING');
      expect(r.providerRef).toBeDefined();
    });

    it('rejects invalid IFSC', async () => {
      const r = await service.verify({
        tenantId: 1,
        accountNumber: '1111111111',
        ifsc: 'INVALID',
      });
      expect(r.status).toBe('INVALID');
      expect(r.reason).toMatch(/IFSC/);
    });

    it('rejects non-digit account number', async () => {
      const r = await service.verify({
        tenantId: 1,
        accountNumber: 'ABC123456',
        ifsc: 'HDFC0000123',
      });
      expect(r.status).toBe('INVALID');
      expect(r.reason).toMatch(/Account number/);
    });

    it('normalizes account number spaces', async () => {
      const r = await service.verify({
        tenantId: 1,
        accountNumber: '  1111111111  ',
        ifsc: 'SBIN0001234',
      });
      expect(r.status).toBe('VERIFIED');
    });
  });

  describe('BankVerifierService (wrapper)', () => {
    it('delegates verify to the adapter', async () => {
      const adapter: BankVerifierAdapter = {
        name: 'test-adapter',
        isReady: () => true,
        verify: jest
          .fn()
          .mockResolvedValue({ status: 'VERIFIED', providerRef: 'x' }),
      };
      const svc = new BankVerifierService(adapter);
      const result = await svc.verify({
        tenantId: 2,
        accountNumber: '1111111111',
        ifsc: 'ICIC0001234',
      });
      expect(result.status).toBe('VERIFIED');
      expect(adapter.verify).toHaveBeenCalledTimes(1);
    });
  });

  describe('IFSC_REGEX', () => {
    it('accepts valid IFSCs', () => {
      expect(IFSC_REGEX.test('SBIN0001234')).toBe(true);
      expect(IFSC_REGEX.test('HDFC0000123')).toBe(true);
      expect(IFSC_REGEX.test('KKBK0001234')).toBe(true);
    });

    it('rejects invalid IFSCs', () => {
      expect(IFSC_REGEX.test('INVALID')).toBe(false);
      expect(IFSC_REGEX.test('12340001234')).toBe(false);
    });
  });
});
