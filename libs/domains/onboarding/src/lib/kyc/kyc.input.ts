import { Field, InputType } from '@nestjs/graphql';
import { IsNotEmpty, IsOptional, IsString, Length, Matches } from 'class-validator';
import { PAN_REGEX } from './pan-validator';
import { GSTIN_REGEX } from './gstin-validator';

@InputType()
export class KycDocumentInput {
  @Field({ description: 'PAN | GSTIN | BANK_STATEMENT | CANCELLED_CHEQUE' })
  @IsNotEmpty()
  @IsString()
  docType!: 'PAN' | 'GSTIN' | 'BANK_STATEMENT' | 'CANCELLED_CHEQUE';

  @Field()
  @IsNotEmpty()
  @IsString()
  s3Key!: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  contentType?: string;
}

@InputType()
export class SubmitKycInput {
  @Field({ description: 'PAN — AAAAA9999A' })
  @IsNotEmpty()
  @Matches(PAN_REGEX, { message: 'PAN must match AAAAA9999A' })
  pan!: string;

  @Field({ description: 'GSTIN — 15 characters' })
  @IsNotEmpty()
  @Matches(GSTIN_REGEX, { message: 'GSTIN must be a 15-character alphanumeric' })
  @Length(15, 15, { message: 'GSTIN must be exactly 15 characters' })
  gstin!: string;

  @Field({ description: 'Bank account number (we never store the full number)' })
  @IsNotEmpty()
  @IsString()
  bankAccountNumber!: string;

  @Field({ description: 'IFSC — AAAA0XXXXXX' })
  @IsNotEmpty()
  @IsString()
  ifsc!: string;

  @Field({ nullable: true })
  @IsOptional()
  @IsString()
  accountHolderName?: string;

  @Field(() => [KycDocumentInput], { nullable: true })
  @IsOptional()
  documents?: KycDocumentInput[];
}
