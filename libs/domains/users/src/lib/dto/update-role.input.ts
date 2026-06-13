import { InputType, Field, Int } from '@nestjs/graphql';
import { MaxLength, IsNotEmpty, IsOptional } from 'class-validator';

@InputType()
export class UpdateRoleInput {
  @Field(() => Int)
  @IsNotEmpty({ message: 'Role ID is required' })
  id: number;

  @Field({ nullable: true })
  @IsOptional()
  @MaxLength(50, { message: 'Role name must be at most 50 characters' })
  name?: string;

  @Field({ nullable: true })
  @IsOptional()
  @MaxLength(255, { message: 'Description must be at most 255 characters' })
  description?: string;
} 