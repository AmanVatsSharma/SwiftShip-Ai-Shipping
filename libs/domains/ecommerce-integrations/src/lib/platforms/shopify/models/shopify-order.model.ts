import { ObjectType, Field, Float } from '@nestjs/graphql';
import { ShopifyOrderStatus } from '../dto/create-shopify-order.input';

@ObjectType({ description: 'Representation of a Shopify order in the system' })
export class ShopifyOrder {
  @Field(() => String, { description: 'Unique identifier for the order' })
  id: string;

  @Field(() => String, { description: 'The order number from Shopify' })
  orderNumber: string;

  @Field(() => Float, { description: 'The total amount of the order' })
  total: number;

  @Field(() => String, { description: 'Current status of the order' })
  status: string;

  @Field(() => String, { description: 'The ID of the Shopify store this order belongs to' })
  storeId: string;

  @Field(() => Date, { description: 'Timestamp when the order was created in Shopify' })
  shopifyCreatedAt?: Date;

  @Field(() => Date, { description: 'Timestamp when the order was processed in Shopify' })
  processedAt?: Date;

  @Field(() => String, { description: 'The currency used for this order', nullable: true })
  currency?: string;

  @Field(() => String, { description: 'Customer email associated with this order', nullable: true })
  customerEmail?: string;

  @Field(() => String, { description: 'Name of the customer', nullable: true })
  customerName?: string;

  @Field(() => Date, { description: 'When the order was created in our system' })
  createdAt: Date;

  @Field(() => Date, { description: 'When the order was last updated in our system', nullable: true })
  updatedAt?: Date;
} 