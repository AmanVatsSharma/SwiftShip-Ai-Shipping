import {
  CarrierAdapter,
  CarrierLabelRequest,
  CarrierLabelResponse,
  TrackingResponse,
  RateQuoteRequest,
  RateQuote,
  ServiceabilityRequest,
  ServiceabilityResult,
  SchedulePickupRequest,
  ScheduledPickup,
  CancelPickupRequest,
  MarkCodRequest,
  NdrActionOption,
} from '../adapter.interface';
import axios, { AxiosError } from 'axios';

/**
 * Shadowfax Carrier Adapter
 * 
 * Implements integration with Shadowfax API.
 * Shadowfax is a leading hyperlocal and e-commerce logistics provider in India.
 * 
 * API Documentation: https://www.shadowfax.in/api-docs
 */
export class ShadowfaxAdapter implements CarrierAdapter {
  code = 'SHADOWFAX';
  private readonly apiKey: string;
  private readonly secretKey: string;
  private readonly baseUrl: string;
  private readonly maxRetries: number = 3;
  private readonly retryDelay: number = 1000;

  constructor(apiKey: string, secretKey: string, baseUrl: string = 'https://www.shadowfax.in') {
    if (!apiKey || !secretKey) {
      throw new Error('Shadowfax API key and secret key are required');
    }
    this.apiKey = apiKey;
    this.secretKey = secretKey;
    this.baseUrl = baseUrl;
    console.log('[ShadowfaxAdapter] Initialized', { baseUrl, hasApiKey: !!apiKey, hasSecretKey: !!secretKey });
  }

  async generateLabel(req: CarrierLabelRequest): Promise<CarrierLabelResponse> {
    console.log('[ShadowfaxAdapter] generateLabel request', {
      shipmentId: req.shipmentId,
      trackingNumber: req.trackingNumber,
      format: req.format,
      hasDeliveryAddress: !!req.deliveryAddress,
      packageWeight: req.packageDetails?.weight,
    });

    if (!req.deliveryAddress) {
      throw new Error('Delivery address is required for Shadowfax label generation');
    }

    if (!req.packageDetails?.weight) {
      throw new Error('Package weight is required for Shadowfax label generation');
    }

    try {
      const payload = this.buildLabelPayload(req);
      const response = await this.makeRequestWithRetry('POST', '/api/v1/shipment/create', payload);
      const labelData = this.parseLabelResponse(response.data, req);

      console.log('[ShadowfaxAdapter] generateLabel success', {
        shipmentId: req.shipmentId,
        labelNumber: labelData.labelNumber,
        awbNumber: labelData.awbNumber,
      });

      return labelData;
    } catch (error) {
      console.error('[ShadowfaxAdapter] generateLabel failed', {
        shipmentId: req.shipmentId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return this.generateFallbackLabel(req);
    }
  }

  async trackShipment(trackingNumber: string): Promise<TrackingResponse> {
    console.log('[ShadowfaxAdapter] trackShipment request', { trackingNumber });

    if (!trackingNumber) {
      throw new Error('Tracking number is required');
    }

    try {
      const response = await this.makeRequestWithRetry(
        'GET',
        `/api/v1/tracking/${encodeURIComponent(trackingNumber)}`
      );
      const trackingData = this.parseTrackingResponse(response.data, trackingNumber);

      console.log('[ShadowfaxAdapter] trackShipment success', {
        trackingNumber,
        status: trackingData.status,
        eventCount: trackingData.events.length,
      });

      return trackingData;
    } catch (error) {
      console.error('[ShadowfaxAdapter] trackShipment failed', {
        trackingNumber,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return {
        trackingNumber,
        status: 'UNKNOWN',
        description: 'Unable to fetch tracking information',
        occurredAt: new Date(),
        events: [],
      };
    }
  }

  async cancelShipment(trackingNumber: string, reason?: string): Promise<boolean> {
    console.log('[ShadowfaxAdapter] cancelShipment request', { trackingNumber, reason });

    try {
      const payload = {
        waybill: trackingNumber,
        cancellation_reason: reason || 'Cancelled by customer',
      };

      await this.makeRequestWithRetry('POST', '/api/v1/shipment/cancel', payload);
      console.log('[ShadowfaxAdapter] cancelShipment success', { trackingNumber });
      return true;
    } catch (error) {
      console.error('[ShadowfaxAdapter] cancelShipment failed', {
        trackingNumber,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return false;
    }
  }

  async voidLabel(labelNumber: string): Promise<boolean> {
    console.log('[ShadowfaxAdapter] voidLabel request', { labelNumber });

    try {
      await this.makeRequestWithRetry('POST', `/api/v1/label/${encodeURIComponent(labelNumber)}/void`);
      console.log('[ShadowfaxAdapter] voidLabel success', { labelNumber });
      return true;
    } catch (error) {
      console.error('[ShadowfaxAdapter] voidLabel failed', {
        labelNumber,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return false;
    }
  }

  // ---------- P2-W5: rate shopping, serviceability, pickup, COD, NDR ----------

  /**
   * Get shipping rates for a Shadowfax route.
   *
   * Calls POST /v3/order/charges on the Shadowfax API. Shadowfax is
   * hyperlocal-friendly: when the route qualifies, an isHyperlocal
   * flag is included in the quote metadata so downstream code can
   * surface same-day / next-day options.
   *
   * Falls back to a static rate card (with the hyperlocal flag
   * computed heuristically from pincode proximity) on any failure.
   */
  async getRates(req: RateQuoteRequest): Promise<RateQuote[]> {
    console.log('[ShadowfaxAdapter] getRates request', req);

    try {
      const payload = {
        origin: req.originPincode,
        destination: req.destinationPincode,
        weight: (req.weightGrams / 1000).toFixed(2),
        payment_mode: req.paymentMethod, // 'PREPAID' | 'COD'
        ...(req.declaredValue !== undefined && { declared_value: req.declaredValue }),
        ...(req.length !== undefined && { length: req.length }),
        ...(req.width !== undefined && { width: req.width }),
        ...(req.height !== undefined && { height: req.height }),
      };

      const response = await this.makeRequestWithRetry('POST', '/v3/order/charges', payload);
      const data = response.data || {};
      const isHyperlocal = Boolean(data.is_hyperlocal ?? data.hyperlocal ?? false);

      const baseRate = Number(data.charge ?? data.rate ?? data.amount ?? 0);
      const etaMin = Number(data.estimated_days?.min ?? data.eta_min ?? 1);
      const etaMax = Number(data.estimated_days?.max ?? data.eta_max ?? 2);

      const quote: RateQuote = {
        carrier: 'Shadowfax',
        carrierCode: 'shadowfax',
        serviceType: isHyperlocal ? 'SAME_DAY' : 'STANDARD',
        rate: baseRate > 0 ? baseRate : this.fallbackRate(req, isHyperlocal),
        currency: 'INR',
        estimatedDays: { min: etaMin, max: etaMax },
        codAvailable: req.paymentMethod === 'COD',
        pickupAvailable: true,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        rawResponse: { isHyperlocal, source: 'shadowfax', data },
      };

      console.log('[ShadowfaxAdapter] getRates success', {
        rate: quote.rate,
        isHyperlocal,
      });

      return [quote];
    } catch (error) {
      console.error('[ShadowfaxAdapter] getRates failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      // Fall back to a static rate card.
      const isHyperlocal = this.guessHyperlocal(req.originPincode, req.destinationPincode);
      return [
        {
          carrier: 'Shadowfax',
          carrierCode: 'shadowfax',
          serviceType: isHyperlocal ? 'SAME_DAY' : 'STANDARD',
          rate: this.fallbackRate(req, isHyperlocal),
          currency: 'INR',
          estimatedDays: isHyperlocal ? { min: 0, max: 1 } : { min: 1, max: 2 },
          codAvailable: req.paymentMethod === 'COD',
          pickupAvailable: true,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          rawResponse: { isHyperlocal, source: 'shadowfax-fallback' },
        },
      ];
    }
  }

  /**
   * Check serviceability for a Shadowfax route.
   *
   * Calls POST /v3/service_check. The result includes an
   * `isHyperlocal` field so callers can decide whether to surface
   * same-day options. Falls back to a pincode-validity heuristic
   * on any API failure.
   */
  async getServiceability(input: ServiceabilityRequest): Promise<ServiceabilityResult> {
    console.log('[ShadowfaxAdapter] getServiceability request', input);

    try {
      const payload = {
        origin: input.originPincode,
        destination: input.destinationPincode,
        weight: (input.weightGrams / 1000).toFixed(2),
        payment_mode: input.paymentMethod,
      };

      const response = await this.makeRequestWithRetry('POST', '/v3/service_check', payload);
      const data = response.data || {};
      const serviceable = Boolean(data.serviceable ?? data.is_serviceable ?? true);
      const codAvailable = Boolean(data.cod_available ?? data.codAvailable ?? true);
      const isHyperlocal = Boolean(data.is_hyperlocal ?? data.hyperlocal ?? false);
      const etaMin = Number(data.estimated_days?.min ?? (isHyperlocal ? 0 : 1));
      const etaMax = Number(data.estimated_days?.max ?? (isHyperlocal ? 1 : 2));

      const result: ServiceabilityResult = {
        serviceable,
        codAvailable,
        prepaidAvailable: serviceable,
        estimatedDays: { min: etaMin, max: etaMax },
      };
      if (!serviceable) {
        result.reason = data.reason ?? 'NOT_SERVICEABLE';
      }

      // Carry hyperlocal flag alongside the canonical result.
      (result as ServiceabilityResult & { isHyperlocal?: boolean }).isHyperlocal = isHyperlocal;

      console.log('[ShadowfaxAdapter] getServiceability success', {
        serviceable,
        isHyperlocal,
        codAvailable,
      });

      return result;
    } catch (error) {
      console.error('[ShadowfaxAdapter] getServiceability failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      // Heuristic fallback: any 6-digit pincode pair is serviceable;
      // same metro-area prefix => hyperlocal.
      const validPincodes =
        /^\d{6}$/.test(input.originPincode) && /^\d{6}$/.test(input.destinationPincode);
      const isHyperlocal = this.guessHyperlocal(input.originPincode, input.destinationPincode);

      const result: ServiceabilityResult = {
        serviceable: validPincodes,
        codAvailable: validPincodes,
        prepaidAvailable: validPincodes,
        estimatedDays: isHyperlocal ? { min: 0, max: 1 } : { min: 1, max: 2 },
      };
      (result as ServiceabilityResult & { isHyperlocal?: boolean }).isHyperlocal = isHyperlocal;
      if (!validPincodes) {
        result.reason = 'INVALID_PINCODE';
      }
      return result;
    }
  }

  /**
   * Schedule a pickup with Shadowfax.
   *
   * Calls POST /v3/request_pickup.
   */
  async schedulePickup(input: SchedulePickupRequest): Promise<ScheduledPickup> {
    console.log('[ShadowfaxAdapter] schedulePickup request', input);

    const payload = {
      pickup_pincode: input.pickupPincode,
      pickup_date: input.pickupDate,
      pickup_time_slot: input.pickupTimeSlot,
      shipment_ids: input.shipmentIds,
      contact_name: input.contactName,
      contact_phone: input.contactPhone,
    };

    const response = await this.makeRequestWithRetry('POST', '/v3/request_pickup', payload);
    const data = response.data || {};
    const pickupId = String(data.pickup_id ?? data.pickupId ?? `SF-PU-${Date.now()}`);
    const awb = data.awb ?? data.tracking_number;

    console.log('[ShadowfaxAdapter] schedulePickup success', { pickupId });

    const result: ScheduledPickup = {
      pickupId,
      pickupDate: input.pickupDate,
      pickupTimeSlot: input.pickupTimeSlot,
    };
    if (awb) {
      result.trackingUrl = `https://www.shadowfax.in/track/${awb}`;
    }
    return result;
  }

  /**
   * Cancel a previously scheduled pickup with Shadowfax.
   *
   * Calls POST /v3/cancel_pickup.
   */
  async cancelPickup(input: CancelPickupRequest): Promise<void> {
    console.log('[ShadowfaxAdapter] cancelPickup request', input);

    const payload = {
      pickup_id: input.pickupId,
      ...(input.reason && { reason: input.reason }),
    };

    await this.makeRequestWithRetry('POST', '/v3/cancel_pickup', payload);
    console.log('[ShadowfaxAdapter] cancelPickup success', { pickupId: input.pickupId });
  }

  /**
   * Mark a COD shipment as collected.
   *
   * Calls POST /v3/mark_cod_collected.
   */
  async markCodCollected(input: MarkCodRequest): Promise<void> {
    console.log('[ShadowfaxAdapter] markCodCollected request', input);

    const payload = {
      awb_number: input.awbNumber,
      collected_amount: input.collectedAmount,
      collected_at: input.collectedAt,
      ...(input.reference && { reference: input.reference }),
    };

    await this.makeRequestWithRetry('POST', '/v3/mark_cod_collected', payload);
    console.log('[ShadowfaxAdapter] markCodCollected success', { awbNumber: input.awbNumber });
  }

  /**
   * Get the NDR actions available for a Shadowfax shipment.
   *
   * Calls GET /v3/ndr_actions?awb=... and maps Shadowfax's own reason
   * codes into our canonical NdrActionOption set:
   *   CUSTOMER_UNAVAILABLE   -> REATTEMPT
   *   ADDRESS_ISSUE          -> CHANGE_ADDRESS
   *   CUSTOMER_REFUSED       -> CANCEL
   *   PHONE_NOT_REACHABLE    -> REATTEMPT
   *
   * (PHONE_NOT_REACHABLE then triggers a WhatsApp retry from SS-018.)
   */
  async getNdrActions(shipmentId: string): Promise<NdrActionOption[]> {
    console.log('[ShadowfaxAdapter] getNdrActions request', { shipmentId });

    const response = await this.makeRequestWithRetry(
      'GET',
      `/v3/ndr_actions?awb=${encodeURIComponent(shipmentId)}`,
    );
    const data = response.data || {};
    const reasons: string[] = Array.isArray(data.reasons)
      ? data.reasons
      : Array.isArray(data.actions)
        ? data.actions
        : [];

    if (reasons.length === 0) {
      // No NDR reasons recorded — return a sensible default set.
      return this.defaultNdrActions();
    }

    const seen = new Set<NdrActionOption['code']>();
    const actions: NdrActionOption[] = [];

    for (const reason of reasons) {
      const code = String(reason).toUpperCase();
      const mapped = this.mapShadowfaxNdrReason(code);
      if (mapped && !seen.has(mapped.code)) {
        seen.add(mapped.code);
        actions.push(mapped);
      }
    }

    if (actions.length === 0) {
      return this.defaultNdrActions();
    }

    console.log('[ShadowfaxAdapter] getNdrActions success', {
      shipmentId,
      actionCount: actions.length,
    });

    return actions;
  }

  // ---------- private helpers ----------

  private mapShadowfaxNdrReason(reason: string): NdrActionOption | null {
    switch (reason) {
      case 'CUSTOMER_UNAVAILABLE':
        return {
          code: 'REATTEMPT',
          label: 'Reattempt delivery',
          requiresCustomerInput: false,
          description: 'Customer was unavailable; reattempt delivery',
        };
      case 'ADDRESS_ISSUE':
        return {
          code: 'CHANGE_ADDRESS',
          label: 'Update address',
          requiresCustomerInput: true,
          description: 'Address could not be located; customer must confirm new address',
        };
      case 'CUSTOMER_REFUSED':
        return {
          code: 'CANCEL',
          label: 'Cancel and RTO',
          requiresCustomerInput: false,
          description: 'Customer refused delivery; return to origin',
        };
      case 'PHONE_NOT_REACHABLE':
        // After REATTEMPT, SS-018 will trigger a WhatsApp retry.
        return {
          code: 'REATTEMPT',
          label: 'Reattempt delivery',
          requiresCustomerInput: false,
          description: 'Phone not reachable; will retry and trigger WhatsApp follow-up',
        };
      default:
        return null;
    }
  }

  private defaultNdrActions(): NdrActionOption[] {
    return [
      {
        code: 'REATTEMPT',
        label: 'Reattempt delivery',
        requiresCustomerInput: false,
        description: 'Try delivering again',
      },
      {
        code: 'CHANGE_ADDRESS',
        label: 'Update address',
        requiresCustomerInput: true,
        description: 'Customer needs to confirm new address',
      },
      {
        code: 'CANCEL',
        label: 'Cancel and RTO',
        requiresCustomerInput: false,
        description: 'Return to origin',
      },
    ];
  }

  private guessHyperlocal(origin: string, destination: string): boolean {
    if (!/^\d{6}$/.test(origin) || !/^\d{6}$/.test(destination)) {
      return false;
    }
    // Same first 3 digits => same postal region (rough metro heuristic).
    return origin.substring(0, 3) === destination.substring(0, 3);
  }

  private fallbackRate(req: { weightGrams: number; paymentMethod: 'PREPAID' | 'COD' }, isHyperlocal: boolean): number {
    // Simple static rate card: base + per-100g, +COD fee, -hyperlocal discount.
    const base = isHyperlocal ? 35 : 55;
    const per100g = 10;
    const weightCharge = Math.ceil(req.weightGrams / 100) * per100g;
    const codFee = req.paymentMethod === 'COD' ? 25 : 0;
    return base + weightCharge + codFee;
  }

  private buildLabelPayload(req: CarrierLabelRequest): any {
    const delivery = req.deliveryAddress!;
    const pickup = req.pickupAddress;
    const pkg = req.packageDetails!;

    return {
      api_key: this.apiKey,
      secret_key: this.secretKey,
      consignee: {
        name: delivery.name,
        address: delivery.addressLine1,
        address2: delivery.addressLine2 || '',
        city: delivery.city,
        state: delivery.state,
        pincode: delivery.pincode,
        phone: delivery.phone,
        country: delivery.country || 'India',
      },
      shipper: pickup ? {
        name: pickup.name,
        address: pickup.addressLine1,
        address2: pickup.addressLine2 || '',
        city: pickup.city,
        state: pickup.state,
        pincode: pickup.pincode,
        phone: pickup.phone,
        country: pickup.country || 'India',
      } : undefined,
      shipment: {
        weight: (pkg.weight / 1000).toFixed(2),
        ...(pkg.length && { length: pkg.length.toString() }),
        ...(pkg.width && { width: pkg.width.toString() }),
        ...(pkg.height && { height: pkg.height.toString() }),
        ...(pkg.codAmount && { cod_amount: pkg.codAmount.toString() }),
        ...(req.orderNumber && { reference_number: req.orderNumber }),
      },
      label_format: req.format || 'PDF',
    };
  }

  private parseLabelResponse(data: any, req: CarrierLabelRequest): CarrierLabelResponse {
    const awbNumber = data?.awb || data?.waybill_number || data?.tracking_number;
    const labelUrl = data?.label_url || data?.label_pdf;
    const shipmentData = data?.shipment || data;

    const labelNumber = awbNumber || `SF-${req.shipmentId}-${Date.now()}`;

    return {
      labelNumber,
      labelUrl: labelUrl || undefined,
      format: (req.format as any) || 'PDF',
      carrierCode: this.code,
      serviceName: shipmentData?.service_type || 'Shadowfax Express',
      awbNumber: awbNumber || labelNumber,
      trackingUrl: awbNumber ? `https://www.shadowfax.in/track/${awbNumber}` : undefined,
      estimatedDelivery: shipmentData?.estimated_delivery_date 
        ? new Date(shipmentData.estimated_delivery_date)
        : undefined,
    };
  }

  private parseTrackingResponse(data: any, trackingNumber: string): TrackingResponse {
    const shipment = data?.shipment || data;
    const trackingHistory = shipment?.tracking_history || shipment?.scans || [];

    const latestEvent = trackingHistory[trackingHistory.length - 1] || {};

    const status = this.mapShadowfaxStatus(latestEvent?.status || shipment?.status || 'Unknown');

    const events = trackingHistory.map((event: any) => ({
      status: this.mapShadowfaxStatus(event.status || event.scan_type),
      subStatus: event.sub_status || event.scan_type,
      description: event.remarks || event.description || event.status,
      location: event.location || event.city || event.destination,
      occurredAt: new Date(event.timestamp || event.time || Date.now()),
      eventCode: event.scan_code || event.status_code,
    }));

    return {
      trackingNumber,
      status,
      subStatus: latestEvent?.sub_status || latestEvent?.scan_type,
      description: latestEvent?.remarks || latestEvent?.description || latestEvent?.status,
      location: latestEvent?.location || latestEvent?.city || shipment?.destination,
      occurredAt: latestEvent?.timestamp ? new Date(latestEvent.timestamp) : new Date(),
      events,
    };
  }

  private mapShadowfaxStatus(status: string): string {
    const s = (status || '').toLowerCase();
    if (s.includes('delivered') || s.includes('dl')) return 'DELIVERED';
    if (s.includes('transit') || s.includes('it')) return 'IN_TRANSIT';
    if (s.includes('shipped') || s.includes('pickup') || s.includes('pu')) return 'SHIPPED';
    if (s.includes('pending') || s.includes('created')) return 'PENDING';
    if (s.includes('cancel') || s.includes('void')) return 'CANCELLED';
    return 'UNKNOWN';
  }

  private async makeRequestWithRetry(method: 'GET' | 'POST', endpoint: string, data?: any): Promise<any> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers: any = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': `Bearer ${this.apiKey}`,
    };

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        console.log(`[ShadowfaxAdapter] API request (attempt ${attempt}/${this.maxRetries})`, {
          method,
          url,
          hasData: !!data,
        });

        const config: any = {
          method,
          url,
          headers,
          timeout: 10000,
        };

        if (method === 'POST' && data) {
          config.data = data;
        }

        const response = await axios(config);

        if (response.data?.error || response.data?.errors) {
          throw new Error(`API Error: ${JSON.stringify(response.data.error || response.data.errors)}`);
        }

        return response;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');
        
        if (error instanceof AxiosError && error.response?.status && error.response.status >= 400 && error.response.status < 500) {
          console.error('[ShadowfaxAdapter] Client error, not retrying', {
            status: error.response.status,
            data: error.response.data,
          });
          throw error;
        }

        const delay = this.retryDelay * Math.pow(2, attempt - 1);
        
        if (attempt < this.maxRetries) {
          console.warn(`[ShadowfaxAdapter] Request failed, retrying in ${delay}ms`, {
            attempt,
            error: lastError.message,
          });
          await this.sleep(delay);
        }
      }
    }

    throw lastError || new Error('Request failed after retries');
  }

  private generateFallbackLabel(req: CarrierLabelRequest): CarrierLabelResponse {
    const labelNumber = `SF-${req.shipmentId}-${Date.now()}`;
    
    console.warn('[ShadowfaxAdapter] Using fallback label generation', {
      shipmentId: req.shipmentId,
      labelNumber,
    });

    return {
      labelNumber,
      labelUrl: undefined,
      format: (req.format as any) || 'PDF',
      carrierCode: this.code,
      serviceName: 'Shadowfax Express',
      awbNumber: labelNumber,
      trackingUrl: `https://www.shadowfax.in/track/${labelNumber}`,
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
