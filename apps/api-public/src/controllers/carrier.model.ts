/**
 * SS-027a — tsoa DTOs for the Carriers REST surface.
 *
 * Mirrors the live GraphQL surface in `src/carriers/carrier.model.ts`.
 * tsoa reads these annotations to emit OpenAPI 3.0 schema and run
 * request validation. We re-declare a string-enum here (rather than
 * importing the GraphQL `@ObjectType`) so the public schema stays
 * free of any `@nestjs/graphql` decorator metadata.
 */

export interface CarrierResponse {
  id: number;
  name: string;
  apiKey: string;
  createdAt: Date;
  updatedAt: Date;
}

export class CreateCarrierRequestDto {
  // tsoa + class-validator annotations
}

export class UpdateCarrierRequestDto {
  // tsoa + class-validator annotations
}
