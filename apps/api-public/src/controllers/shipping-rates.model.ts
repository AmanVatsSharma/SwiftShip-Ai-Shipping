/**
 * SS-027a — tsoa DTOs for the ShippingRates REST surface.
 *
 * Mirrors `src/shipping-rates/shipping-rate.model.ts`. tsoa needs
 * plain DTO classes (not GraphQL `@ObjectType`s) so the public
 * OpenAPI schema stays free of `@nestjs/graphql` decorator metadata.
 */
export interface ShippingRateResponse {
  id: number;
  carrierId: number;
  serviceName: string;
  rate: number;
  estimatedDeliveryDays: number;
  createdAt: Date;
  updatedAt: Date;
}
