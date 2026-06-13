import { Field, InputType } from '@nestjs/graphql';

@InputType()
export class UpdateOnboardingInput {
  @Field({ nullable: true })
  kycSubmitted?: boolean;

  @Field({ nullable: true })
  kycApproved?: boolean;

  @Field({ nullable: true })
  pickupAddressAdded?: boolean;

  @Field({ nullable: true })
  pickupVerified?: boolean;

  @Field({ nullable: true })
  carrierConnected?: boolean;

  @Field({ nullable: true })
  ecommerceConnected?: boolean;

  @Field({ nullable: true })
  paymentsConfigured?: boolean;

  @Field({ nullable: true })
  testLabelGenerated?: boolean;

  @Field({ nullable: true })
  firstPickupScheduled?: boolean;

  @Field({ nullable: true })
  nextAction?: string;

  @Field({ nullable: true })
  blockedReason?: string;

  @Field({ nullable: true, description: 'Serialized JSON string to merge into metadata' })
  metadataJson?: string;
}
