import { Field, Float, Int, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class WarehouseCoverage {
  @Field(() => Int)
  id: number;

  @Field(() => Int)
  warehouseId: number;

  @Field()
  pincode: string;

  @Field({ nullable: true })
  serviceLevel?: string;

  @Field(() => Int, { nullable: true })
  tatDays?: number;

  @Field()
  isOda: boolean;

  @Field(() => Float, { nullable: true })
  odaFee?: number;

  @Field(() => Int, { nullable: true })
  minWeightGrams?: number;

  @Field(() => Int, { nullable: true })
  maxWeightGrams?: number;

  @Field()
  createdAt: Date;

  @Field()
  updatedAt: Date;
}

@ObjectType()
export class Warehouse {
  @Field(() => Int)
  id: number;

  @Field()
  name: string;

  @Field()
  code: string;

  @Field()
  addressLine1: string;

  @Field({ nullable: true })
  addressLine2?: string;

  @Field()
  city: string;

  @Field()
  state: string;

  @Field()
  pincode: string;

  @Field()
  country: string;

  @Field(() => Float, { nullable: true })
  latitude?: number;

  @Field(() => Float, { nullable: true })
  longitude?: number;

  @Field(() => Float, { nullable: true })
  capacityCbm?: number;

  @Field()
  isActive: boolean;

  @Field()
  createdAt: Date;

  @Field()
  updatedAt: Date;

  @Field(() => [WarehouseCoverage])
  coverage?: WarehouseCoverage[];
}
