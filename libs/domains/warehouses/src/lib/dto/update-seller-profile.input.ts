import { InputType, Field, Int, PartialType } from '@nestjs/graphql';
import { CreateWarehouseSellerProfileInput } from './create-seller-profile.input';
import { IsInt } from 'class-validator';

@InputType()
export class UpdateWarehouseSellerProfileInput extends PartialType(
  CreateWarehouseSellerProfileInput,
) {
  @Field(() => Int)
  @IsInt()
  id: number;
}
