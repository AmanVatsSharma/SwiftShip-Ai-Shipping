import {
  ObjectType,
  Field,
  Int,
  Float,
  registerEnumType,
} from '@nestjs/graphql';
import { OrderStatus, PaymentStatus } from '@swiftship/platform-typeorm';
import { Warehouse } from '@swiftship/domains-warehouses';

// OrderStatus enum (re-exported from the platform-typeorm lib so we own the
// canonical enum definition; see MIGRATION.md for the history of the move
// off the legacy prisma-client shim).
registerEnumType(OrderStatus, {
  name: 'OrderStatus',
});

@ObjectType()
export class Order {
  @Field(() => Int)
  id!: number;

  @Field()
  orderNumber!: string;

  @Field(() => Float)
  total!: number;

  @Field(() => OrderStatus)
  status!: OrderStatus;

  @Field(() => String)
  paymentStatus!: PaymentStatus;

  @Field()
  createdAt!: Date;

  @Field()
  updatedAt!: Date;

  @Field(() => Int)
  userId!: number;

  @Field(() => Int, { nullable: true })
  carrierId!: number | null;

  @Field(() => Int, { nullable: true })
  warehouseId?: number | null;

  @Field(() => Warehouse, { nullable: true })
  warehouse?: Warehouse | null;

  @Field(() => String, { nullable: true })
  destinationName?: string | null;

  @Field(() => String, { nullable: true })
  destinationPhone?: string | null;

  @Field(() => String, { nullable: true })
  destinationAddressLine1?: string | null;

  @Field(() => String, { nullable: true })
  destinationAddressLine2?: string | null;

  @Field(() => String, { nullable: true })
  destinationCity?: string | null;

  @Field(() => String, { nullable: true })
  destinationState?: string | null;

  @Field(() => String, { nullable: true })
  destinationPincode?: string | null;

  @Field(() => String, { nullable: true })
  destinationCountry?: string | null;

  @Field(() => Int, { nullable: true })
  packageWeightGrams?: number | null;

  @Field(() => Float, { nullable: true })
  packageLengthCm?: number | null;

  @Field(() => Float, { nullable: true })
  packageWidthCm?: number | null;

  @Field(() => Float, { nullable: true })
  packageHeightCm?: number | null;
}

export { OrderStatus, PaymentStatus };
