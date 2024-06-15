/**
 * Postgres enum types — register as TypeORM enums so synchronize can create
 * the matching enum types in the database. We do not create the column type
 * inline; we reference the enum by name in entities with `type: 'enum'`.
 */

export enum OrderStatus {
  PENDING = 'PENDING',
  PAID = 'PAID',
  CANCELLED = 'CANCELLED',
  REFUNDED = 'REFUNDED',
}

export enum ShipmentStatus {
  PENDING = 'PENDING',
  SHIPPED = 'SHIPPED',
  IN_TRANSIT = 'IN_TRANSIT',
  DELIVERED = 'DELIVERED',
  CANCELLED = 'CANCELLED',
}

export enum LabelStatus {
  PENDING = 'PENDING',
  GENERATED = 'GENERATED',
  FAILED = 'FAILED',
  VOIDED = 'VOIDED',
}

export enum ReturnStatus {
  REQUESTED = 'REQUESTED',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export enum OnboardingStatus {
  NOT_STARTED = 'NOT_STARTED',
  IN_PROGRESS = 'IN_PROGRESS',
  BLOCKED = 'BLOCKED',
  COMPLETED = 'COMPLETED',
}

export enum PaymentStatus {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  SUCCEEDED = 'SUCCEEDED',
  FAILED = 'FAILED',
  REFUNDED = 'REFUNDED',
  PARTIALLY_REFUNDED = 'PARTIALLY_REFUNDED',
  CANCELLED = 'CANCELLED',
}

export enum PaymentGateway {
  STRIPE = 'STRIPE',
  RAZORPAY = 'RAZORPAY',
}

export enum PaymentMethod {
  CARD = 'CARD',
  UPI = 'UPI',
  NETBANKING = 'NETBANKING',
  WALLET = 'WALLET',
  COD = 'COD',
}

export enum PaymentReconciliationStatus {
  NOT_APPLICABLE = 'NOT_APPLICABLE',
  PENDING_REVIEW = 'PENDING_REVIEW',
  MATCHED = 'MATCHED',
  PARTIAL = 'PARTIAL',
  MISMATCH = 'MISMATCH',
}

export enum SubscriptionStatus {
  ACTIVE = 'ACTIVE',
  CANCELLED = 'CANCELLED',
  EXPIRED = 'EXPIRED',
  PAST_DUE = 'PAST_DUE',
  TRIALING = 'TRIALING',
}

export enum SubscriptionPlan {
  FREE = 'FREE',
  STARTER = 'STARTER',
  PROFESSIONAL = 'PROFESSIONAL',
  ENTERPRISE = 'ENTERPRISE',
}

export enum InvoiceStatus {
  DRAFT = 'DRAFT',
  PENDING = 'PENDING',
  PAID = 'PAID',
  OVERDUE = 'OVERDUE',
  CANCELLED = 'CANCELLED',
  REFUNDED = 'REFUNDED',
}

/**
 * NDR (Non-Delivery Report) lifecycle. See `libs/domains/ndr` for the
 * state-machine that governs legal transitions between these states.
 */
export enum NdrCaseStatus {
  PENDING = 'PENDING',
  CALL_ATTEMPTED = 'CALL_ATTEMPTED',
  WHATSAPP_SENT = 'WHATSAPP_SENT',
  EMAIL_SENT = 'EMAIL_SENT',
  RESCHEDULED = 'RESCHEDULED',
  DELIVERED = 'DELIVERED',
  RTO_INITIATED = 'RTO_INITIATED',
  RTO = 'RTO',
  CANCELLED = 'CANCELLED',
}

/**
 * SS-033 — COD remittance status lifecycle.
 *
 * PENDING  — remittance record ingested, not yet matched against bank
 * RECEIVED — matched to a bank transaction, sitting in the queue
 * RECONCILED — accounting team confirmed the match; books are closed
 * DISPUTED — mismatch detected; a CodDisputeEntity was created
 */
export enum CodRemittanceStatus {
  PENDING = 'PENDING',
  RECEIVED = 'RECEIVED',
  RECONCILED = 'RECONCILED',
  DISPUTED = 'DISPUTED',
}

/**
 * SS-033 — COD dispute status lifecycle.
 *
 * OPEN — newly created, awaiting triage
 * UNDER_REVIEW — an agent is investigating
 * RESOLVED — outcome recorded (accepted / rejected)
 */
export enum CodDisputeStatus {
  OPEN = 'OPEN',
  UNDER_REVIEW = 'UNDER_REVIEW',
  RESOLVED = 'RESOLVED',
}
