import { Field, ID, Int, ObjectType } from '@nestjs/graphql';

@ObjectType('Wallet')
export class Wallet {
  @Field(() => ID)
  id!: number;

  @Field(() => ID)
  tenantId!: number;

  /** Paise — funds available for immediate spend. */
  @Field(() => Int)
  availableBalance!: number;

  /** Paise — funds held against in-flight orders/labels. */
  @Field(() => Int)
  reservedBalance!: number;

  /** Paise — cumulative top-up amount, never decreases. */
  @Field(() => Int)
  lifetimeRecharged!: number;

  @Field()
  createdAt!: Date;

  @Field()
  updatedAt!: Date;
}

@ObjectType('WalletLedgerEntry')
export class WalletLedgerEntry {
  @Field(() => ID)
  id!: number;

  @Field(() => ID)
  tenantId!: number;

  @Field(() => ID)
  walletId!: number;

  @Field()
  entryType!: string;

  /** Paise, always positive. Direction is in `entryType`. */
  @Field(() => Int)
  amount!: number;

  @Field()
  reason!: string;

  @Field(() => String, { nullable: true })
  idempotencyKey?: string | null;

  @Field(() => String, { nullable: true })
  metadata?: Record<string, unknown> | null;

  @Field()
  createdAt!: Date;
}
