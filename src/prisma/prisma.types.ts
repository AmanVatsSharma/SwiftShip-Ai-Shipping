/**
 * @swiftship/prisma-shim — re-exports the Prisma-shaped enums that legacy
 * services still import from `@prisma/client`. This file's path is mapped to
 * the alias `prisma` in tsconfig.base.json's `paths`. The runtime is the
 * TypeORM entity layer; only the enum types are preserved here for the
 * migration window.
 */
export {
  OrderStatus,
  PaymentStatus,
  ShipmentStatus,
  LabelStatus,
  ReturnStatus,
  NdrStatus,
  NdrAction,
  CodStatus,
  PickupStatus,
  ManifestStatus,
  ShipmentMode,
  PaymentMethod,
  PaymentGateway,
  RefundStatus,
  SubscriptionStatus,
  SubscriptionPlan,
  InvoiceStatus,
  WebhookEventType,
  CarrierStatus,
  WarehouseType,
  NotificationChannel,
  NotificationStatus,
  NotificationType,
  UserRole,
  UserStatus,
  Role,
  OnboardingStep,
  OnboardingStateStatus,
  EwayBillStatus,
  ShopifyOrderStatus,
  WooCommerceOrderStatus,
  TrackingEventStatus,
  RateSurchargeType,
  BillingCycle,
  WebhookEventStatus,
  CodRemittanceStatus,
} from '../../libs/platform/typeorm/src/lib/enums';
