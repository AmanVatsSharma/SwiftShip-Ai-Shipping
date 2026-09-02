import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OrderEntity } from '@swiftship/platform-typeorm';
import {
  ShipmentsService,
  ShipmentStatus,
  CreateShipmentInput,
  CreateLabelInput,
} from '@swiftship/domains-shipments';
import { PickupsService } from '@swiftship/domains-pickups';
import { ManifestsService } from '@swiftship/domains-manifests';
import { BulkLabelGenerationInput } from '../dto/bulk-label-generation.input';
import { BulkPickupInput } from '../dto/bulk-pickup.input';
import { BatchOrderProcessingInput } from '../dto/batch-order-processing.input';
import { BulkOperationResult, BulkLabelResult } from '../bulk-operations.model';

/** Narrow an unknown thrown value to an Error for safe reporting. */
function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

/**
 * Bulk Operations Service (TypeORM-backed, SS-101 decommission port)
 *
 * Handles bulk operations for shipping:
 * - Bulk label generation
 * - Bulk pickup scheduling
 * - Batch order processing
 * - Bulk manifest generation
 *
 * Features:
 * - Parallel processing for performance
 * - Error handling and reporting
 * - Progress tracking
 * - Transaction support
 */
@Injectable()
export class BulkOperationsService {
  private readonly logger = new Logger(BulkOperationsService.name);

  constructor(
    @InjectRepository(OrderEntity)
    private readonly orders: Repository<OrderEntity>,
    private readonly shipmentsService: ShipmentsService,
    private readonly pickupsService: PickupsService,
    private readonly manifestsService: ManifestsService,
  ) {}

  /**
   * Generate labels for multiple shipments
   *
   * Flow:
   * 1. Validate all shipments exist
   * 2. Generate labels in parallel
   * 3. Track successes and failures
   * 4. Return results with URLs
   */
  async generateBulkLabels(
    input: BulkLabelGenerationInput,
  ): Promise<BulkLabelResult> {
    this.logger.log('generateBulkLabels', {
      shipmentCount: input.shipmentIds.length,
      format: input.format,
    });

    if (input.shipmentIds.length === 0) {
      throw new BadRequestException('At least one shipment ID is required');
    }

    if (input.shipmentIds.length > 100) {
      throw new BadRequestException(
        'Maximum 100 shipments allowed per bulk operation',
      );
    }

    const successfulIds: number[] = [];
    const failedIds: number[] = [];
    const errors: string[] = [];
    const labelUrls: string[] = [];

    // Process shipments in batches of 10 for better performance
    const batchSize = 10;
    for (let i = 0; i < input.shipmentIds.length; i += batchSize) {
      const batch = input.shipmentIds.slice(i, i + batchSize);

      // Process batch in parallel
      await Promise.allSettled(
        batch.map(async (shipmentId) => {
          try {
            // Get shipment (validates it exists)
            await this.shipmentsService.getShipment(shipmentId);

            // Generate label via the shipments service label generator
            const labelUrl = await this.generateLabelForShipment(
              shipmentId,
              input.format || 'PDF',
            );

            successfulIds.push(shipmentId);
            labelUrls.push(labelUrl);
          } catch (error) {
            const err = toError(error);
            failedIds.push(shipmentId);
            errors.push(`Shipment ${shipmentId}: ${err.message}`);
            throw error;
          }
        }),
      );

      // Log batch progress
      this.logger.log(`Processed batch ${Math.floor(i / batchSize) + 1}`, {
        successful: successfulIds.length,
        failed: failedIds.length,
      });
    }

    this.logger.log('Bulk label generation completed', {
      total: input.shipmentIds.length,
      successful: successfulIds.length,
      failed: failedIds.length,
    });

    return {
      total: input.shipmentIds.length,
      successful: successfulIds.length,
      failed: failedIds.length,
      successfulIds,
      failedIds,
      errors: errors.length > 0 ? errors : undefined,
      labelUrls: labelUrls.length > 0 ? labelUrls : undefined,
    };
  }

  /**
   * Generate label for a single shipment via the ShipmentsService
   * (SS-101: the legacy shipmentsService.createLabel call became
   * generateLabel, which enqueues the label-generator worker).
   */
  private async generateLabelForShipment(
    shipmentId: number,
    format: string,
  ): Promise<string> {
    const label = await this.shipmentsService.generateLabel({
      shipmentId,
      format,
    } as CreateLabelInput);
    return label.labelUrl ?? '';
  }

  /**
   * Schedule bulk pickups
   *
   * Flow:
   * 1. Validate all shipments exist
   * 2. Schedule pickups in parallel
   * 3. Track successes and failures
   */
  async scheduleBulkPickups(
    input: BulkPickupInput,
  ): Promise<BulkOperationResult> {
    this.logger.log('scheduleBulkPickups', {
      shipmentCount: input.shipmentIds.length,
      scheduledAt: input.scheduledAt,
    });

    if (input.shipmentIds.length === 0) {
      throw new BadRequestException('At least one shipment ID is required');
    }

    if (input.shipmentIds.length > 50) {
      throw new BadRequestException(
        'Maximum 50 shipments allowed per bulk pickup',
      );
    }

    const successfulIds: number[] = [];
    const failedIds: number[] = [];
    const errors: string[] = [];

    // Process shipments in batches
    const batchSize = 10;
    for (let i = 0; i < input.shipmentIds.length; i += batchSize) {
      const batch = input.shipmentIds.slice(i, i + batchSize);

      await Promise.allSettled(
        batch.map(async (shipmentId) => {
          try {
            // Verify shipment exists
            await this.shipmentsService.getShipment(shipmentId);

            // Schedule pickup
            await this.pickupsService.schedulePickup(
              shipmentId,
              input.scheduledAt,
            );

            successfulIds.push(shipmentId);
          } catch (error) {
            const err = toError(error);
            failedIds.push(shipmentId);
            errors.push(`Shipment ${shipmentId}: ${err.message}`);
          }
        }),
      );
    }

    this.logger.log('Bulk pickup scheduling completed', {
      total: input.shipmentIds.length,
      successful: successfulIds.length,
      failed: failedIds.length,
    });

    return {
      total: input.shipmentIds.length,
      successful: successfulIds.length,
      failed: failedIds.length,
      successfulIds,
      failedIds,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  /**
   * Process multiple orders in batch
   *
   * Flow:
   * 1. Validate all orders exist
   * 2. Create shipments for each order
   * 3. Optionally generate labels
   * 4. Track successes and failures
   */
  async processBatchOrders(
    input: BatchOrderProcessingInput,
  ): Promise<BulkOperationResult> {
    this.logger.log('processBatchOrders', {
      orderCount: input.orderIds.length,
      carrierId: input.carrierId,
      autoGenerateLabels: input.autoGenerateLabels,
    });

    if (input.orderIds.length === 0) {
      throw new BadRequestException('At least one order ID is required');
    }

    if (input.orderIds.length > 100) {
      throw new BadRequestException('Maximum 100 orders allowed per batch');
    }

    const successfulIds: number[] = [];
    const failedIds: number[] = [];
    const errors: string[] = [];

    // Process orders sequentially to avoid database conflicts
    for (const orderId of input.orderIds) {
      try {
        // Verify order exists (SS-101: prisma.order.findUnique → repo.findOne)
        const order = await this.orders.findOne({ where: { id: orderId } });

        if (!order) {
          throw new NotFoundException(`Order with ID ${orderId} not found`);
        }

        // Create shipment
        // TODO: This should integrate with actual shipment creation logic
        // For now, we'll simulate it
        await this.shipmentsService.createShipment({
          orderId,
          carrierId: input.carrierId || order.carrierId || 1, // Default carrier
          trackingNumber: `TRK${Date.now()}${orderId}`,
          status: ShipmentStatus.PENDING,
        } as CreateShipmentInput);

        // Optionally generate label
        if (input.autoGenerateLabels) {
          // TODO: Generate label
        }

        successfulIds.push(orderId);
      } catch (error) {
        const err = toError(error);
        failedIds.push(orderId);
        errors.push(`Order ${orderId}: ${err.message}`);
      }
    }

    this.logger.log('Batch order processing completed', {
      total: input.orderIds.length,
      successful: successfulIds.length,
      failed: failedIds.length,
    });

    return {
      total: input.orderIds.length,
      successful: successfulIds.length,
      failed: failedIds.length,
      successfulIds,
      failedIds,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  /**
   * Generate manifest for multiple shipments
   */
  async generateBulkManifest(
    shipmentIds: number[],
  ): Promise<{ manifestId: number; manifestUrl?: string }> {
    this.logger.log('generateBulkManifest', {
      shipmentCount: shipmentIds.length,
    });

    if (shipmentIds.length === 0) {
      throw new BadRequestException('At least one shipment ID is required');
    }

    // Verify all shipments exist
    for (const shipmentId of shipmentIds) {
      await this.shipmentsService.getShipment(shipmentId);
    }

    // Generate manifest
    const manifest = await this.manifestsService.generateManifest(shipmentIds);

    this.logger.log('Bulk manifest generated', {
      manifestId: manifest.id,
      shipmentCount: shipmentIds.length,
    });

    return {
      manifestId: manifest.id,
      manifestUrl: undefined, // Manifests service doesn't return URL yet
    };
  }
}
