import { Field, ID, InputType, Int } from '@nestjs/graphql';

@InputType()
export class TopUpWalletInput {
  @Field(() => ID)
  tenantId!: number;

  /** Paise. Must be > 0. */
  @Field(() => Int)
  amount!: number;

  /** Caller-supplied unique key — usually the payment-gateway txn id. */
  @Field()
  idempotencyKey!: string;

  /** Optional free-form context: { paymentId, gateway, invoiceUrl }. */
  @Field(() => String, { nullable: true })
  metadata?: Record<string, unknown>;
}

@InputType()
export class LockFundsInput {
  @Field(() => ID)
  tenantId!: number;

  /** Paise. Must be > 0 and ≤ wallet.availableBalance. */
  @Field(() => Int)
  amount!: number;

  @Field()
  reason!: string;

  /** E.g. "lock:shipment:<id>" — same key on lock + release is a no-op. */
  @Field(() => String, { nullable: true })
  idempotencyKey!: string;

  @Field(() => String, { nullable: true })
  metadata?: Record<string, unknown>;
}

@InputType()
export class ReleaseFundsInput {
  @Field(() => ID)
  tenantId!: number;

  @Field(() => Int)
  amount!: number;

  @Field()
  reason!: string;

  /**
   * Must match the original lock's idempotencyKey, otherwise the call
   * is rejected. This prevents releasing funds that were never locked
   * by the caller.
   */
  @Field(() => String, { nullable: true })
  idempotencyKey!: string;

  @Field(() => String, { nullable: true })
  metadata?: Record<string, unknown>;
}

@InputType()
export class TransferWalletsInput {
  @Field(() => ID)
  fromTenantId!: number;

  @Field(() => ID)
  toTenantId!: number;

  @Field(() => Int)
  amount!: number;

  @Field()
  reason!: string;

  @Field(() => String, { nullable: true })
  idempotencyKey!: string;

  @Field(() => String, { nullable: true })
  metadata?: Record<string, unknown>;
}

@InputType()
export class WalletStatementFilterInput {
  @Field(() => ID)
  tenantId!: number;

  /** Optional inclusive lower bound. */
  @Field({ nullable: true })
  fromDate?: Date;

  /** Optional inclusive upper bound. */
  @Field({ nullable: true })
  toDate?: Date;

  /** Filter by entryType: CREDIT | DEBIT | LOCK | RELEASE. */
  @Field({ nullable: true })
  entryType?: string;

  /** Filter by reason (exact match), e.g. COURIER_LABEL. */
  @Field({ nullable: true })
  reason?: string;

  @Field(() => Int, { nullable: true, defaultValue: 100 })
  limit?: number;

  @Field(() => Int, { nullable: true, defaultValue: 0 })
  offset?: number;
}
