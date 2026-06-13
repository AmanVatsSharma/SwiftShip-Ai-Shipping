import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { OnboardingStatus, Prisma } from '@prisma/client';
import { UpdateOnboardingInput } from './dto/update-onboarding.input';

@Injectable()
export class OnboardingService {
  constructor(private readonly prisma: PrismaService) {}

  async getOrCreateForUser(userId: number) {
    const existing = await this.prisma.onboardingState.findUnique({ where: { userId } });
    if (existing) return existing;
    return this.prisma.onboardingState.create({
      data: {
        userId,
        status: OnboardingStatus.NOT_STARTED,
        nextAction: 'Submit KYC details',
      },
    });
  }

  async getByUser(userId: number) {
    const state = await this.prisma.onboardingState.findUnique({ where: { userId } });
    if (!state) throw new NotFoundException(`OnboardingState for user ${userId} not found`);
    return state;
  }

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

  async updateForUser(userId: number, input: UpdateOnboardingInput) {
    const current = await this.getOrCreateForUser(userId);
    const mergedMetadata: Prisma.InputJsonValue | undefined = input.metadataJson
      ? (() => {
          try {
            return JSON.parse(input.metadataJson);
          } catch {
            return current.metadata as Prisma.InputJsonValue;
          }
        })()
      : undefined;

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

    return this.prisma.onboardingState.update({
      where: { userId },
      data: {
        ...flags,
        status: computed.status,
        nextAction: computed.nextAction,
        blockedReason: computed.blockedReason,
        ...(mergedMetadata !== undefined ? { metadata: mergedMetadata } : {}),
      },
    });
  }
}
