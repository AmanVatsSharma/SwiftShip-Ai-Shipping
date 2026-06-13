import { InputType, Field, Int } from '@nestjs/graphql';
import { IsEmail, IsNotEmpty, IsOptional, IsString, Length, MaxLength, IsArray, ArrayUnique, IsInt } from 'class-validator';

@InputType()
export class CreateUserInput {
  @Field()
  @IsNotEmpty({ message: 'Email is required' })
  @IsEmail({}, { message: 'Invalid email format' })
  @MaxLength(255, { message: 'Email must be at most 255 characters' })
  email: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString({ message: 'Name must be a string' })
  @Length(2, 100, { message: 'Name must be between 2 and 100 characters' })
  name?: string;

  @Field(() => [Int], { nullable: true })
  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsInt({ each: true })
  roleIds?: number[];
} 