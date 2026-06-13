import { ObjectType, Field, Int, registerEnumType } from '@nestjs/graphql';
import { OnboardingStatus } from '@prisma/client';

// Register Prisma enum for GraphQL
registerEnumType(OnboardingStatus, { name: 'OnboardingStatus' });

@ObjectType()
export class OnboardingStateModel {
  @Field(() => Int)
  id: number;

  @Field(() => Int)
  userId: number;

  @Field(() => OnboardingStatus)
  status: OnboardingStatus;

  @Field()
  kycSubmitted: boolean;

  @Field()
  kycApproved: boolean;

  @Field()
  pickupAddressAdded: boolean;

  @Field()
  pickupVerified: boolean;

  @Field()
  carrierConnected: boolean;

  @Field()
  ecommerceConnected: boolean;

  @Field()
  paymentsConfigured: boolean;

  @Field()
  testLabelGenerated: boolean;

  @Field()
  firstPickupScheduled: boolean;

  @Field({ nullable: true })
  nextAction?: string | null;

  @Field({ nullable: true })
  blockedReason?: string | null;

  // JSON from DB exposed as string for simplicity
  @Field({ nullable: true })
  metadata?: string | null;

  @Field()
  createdAt: Date;

  @Field()
  updatedAt: Date;
}
