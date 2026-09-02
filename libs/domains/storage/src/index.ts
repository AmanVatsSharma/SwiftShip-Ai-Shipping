// Barrel for the storage lib — TypeORM/S3-backed (local code).
// SS-decommission (2026-08): flipped from the legacy src/storage re-exports
// to the local lib implementation.

export { StorageModule, StorageModule as StorageLibModule } from './lib/storage.module';
export { StorageService, StorageService as StorageLibService } from './lib/storage.service';
