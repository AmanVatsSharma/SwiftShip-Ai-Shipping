// Test-only runtime stub for @swiftship/platform-typeorm. The real barrel
// transitively pulls in datasource.ts (TS2322 strict-mode error) and the
// entities have circular `@OneToOne(() => OnboardingStateEntity)` self-
// references that crash at module-load time. Tests get the real enums
// (which have no transitive dependencies) and lightweight class shapes
// for the entities.

import { NdrCaseStatus as RealNdrCaseStatus } from '../../libs/platform/typeorm/src/lib/enums';

export {
  NdrCaseStatus,
  ShipmentStatus,
} from '../../libs/platform/typeorm/src/lib/enums';

// Loose class shapes — tests treat these as plain objects, so we keep
// the stub minimal and avoid the @Entity decorator chain. Field
// signatures mirror the real entities (definite assignment, required
// vs optional) so the typecheck passes when the contact service
// passes the stub entity to the state machine.
export class ShipmentEntity {
  id!: number;
  trackingNumber!: string;
  status!: string;
  customerPhone?: string | null;
  orderId!: number;
  tenantId!: number;
}
export class NdrCaseEntity {
  id?: number;
  status!: RealNdrCaseStatus;
  attemptCount!: number;
  customerPhone?: string | null;
  customerName?: string | null;
  awbNumber?: string | null;
  shipmentId?: number;
  tenantId?: number;
  metadata?: Record<string, any> | null;
  resolvedAt?: Date | null;
  lastAttemptAt?: Date | null;
}
export class TrackingEventEntity {}
