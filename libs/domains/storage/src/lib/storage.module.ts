import { Global, Module } from '@nestjs/common';
import { StorageService } from './storage.service';

/**
 * Storage Module
 *
 * Provides a unified abstraction for binary/object storage with support
 * for AWS S3 compatible backends as well as a local stub fallback that
 * persists files to disk for lower environments.
 */
@Global()
@Module({
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
