/**
 * SS-027 / SS-027a — exports all tsoa controllers.
 *
 * tsoa scans this file when generating routes, so listing all controllers
 * here makes discovery automatic. Controllers should NOT be imported in
 * any other file — the tsoa-generated routes.ts imports them directly.
 */
export { ShipmentsController } from './shipments.controller';
export { OrdersController } from './orders.controller';
export { TrackingController } from './tracking.controller';
export { RateShopController } from './rate-shop.controller';
export { WebhooksController } from './webhooks.controller';
export { CarriersController } from './carriers.controller';
export { ShippingRatesController } from './shipping-rates.controller';
export { ReturnsController } from './returns.controller';
export { TrackingService } from './tracking.service';
