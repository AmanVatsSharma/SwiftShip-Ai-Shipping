// Re-export barrel for the Bulk Operations lib.
// SS-101: points at the local TypeORM-backed implementation only — the legacy
// root `src/bulk-operations` re-exports are gone (see STATUS.md §3).

export {
  BulkOperationsModule,
  BulkOperationsModule as BulkOperationsLibModule,
} from './lib/bulk-operations.module';
export {
  BulkOperationsResolver,
  BulkOperationsResolver as BulkOperationsLibResolver,
} from './lib/bulk-operations.resolver';
export { BulkOperationsService } from './lib/services/bulk-operations.service';
export {
  BulkOperationResult,
  BulkLabelResult,
} from './lib/bulk-operations.model';
