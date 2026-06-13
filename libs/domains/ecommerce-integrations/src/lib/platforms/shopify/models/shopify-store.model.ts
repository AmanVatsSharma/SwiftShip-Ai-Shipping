import { Field, ObjectType } from '@nestjs/graphql';

@ObjectType({ description: 'Represents a connected Shopify store' })
export class ShopifyStore {
  @Field(() => String, { description: 'Unique identifier for the store connection' })
  id: string;

  @Field(() => String, { description: 'The domain of the Shopify store (e.g., mystore.myshopify.com)' })
  shopDomain: string;

  @Field(() => String, { description: 'OAuth access token for API authentication' })
  accessToken: string;

  @Field(() => Date, { description: 'When the store was connected' })
  connectedAt: Date;

  @Field(() => Date, { description: 'When the store was last updated' })
  updatedAt: Date;
} 