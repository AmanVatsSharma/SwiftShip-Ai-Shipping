import { Field, Int, ObjectType, registerEnumType } from '@nestjs/graphql';
import { KycDocumentType, KycStatus } from './kyc.entity';

registerEnumType(KycStatus, { name: 'KycStatus' });
registerEnumType(KycDocumentType, { name: 'KycDocumentType' });

@ObjectType()
export class KycDocumentModel {
  @Field(() => Int)
  id!: number;

  @Field(() => KycDocumentType)
  docType!: KycDocumentType;

  @Field()
  s3Key!: string;

  @Field({ nullable: true })
  contentType?: string;

  @Field(() => Int, { nullable: true })
  sizeBytes?: number;

  @Field()
  uploadedAt!: Date;
}

@ObjectType()
export class KycRecordModel {
  @Field(() => Int)
  id!: number;

  @Field(() => Int)
  tenantId!: number;

  @Field({ nullable: true })
  pan!: string;

  @Field({ nullable: true })
  gstin!: string;

  @Field()
  bankAccountLast4!: string;

  @Field()
  ifsc!: string;

  @Field({ nullable: true })
  accountHolderName?: string;

  @Field(() => KycStatus)
  status!: KycStatus;

  @Field({ nullable: true })
  providerRef?: string;

  @Field({ nullable: true })
  rejectionReason?: string;

  @Field(() => [KycDocumentModel], { nullable: true })
  documents?: KycDocumentModel[];

  @Field()
  submittedAt!: Date;

  @Field({ nullable: true })
  verifiedAt?: Date;

  @Field()
  createdAt!: Date;

  @Field()
  updatedAt!: Date;
}
