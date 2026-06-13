import { InputType, Field } from '@nestjs/graphql';
import { IsNotEmpty, IsString, IsUrl, Matches } from 'class-validator';

@InputType()
export class ConnectStoreInput {
  @Field(() => String, { description: 'The domain of the Shopify store (e.g., mystore.myshopify.com)' })
  @IsNotEmpty({ message: 'Shop domain cannot be empty' })
  @IsString({ message: 'Shop domain must be a string' })
  @Matches(/^[a-zA-Z0-9][-a-zA-Z0-9]+\.myshopify\.com$/, { 
    message: 'Shop domain must be a valid myshopify.com domain'
  })
  shopDomain: string;

  @Field(() => String, { description: 'The access token for API authentication' })
  @IsNotEmpty({ message: 'Access token cannot be empty' })
  @IsString({ message: 'Access token must be a string' })
  accessToken: string;
} 