import { Resolver, Mutation, Args, Int } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { BulkOperationsService } from './services/bulk-operations.service';
import { GqlAuthGuard } from '../auth/gql-auth.guard';
import { BulkLabelGenerationInput } from './dto/bulk-label-generation.input';
import { BulkPickupInput } from './dto/bulk-pickup.input';
import { BatchOrderProcessingInput } from './dto/batch-order-processing.input';
import { BulkOperationResult, BulkLabelResult } from './bulk-operations.model';

/**
 * Bulk Operations Resolver
 * 
 * GraphQL resolver for bulk operations including:
 * - Bulk label generation
 * - Bulk pickup scheduling
 * - Batch order processing
 * - Bulk manifest generation
 */
@Resolver()
export class BulkOperationsResolver {
  constructor(private readonly bulkOperationsService: BulkOperationsService) {}

  @Mutation(() => BulkLabelResult, { description: 'Generate labels for multiple shipments' })
  @UseGuards(GqlAuthGuard)
  async generateBulkLabels(@Args('input') input: BulkLabelGenerationInput) {
    return this.bulkOperationsService.generateBulkLabels(input);
  }

  @Mutation(() => BulkOperationResult, { description: 'Schedule pickups for multiple shipments' })
  @UseGuards(GqlAuthGuard)
  async scheduleBulkPickups(@Args('input') input: BulkPickupInput) {
    return this.bulkOperationsService.scheduleBulkPickups(input);
  }

  @Mutation(() => BulkOperationResult, { description: 'Process multiple orders in batch' })
  @UseGuards(GqlAuthGuard)
  async processBatchOrders(@Args('input') input: BatchOrderProcessingInput) {
    return this.bulkOperationsService.processBatchOrders(input);
  }

  @Mutation(() => Object, { description: 'Generate manifest for multiple shipments' })
  @UseGuards(GqlAuthGuard)
  async generateBulkManifest(
    @Args('shipmentIds', { type: () => [Int] }) shipmentIds: number[],
  ) {
    return this.bulkOperationsService.generateBulkManifest(shipmentIds);
  }
}
