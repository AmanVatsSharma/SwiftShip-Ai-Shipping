import { Field, Int, ObjectType, registerEnumType } from '@nestjs/graphql';

/**
 * SS-019 — RtoDispute lifecycle.
 *
 *   OPEN — auto-created by the RtoSettlementService; awaits merchant / admin
 *          review in the admin portal.
 *   UNDER_REVIEW — admin has picked it up and is investigating.
 *   RESOLVED_CARRIER_FAULT — admin sided with the merchant; the carrier is
 *          at fault. `refundedPaise` records the merchant compensation
 *          (in paise) that the platform booked as a credit.
 *   RESOLVED_MERCHANT_FAULT — admin sided with the carrier; dispute is
 *          closed with no merchant compensation.
 *   REJECTED — admin closed the dispute without a fault finding
 *          (e.g. duplicate, fraud, …).
 */
export enum RtoDisputeStatus {
  OPEN = 'OPEN',
  UNDER_REVIEW = 'UNDER_REVIEW',
  RESOLVED_CARRIER_FAULT = 'RESOLVED_CARRIER_FAULT',
  RESOLVED_MERCHANT_FAULT = 'RESOLVED_MERCHANT_FAULT',
  REJECTED = 'REJECTED',
}

registerEnumType(RtoDisputeStatus, {
  name: 'RtoDisputeStatus',
  description: 'Lifecycle states for an RTO dispute (merchant vs. carrier).',
});

/**
 * GraphQL projection of the `rto_disputes` table. The DB entity lives in
 * `@swiftship/platform-typeorm` (RtoDisputeEntity). This model is the
 * field-level contract for the admin-portal dispute queue.
 */
@ObjectType('RtoDispute', {
  description: 'A merchant dispute over an RTO shipment.',
})
export class RtoDispute {
  @Field(() => Int) id!: number;
  @Field(() => Int) shipmentId!: number;
  @Field(() => Int) orderId!: number;
  @Field(() => Int) tenantId!: number;
  @Field(() => RtoDisputeStatus) status!: RtoDisputeStatus;

  @Field(() => String, { nullable: true }) reasonCode?: string | null;
  @Field(() => String, { nullable: true }) merchantNotes?: string | null;
  @Field(() => String, { nullable: true }) resolution?: string | null;

  @Field(() => Int, { nullable: true })
  resolvedByUserId?: number | null;
  @Field(() => Int, { nullable: true })
  refundedPaise?: number | null;

  @Field(() => String, { nullable: true }) openedAt?: Date | null;
  @Field(() => String, { nullable: true }) resolvedAt?: Date | null;
  @Field() createdAt!: Date;
  @Field() updatedAt!: Date;
}
