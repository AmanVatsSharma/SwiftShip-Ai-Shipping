import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BulkOperationsService } from './services/bulk-operations.service';
import { BulkOperationsResolver } from './bulk-operations.resolver';
import { ShipmentsModule } from '../shipments/shipments.module';
import { PickupsModule } from '../pickups/pickups.module';
import { ManifestsModule } from '../manifests/manifests.module';

/**
 * Bulk Operations Module
 * 
 * Handles bulk operations for shipping:
 * - Bulk label generation
 * - Bulk pickup scheduling
 * - Batch order processing
 * - Bulk manifest generation
 * 
 * Dependencies:
 * - ShipmentsModule: For shipment operations
 * - PickupsModule: For pickup scheduling
 * - ManifestsModule: For manifest generation
 */
@Module({
  imports: [ShipmentsModule, PickupsModule, ManifestsModule],
  providers: [PrismaService, BulkOperationsService, BulkOperationsResolver],
  exports: [BulkOperationsService],
})
export class BulkOperationsModule {}
