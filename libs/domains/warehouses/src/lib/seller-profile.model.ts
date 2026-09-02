import { Field, Int, ObjectType } from '@nestjs/graphql';

@ObjectType()
export class WarehouseSellerProfile {
  @Field(() => Int)
  id!: number;

  @Field(() => Int)
  warehouseId!: number;

  @Field(() => Int)
  userId!: number;

  @Field(() => String)
  profileName!: string;

  @Field(() => String)
  legalName!: string;

  @Field({ nullable: true })
  displayName?: string;

  @Field()
  gstin!: string;

  @Field({ nullable: true })
  pan?: string;

  @Field({ nullable: true })
  tan?: string;

  @Field({ nullable: true })
  cin?: string;

  @Field()
  addressLine1!: string;

  @Field({ nullable: true })
  addressLine2?: string;

  @Field()
  city!: string;

  @Field()
  state!: string;

  @Field()
  pincode!: string;

  @Field()
  country!: string;

  @Field({ nullable: true })
  email?: string;

  @Field({ nullable: true })
  phone?: string;

  @Field({ nullable: true })
  bankAccountNumber?: string;

  @Field({ nullable: true })
  bankIfsc?: string;

  @Field({ nullable: true })
  bankName?: string;

  @Field({ nullable: true })
  bankBranch?: string;

  @Field({ nullable: true })
  logoUrl?: string;

  @Field({ nullable: true })
  signatureUrl?: string;

  @Field()
  isDefault!: boolean;

  @Field()
  isActive!: boolean;

  @Field()
  createdAt!: Date;

  @Field()
  updatedAt!: Date;
}
