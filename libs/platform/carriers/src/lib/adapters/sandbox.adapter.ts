import { CarrierAdapter, CarrierLabelRequest, CarrierLabelResponse, TrackingResponse, RateQuoteRequest, RateQuote, ServiceabilityRequest, ServiceabilityResult, SchedulePickupRequest, ScheduledPickup, CancelPickupRequest, MarkCodRequest, NdrActionOption } from '../adapter.interface';

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

  /**
   * Get shipping rates (sandbox mode)
   *
   * @param req - Rate quote request
   * @returns Single deterministic quote based on weight + pincode parity
   */
  async getRates(req: RateQuoteRequest): Promise<RateQuote[]> {
    console.log('[SandboxCarrierAdapter] getRates', req);

    // Return a single deterministic quote based on weight + pincode parity
    const baseRate = 50 + Math.ceil(req.weightGrams / 100) * 10; // paise
    return [{
      carrier: 'Sandbox Carrier',
      carrierCode: this.code,
      serviceType: 'STANDARD',
      rate: baseRate,
      currency: 'INR',
      estimatedDays: { min: 2, max: 4 },
      codAvailable: req.paymentMethod === 'COD',
      pickupAvailable: true,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      metadata: { sandbox: true },
    }];
  }

  /**
   * Check serviceability (sandbox mode)
   *
   * @param input - Serviceability request
   * @returns Serviceability result based on pincode validation
   */
  async getServiceability(input: ServiceabilityRequest): Promise<ServiceabilityResult> {
    console.log('[SandboxCarrierAdapter] getServiceability', input);

    // Serviceable if both pincodes are 6-digit numbers
    const valid = /^\d{6}$/.test(input.originPincode) && /^\d{6}$/.test(input.destinationPincode);
    return {
      serviceable: valid,
      codAvailable: valid,
      prepaidAvailable: valid,
      estimatedDays: { min: 2, max: 4 },
      reason: valid ? undefined : 'INVALID_PINCODE',
    };
  }

  /**
   * Schedule a pickup (sandbox mode)
   *
   * @param input - Pickup schedule request
   * @returns Scheduled pickup response
   */
  async schedulePickup(input: SchedulePickupRequest): Promise<ScheduledPickup> {
    console.log('[SandboxCarrierAdapter] schedulePickup', input);

    return {
      pickupId: `SANDBOX-${Date.now()}`,
      pickupDate: input.pickupDate,
      pickupTimeSlot: input.pickupTimeSlot,
      trackingUrl: `https://sandbox.swiftship.in/pickups/${Date.now()}`,
    };
  }

  /**
   * Cancel a pickup (sandbox mode)
   *
   * @param input - Pickup cancellation request
   * @returns void (no-op in sandbox)
   */
  async cancelPickup(input: CancelPickupRequest): Promise<void> {
    console.log('[SandboxCarrierAdapter] cancelPickup', input);
    // Sandbox: no-op
  }

  /**
   * Mark COD as collected (sandbox mode)
   *
   * @param input - COD collection request
   * @returns void (no-op in sandbox)
   */
  async markCodCollected(input: MarkCodRequest): Promise<void> {
    console.log('[SandboxCarrierAdapter] markCodCollected', input);
    // Sandbox: no-op
  }

  /**
   * Get NDR action options (sandbox mode)
   *
   * @param shipmentId - Shipment ID
   * @returns List of available NDR actions
   */
  async getNdrActions(shipmentId: string): Promise<NdrActionOption[]> {
    console.log('[SandboxCarrierAdapter] getNdrActions', { shipmentId });

    return [
      {
        code: 'REATTEMPT' as const,
        label: 'Reattempt delivery',
        requiresCustomerInput: false,
        description: 'Try delivering again'
      },
      {
        code: 'CHANGE_ADDRESS' as const,
        label: 'Update address',
        requiresCustomerInput: true,
        description: 'Customer needs to confirm new address'
      },
      {
        code: 'CANCEL' as const,
        label: 'Cancel and RTO',
        requiresCustomerInput: false,
        description: 'Return to origin'
      },
      {
        code: 'OPEN_DISPUTE' as const,
        label: 'Open a dispute',
        requiresCustomerInput: true,
        description: 'Escalate to carrier support'
      },
    ];
  }
}
