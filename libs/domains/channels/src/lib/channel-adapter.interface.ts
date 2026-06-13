import {
  ChannelOrder,
  ChannelReturn,
  PullOrdersRequest,
  PushTrackingRequest,
  SyncInventoryRequest,
  PullReturnsRequest,
  ChannelCode,
} from './channel.types';

/**
 * ChannelAdapter interface
 *
 * Defines the contract for all marketplace channel integrations (Amazon,
 * Flipkart, Meesho, Myntra). Each channel must implement pullOrders,
 * pushTracking, syncInventory, and pullReturns against the canonical
 * request shapes in `channel.types.ts`.
 */
export interface ChannelAdapter {
  /** Unique channel code (e.g., 'AMAZON', 'FLIPKART', 'MEESHO', 'MYNTRA'). */
  readonly code: ChannelCode;

  /** Check if the adapter is configured (credentials present). */
  isConfigured(): boolean;

  pullOrders(input: PullOrdersRequest): Promise<ChannelOrder[]>;
  pushTracking(input: PushTrackingRequest): Promise<void>;
  syncInventory(input: SyncInventoryRequest): Promise<void>;
  pullReturns(input: PullReturnsRequest): Promise<ChannelReturn[]>;
}
