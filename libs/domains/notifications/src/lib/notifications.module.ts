import { Module } from '@nestjs/common';
import { WatiService } from './wati/wati.service';
import { ExotelService } from './exotel/exotel.service';

/**
 * NotificationsModule — outbound customer-communication channels.
 *
 * Currently exposes:
 *  - WatiService  — WhatsApp Business templated messages (WATI)
 *  - ExotelService — Voice IVR calls (Exotel)
 *
 * Inbound events (delivery receipts, button clicks) are received via
 * the controllers in the consuming domain lib (e.g. NDR), since the
 * webhook URL is per-route and the body schema differs per channel.
 */
@Module({
  providers: [WatiService, ExotelService],
  exports: [WatiService, ExotelService],
})
export class NotificationsModule {}
