import { Module } from '@nestjs/common';
import { AmazonAdapter } from './adapters/amazon.adapter';
import { FlipkartAdapter } from './adapters/flipkart.adapter';
import { MeeshoAdapter } from './adapters/meesho.adapter';
import { MyntraAdapter } from './adapters/myntra.adapter';
import { FlipkartAuthService } from './flipkart-auth.service';
import { MeeshoAuthService } from './meesho-auth.service';
import { MyntraAuthService } from './myntra-auth.service';

/**
 * ChannelsModule
 *
 * Provides marketplace channel integrations (Amazon, Flipkart, Meesho, Myntra).
 * Each adapter implements the ChannelAdapter interface and handles order pulls,
 * tracking push, inventory sync, and returns reconciliation.
 */
@Module({
  providers: [
    AmazonAdapter,
    FlipkartAdapter,
    FlipkartAuthService,
    MeeshoAdapter,
    MeeshoAuthService,
    MyntraAdapter,
    MyntraAuthService,
  ],
  exports: [
    AmazonAdapter,
    FlipkartAdapter,
    FlipkartAuthService,
    MeeshoAdapter,
    MeeshoAuthService,
    MyntraAdapter,
    MyntraAuthService,
  ],
})
export class ChannelsModule {}
