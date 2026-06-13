import { InputType, Field } from '@nestjs/graphql';
import { MaxLength, IsNotEmpty, IsOptional } from 'class-validator';

@InputType()
export class CreateRoleInput {
  @Field()
  @IsNotEmpty({ message: 'Role name is required' })
  @MaxLength(50, { message: 'Role name must be at most 50 characters' })
  name: string;

  @Field({ nullable: true })
  @IsOptional()
  @MaxLength(255, { message: 'Description must be at most 255 characters' })
  description?: string;
} 