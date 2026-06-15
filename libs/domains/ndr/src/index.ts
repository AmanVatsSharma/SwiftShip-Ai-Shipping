// Re-export barrel for the NDR (Non-Delivery Report) lib.
// Consumers should import from `@swiftship/domains-ndr` rather than
// the relative `../ndr` paths.

export { NdrModule, NdrModule as NdrLibModule } from './lib/ndr.module';
export { NdrService, NdrService as NdrLibService } from './lib/ndr.service';
export { NdrResolver, NdrResolver as NdrLibResolver } from './lib/ndr.resolver';
export { NdrStateMachine } from './lib/ndr-state-machine.service';
export {
  TrackingIngestionProcessor,
  TrackingIngestionJobData,
  type TrackingToNdrAction,
} from './lib/tracking-ingestion.processor';
export { NdrCase, NdrCaseList } from './lib/ndr.model';
// SS-018 — outbound customer-contact (WhatsApp + Exotel IVR)
export {
  NdrContactService,
  type CustomerIntent,
  type ContactChannel,
  type ContactResult,
} from './lib/ndr-contact.service';
export { NdrVoiceWebhookController } from './lib/ndr-voice-webhook.controller';
export {
  RtoSettlementService,
  type RefundServiceLike,
  type NotifierLike,
} from './lib/rto-settlement.service';
export {
  RtoDisputeResolver,
  RtoDisputeResolver as RtoDisputeLibResolver,
} from './lib/rto-dispute.resolver';
export { RtoDispute, RtoDisputeStatus } from './lib/rto-dispute.model';

// SS-038 — analytics sub-module (NDR reason / pincode / courier / time-of-day)
export {
  NdrAnalyticsModule,
  NdrAnalyticsService,
  NdrAnalyticsResolver,
  DateRangeInput,
  NdrAnalyticsFilter,
  NdrReasonBreakdown,
  NdrPincodeBreakdown,
  NdrCourierBreakdown,
  NdrTimeOfDayBucket,
} from './lib/analytics';
