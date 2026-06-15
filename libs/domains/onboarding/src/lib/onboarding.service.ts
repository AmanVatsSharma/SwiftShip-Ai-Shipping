/**
 * Onboarding service (TypeORM-backed — SS-043b).
 *
 * Tracks an operator's per-user onboarding state — KYC submitted/approved,
 * pickup address added/verified, carrier connected, e-commerce platform
 * connected, payments configured, test label generated, first pickup
 * scheduled — and computes a `status` + `nextAction` from those flags.
 *
 * Persistence is via `@InjectRepository(OnboardingStateEntity)`. The
 * `OnboardingStatus` enum comes from `@swiftship/platform-typeorm` (the
 * same enum the legacy Prisma re-export used to point at). See
 * MIGRATION.md §7 for the call-site mapping from the old
 * `prisma.onboardingState` shim.
 */
import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OnboardingStateEntity, OnboardingStatus } from '@swiftship/platform-typeorm';
import { UpdateOnboardingInput } from './dto/update-onboarding.input';

@Injectable()
export class OnboardingService {
  private readonly logger = new Logger(OnboardingService.name);

  constructor(
    @InjectRepository(OnboardingStateEntity)
    private readonly states: Repository<OnboardingStateEntity>,
  ) {}

  /**
   * Find or create the onboarding state for a user. Idempotent — calling
   * this for a user that already has a state row returns the existing
   * row.
   */
  async getOrCreateForUser(userId: number): Promise<OnboardingStateEntity> {
    const existing = await this.states.findOne({ where: { userId } });
    if (existing) return existing;
    return this.states.save(
      this.states.create({
        userId,
        status: OnboardingStatus.NOT_STARTED,
        nextAction: 'Submit KYC details',
      }),
    );
  }

  /**
   * Find the onboarding state for a user, throwing 404 if the user has
   * never been onboarded. Use `getOrCreateForUser` if a missing row
   * should be created on demand.
   */
  async getByUser(userId: number): Promise<OnboardingStateEntity> {
    const state = await this.states.findOne({ where: { userId } });
    if (!state) {
      throw new NotFoundException(`OnboardingState for user ${userId} not found`);
    }
    return state;
  }

  /**
   * Derive `status` + `nextAction` + `blockedReason` from the boolean
   * step flags. Pure function — no I/O, no side effects.
   */
  private computeStatus(flags: {
    kycSubmitted?: boolean;
    kycApproved?: boolean;
    pickupAddressAdded?: boolean;
    pickupVerified?: boolean;
    carrierConnected?: boolean;
    ecommerceConnected?: boolean;
    paymentsConfigured?: boolean;
    testLabelGenerated?: boolean;
    firstPickupScheduled?: boolean;
  }): { status: OnboardingStatus; nextAction?: string; blockedReason?: string } {
    if (flags.kycSubmitted && !flags.kycApproved) {
      return { status: OnboardingStatus.BLOCKED, blockedReason: 'KYC pending approval' };
    }
    const steps = [
      { done: !!flags.kycApproved, action: 'Complete KYC' },
      { done: !!flags.pickupAddressAdded, action: 'Add pickup address' },
      { done: !!flags.pickupVerified, action: 'Verify pickup address' },
      { done: !!flags.carrierConnected, action: 'Connect a carrier' },
      { done: !!flags.ecommerceConnected, action: 'Connect an e-commerce platform' },
      { done: !!flags.paymentsConfigured, action: 'Configure payments' },
      { done: !!flags.testLabelGenerated, action: 'Generate a test label' },
      { done: !!flags.firstPickupScheduled, action: 'Schedule first pickup' },
    ];

    const firstIncomplete = steps.find((s) => !s.done);
    if (!firstIncomplete) {
      return { status: OnboardingStatus.COMPLETED };
    }
    const anyStarted = steps.some((s) => s.done);
    return {
      status: anyStarted ? OnboardingStatus.IN_PROGRESS : OnboardingStatus.NOT_STARTED,
      nextAction: firstIncomplete.action,
    };
  }

  /**
   * Apply an update to the user's onboarding state. The input flags
   * override the current row; the `status` / `nextAction` /
   * `blockedReason` columns are recomputed from the merged flag set so
   * the row never drifts out of sync with the steps.
   */
  async updateForUser(
    userId: number,
    input: UpdateOnboardingInput,
  ): Promise<OnboardingStateEntity> {
    const current = await this.getOrCreateForUser(userId);

    let mergedMetadata: Record<string, any> | undefined;
    if (input.metadataJson !== undefined && input.metadataJson !== null) {
      try {
        const parsed = JSON.parse(input.metadataJson);
        if (parsed && typeof parsed === 'object') {
          mergedMetadata = parsed as Record<string, any>;
        }
      } catch {
        // Preserve the previous metadata when the input is malformed
        // JSON. We do not throw here because the rest of the merge
        // should still go through.
        mergedMetadata = current.metadata ?? undefined;
      }
    }

    const flags = {
      kycSubmitted: input.kycSubmitted ?? current.kycSubmitted,
      kycApproved: input.kycApproved ?? current.kycApproved,
      pickupAddressAdded: input.pickupAddressAdded ?? current.pickupAddressAdded,
      pickupVerified: input.pickupVerified ?? current.pickupVerified,
      carrierConnected: input.carrierConnected ?? current.carrierConnected,
      ecommerceConnected: input.ecommerceConnected ?? current.ecommerceConnected,
      paymentsConfigured: input.paymentsConfigured ?? current.paymentsConfigured,
      testLabelGenerated: input.testLabelGenerated ?? current.testLabelGenerated,
      firstPickupScheduled: input.firstPickupScheduled ?? current.firstPickupScheduled,
    };

    const computed = this.computeStatus(flags);

    await this.states.update(
      { userId },
      {
        ...flags,
        status: computed.status,
        nextAction: computed.nextAction,
        blockedReason: computed.blockedReason,
        ...(mergedMetadata !== undefined ? { metadata: mergedMetadata } : {}),
      },
    );

    return (await this.getByUser(userId)) as OnboardingStateEntity;
  }
}
