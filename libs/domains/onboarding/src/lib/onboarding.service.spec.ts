import { NotFoundException } from '@nestjs/common';
import { OnboardingStatus } from '@swiftship/platform-typeorm';
import { OnboardingService } from './onboarding.service';

/**
 * SS-043b — OnboardingService unit tests.
 *
 * Mocks the `OnboardingStateEntity` repository and pins the
 * TypeORM-backed behaviour:
 *  - getOrCreateForUser returns the existing row when present
 *  - getOrCreateForUser creates a new NOT_STARTED row when missing
 *  - getByUser throws 404 when missing
 *  - updateForUser merges input flags over current row
 *  - updateForUser recomputes status / nextAction / blockedReason
 *  - updateForUser handles malformed metadataJson gracefully
 */
describe('OnboardingService', () => {
  let service: OnboardingService;
  let states: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    update: jest.Mock;
  };

  const makeState = (overrides: Partial<any> = {}): any => ({
    id: 1,
    userId: 42,
    status: OnboardingStatus.NOT_STARTED,
    kycSubmitted: false,
    kycApproved: false,
    pickupAddressAdded: false,
    pickupVerified: false,
    carrierConnected: false,
    ecommerceConnected: false,
    paymentsConfigured: false,
    testLabelGenerated: false,
    firstPickupScheduled: false,
    nextAction: null,
    blockedReason: null,
    metadata: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  beforeEach(() => {
    states = {
      findOne: jest.fn(),
      create: jest.fn((x) => ({ id: 1, ...x })),
      save: jest.fn(async (x) => x),
      update: jest.fn(async () => ({})),
    };
    service = new OnboardingService(states as any);
  });

  // ----------------------------------------------------------------
  // getOrCreateForUser
  // ----------------------------------------------------------------

  it('getOrCreateForUser returns the existing state when present', async () => {
    const existing = makeState({ id: 7, status: OnboardingStatus.IN_PROGRESS });
    states.findOne.mockResolvedValue(existing);

    const out = await service.getOrCreateForUser(42);

    expect(out).toBe(existing);
    expect(states.save).not.toHaveBeenCalled();
  });

  it('getOrCreateForUser creates a new NOT_STARTED row when missing', async () => {
    states.findOne.mockResolvedValue(null);

    const out = await service.getOrCreateForUser(99);

    expect(states.create).toHaveBeenCalledWith({
      userId: 99,
      status: OnboardingStatus.NOT_STARTED,
      nextAction: 'Submit KYC details',
    });
    expect(states.save).toHaveBeenCalledTimes(1);
    expect(out).toMatchObject({ userId: 99, status: OnboardingStatus.NOT_STARTED });
  });

  // ----------------------------------------------------------------
  // getByUser
  // ----------------------------------------------------------------

  it('getByUser returns the state when present', async () => {
    const s = makeState();
    states.findOne.mockResolvedValue(s);
    const out = await service.getByUser(42);
    expect(out).toBe(s);
  });

  it('getByUser throws 404 when missing', async () => {
    states.findOne.mockResolvedValue(null);
    await expect(service.getByUser(123)).rejects.toThrow(NotFoundException);
  });

  // ----------------------------------------------------------------
  // updateForUser
  // ----------------------------------------------------------------

  it('updateForUser writes the merged flags + computed status', async () => {
    const current = makeState();
    const updated = makeState({
      kycApproved: true,
      status: OnboardingStatus.IN_PROGRESS,
      nextAction: 'Add pickup address',
    });
    states.findOne
      .mockResolvedValueOnce(current) // getOrCreateForUser
      .mockResolvedValueOnce(updated); // getByUser at the end
    states.update.mockResolvedValue({ affected: 1 });

    const out = await service.updateForUser(42, { kycApproved: true } as any);

    expect(states.update).toHaveBeenCalledWith(
      { userId: 42 },
      expect.objectContaining({
        kycApproved: true,
        status: OnboardingStatus.IN_PROGRESS,
        nextAction: 'Add pickup address',
      }),
    );
    expect(out).toBe(updated);
  });

  it('updateForUser marks status BLOCKED when kycSubmitted && !kycApproved', async () => {
    const current = makeState();
    const updated = makeState({
      kycSubmitted: true,
      kycApproved: false,
      status: OnboardingStatus.BLOCKED,
      blockedReason: 'KYC pending approval',
    });
    states.findOne
      .mockResolvedValueOnce(current)
      .mockResolvedValueOnce(updated);
    states.update.mockResolvedValue({ affected: 1 });

    const out = await service.updateForUser(42, { kycSubmitted: true } as any);

    expect(states.update).toHaveBeenCalledWith(
      { userId: 42 },
      expect.objectContaining({
        status: OnboardingStatus.BLOCKED,
        blockedReason: 'KYC pending approval',
      }),
    );
    expect(out.status).toBe(OnboardingStatus.BLOCKED);
  });

  it('updateForUser falls back to current metadata when metadataJson is malformed', async () => {
    const current = makeState({ metadata: { legacy: true } });
    states.findOne
      .mockResolvedValueOnce(current)
      .mockResolvedValueOnce(current);
    states.update.mockResolvedValue({ affected: 1 });

    await service.updateForUser(42, { metadataJson: '{not-json' } as any);

    expect(states.update).toHaveBeenCalledWith(
      { userId: 42 },
      expect.objectContaining({
        metadata: { legacy: true },
      }),
    );
  });

  it('updateForUser parses valid metadataJson into the row', async () => {
    const current = makeState();
    states.findOne
      .mockResolvedValueOnce(current)
      .mockResolvedValueOnce(current);
    states.update.mockResolvedValue({ affected: 1 });

    await service.updateForUser(42, {
      metadataJson: JSON.stringify({ source: 'sso', tier: 'gold' }),
    } as any);

    expect(states.update).toHaveBeenCalledWith(
      { userId: 42 },
      expect.objectContaining({
        metadata: { source: 'sso', tier: 'gold' },
      }),
    );
  });
});
