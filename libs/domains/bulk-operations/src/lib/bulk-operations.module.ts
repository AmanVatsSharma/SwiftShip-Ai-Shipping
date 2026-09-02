import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { OrderEntity } from '@swiftship/platform-typeorm';
import { AuthLibModule } from '@swiftship/platform-auth';
import { ShipmentsLibModule } from '@swiftship/domains-shipments';
import { PickupsModule } from '@swiftship/domains-pickups';
import { ManifestsModule } from '@swiftship/domains-manifests';
import { BulkOperationsService } from './services/bulk-operations.service';
import { BulkOperationsResolver } from './bulk-operations.resolver';

/**
 * Bulk Operations Module (TypeORM-backed, SS-101 decommission port)
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
  imports: [
    ShipmentsLibModule,
    PickupsModule,
    ManifestsModule,
    AuthLibModule,
    TypeOrmModule.forFeature([OrderEntity]),
  ],
  providers: [BulkOperationsService, BulkOperationsResolver],
  exports: [BulkOperationsService],
})
export class BulkOperationsModule {}
