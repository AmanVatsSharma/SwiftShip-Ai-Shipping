import { CarrierAdapter, CarrierLabelRequest, CarrierLabelResponse, TrackingResponse } from '../adapter.interface';

/**
 * Sandbox Carrier Adapter
 * 
 * A test adapter that simulates carrier operations without making real API calls.
 * Used for development, testing, and when carrier credentials are not available.
 * 
 * Flow:
 * 1. Label generation returns deterministic label numbers
 * 2. Tracking returns mock tracking events
 * 3. All operations succeed immediately for testing purposes
 */
export class SandboxCarrierAdapter implements CarrierAdapter {
  code = 'SANDBOX';

  /**
   * Generate a shipping label (sandbox mode)
   * 
   * @param req - Label generation request
   * @returns Label response with deterministic label number
   */
  async generateLabel(req: CarrierLabelRequest): Promise<CarrierLabelResponse> {
    // Generate deterministic label number for testing
    const labelNumber = `SANDBOX-${req.shipmentId}-${Date.now()}`;
    
    // Log label generation request for debugging
    console.log('[SandboxCarrierAdapter] generateLabel', {
      shipmentId: req.shipmentId,
      trackingNumber: req.trackingNumber,
      format: req.format,
      hasPickupAddress: !!req.pickupAddress,
      hasDeliveryAddress: !!req.deliveryAddress,
      packageWeight: req.packageDetails?.weight,
    });

    return {
      labelNumber,
      labelUrl: undefined, // No real label URL in sandbox
      format: (req.format as any) ?? 'PDF',
      carrierCode: this.code,
      serviceName: 'Sandbox Ground',
      awbNumber: labelNumber,
      trackingUrl: `https://sandbox.example.com/track/${labelNumber}`,
      estimatedDelivery: req.packageDetails?.weight 
        ? new Date(Date.now() + (req.packageDetails.weight > 1000 ? 5 : 3) * 24 * 60 * 60 * 1000)
        : undefined,
    };
  }

  /**
   * Track a shipment (sandbox mode)
   * 
   * @param trackingNumber - Tracking number to query
   * @returns Mock tracking response with sample events
   */
  async trackShipment(trackingNumber: string): Promise<TrackingResponse> {
    console.log('[SandboxCarrierAdapter] trackShipment', { trackingNumber });

    // Generate mock tracking events based on tracking number hash
    const hash = trackingNumber.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const statusIndex = hash % 4;
    
    const statuses = ['PENDING', 'SHIPPED', 'IN_TRANSIT', 'DELIVERED'];
    const currentStatus = statuses[statusIndex];

    const events = [
      {
        status: 'PENDING',
        description: 'Shipment created',
        location: 'Origin Warehouse',
        occurredAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
        eventCode: 'CREATED',
      },
    ];

    if (statusIndex >= 1) {
      events.push({
        status: 'SHIPPED',
        description: 'Shipment picked up',
        location: 'Origin Warehouse',
        occurredAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
        eventCode: 'PICKED_UP',
      });
    }

    if (statusIndex >= 2) {
      events.push({
        status: 'IN_TRANSIT',
        description: 'In transit to destination',
        location: 'Transit Hub',
        occurredAt: new Date(Date.now() - 12 * 60 * 60 * 1000),
        eventCode: 'IN_TRANSIT',
      });
    }

    if (statusIndex >= 3) {
      events.push({
        status: 'DELIVERED',
        description: 'Delivered to recipient',
        location: 'Destination',
        occurredAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
        eventCode: 'DELIVERED',
      });
    }

    return {
      trackingNumber,
      status: currentStatus,
      description: events[events.length - 1]?.description,
      location: events[events.length - 1]?.location,
      occurredAt: events[events.length - 1]?.occurredAt || new Date(),
      events: events.map(e => ({
        status: e.status,
        description: e.description,
        location: e.location,
        occurredAt: e.occurredAt,
        eventCode: e.eventCode,
      })),
    };
  }

  /**
   * Cancel a shipment (sandbox mode)
   * 
   * @param trackingNumber - Tracking number to cancel
   * @param reason - Optional cancellation reason
   * @returns Always returns true in sandbox mode
   */
  async cancelShipment(trackingNumber: string, reason?: string): Promise<boolean> {
    console.log('[SandboxCarrierAdapter] cancelShipment', { trackingNumber, reason });
    return true;
  }

  /**
   * Void a label (sandbox mode)
   * 
   * @param labelNumber - Label number to void
   * @returns Always returns true in sandbox mode
   */
  async voidLabel(labelNumber: string): Promise<boolean> {
    console.log('[SandboxCarrierAdapter] voidLabel', { labelNumber });
    return true;
  }
}
