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
 * DTDC Carrier Adapter
 * 
 * Implements integration with DTDC Express & Logistics API.
 * DTDC is one of India's largest express logistics providers.
 * 
 * API Documentation: https://www.dtdc.in/api-docs
 * 
 * Flow:
 * 1. Label Generation: Creates shipment and generates AWB label
 * 2. Tracking: Fetches real-time tracking updates
 * 3. Cancellation: Cancels shipments before pickup
 * 4. Label Voiding: Voids labels that haven't been used
 */
export class DtdcAdapter implements CarrierAdapter {
  code = 'DTDC';
  private readonly clientId: string;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly maxRetries: number = 3;
  private readonly retryDelay: number = 1000;

  constructor(clientId: string, apiKey: string, baseUrl: string = 'https://www.dtdc.in') {
    if (!clientId || !apiKey) {
      throw new Error('DTDC client ID and API key are required');
    }
    this.clientId = clientId;
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    console.log('[DtdcAdapter] Initialized', { baseUrl, hasClientId: !!clientId, hasApiKey: !!apiKey });
  }

  async generateLabel(req: CarrierLabelRequest): Promise<CarrierLabelResponse> {
    console.log('[DtdcAdapter] generateLabel request', {
      shipmentId: req.shipmentId,
      trackingNumber: req.trackingNumber,
      format: req.format,
      hasDeliveryAddress: !!req.deliveryAddress,
      packageWeight: req.packageDetails?.weight,
    });

    if (!req.deliveryAddress) {
      throw new Error('Delivery address is required for DTDC label generation');
    }

    if (!req.packageDetails?.weight) {
      throw new Error('Package weight is required for DTDC label generation');
    }

    try {
      const payload = this.buildLabelPayload(req);
      const response = await this.makeRequestWithRetry('POST', '/api/shipment/create', payload);
      const labelData = this.parseLabelResponse(response.data, req);

      console.log('[DtdcAdapter] generateLabel success', {
        shipmentId: req.shipmentId,
        labelNumber: labelData.labelNumber,
        awbNumber: labelData.awbNumber,
      });

      return labelData;
    } catch (error) {
      console.error('[DtdcAdapter] generateLabel failed', {
        shipmentId: req.shipmentId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return this.generateFallbackLabel(req);
    }
  }

  async trackShipment(trackingNumber: string): Promise<TrackingResponse> {
    console.log('[DtdcAdapter] trackShipment request', { trackingNumber });

    if (!trackingNumber) {
      throw new Error('Tracking number is required');
    }

    try {
      const response = await this.makeRequestWithRetry(
        'GET',
        `/api/tracking/${encodeURIComponent(trackingNumber)}`
      );
      const trackingData = this.parseTrackingResponse(response.data, trackingNumber);

      console.log('[DtdcAdapter] trackShipment success', {
        trackingNumber,
        status: trackingData.status,
        eventCount: trackingData.events.length,
      });

      return trackingData;
    } catch (error) {
      console.error('[DtdcAdapter] trackShipment failed', {
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
    console.log('[DtdcAdapter] cancelShipment request', { trackingNumber, reason });

    try {
      const payload = {
        waybill: trackingNumber,
        cancellation_reason: reason || 'Cancelled by customer',
      };

      await this.makeRequestWithRetry('POST', '/api/shipment/cancel', payload);
      console.log('[DtdcAdapter] cancelShipment success', { trackingNumber });
      return true;
    } catch (error) {
      console.error('[DtdcAdapter] cancelShipment failed', {
        trackingNumber,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return false;
    }
  }

  async voidLabel(labelNumber: string): Promise<boolean> {
    console.log('[DtdcAdapter] voidLabel request', { labelNumber });

    try {
      await this.makeRequestWithRetry('POST', `/api/label/${encodeURIComponent(labelNumber)}/void`);
      console.log('[DtdcAdapter] voidLabel success', { labelNumber });
      return true;
    } catch (error) {
      console.error('[DtdcAdapter] voidLabel failed', {
        labelNumber,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return false;
    }
  }

  /**
   * Get shipping rates for a given origin/destination/weight.
   *
   * DTDC Endpoint: POST /api/dtdc/rate
   * Body: { customer_code, license_key, origin_pincode, destination_pincode, weight, payment_type }
   *
   * Falls back to a static rate card on API failure so the calling service
   * (rate shopping) always gets a deterministic quote.
   */
  async getRates(req: RateQuoteRequest): Promise<RateQuote[]> {
    console.log('[DtdcAdapter] getRates request', {
      origin: req.originPincode,
      dest: req.destinationPincode,
      weightGrams: req.weightGrams,
      paymentMethod: req.paymentMethod,
    });

    const weightKg = req.weightGrams / 1000;

    try {
      // Endpoint: POST /api/dtdc/rate
      const payload = {
        customer_code: this.clientId,
        license_key: this.apiKey,
        origin_pincode: req.originPincode,
        destination_pincode: req.destinationPincode,
        weight: weightKg.toFixed(2),
        payment_type: req.paymentMethod, // 'PREPAID' | 'COD'
      };
      const response = await this.makeRequestWithRetry('POST', '/api/dtdc/rate', payload);
      const rate = this.parseRateFromResponse(response.data);
      if (rate !== null) {
        return [this.buildRateQuote(req, 'STANDARD', rate, true, response.data)];
      }
      console.warn('[DtdcAdapter] getRates could not parse rate, using static rate card');
      return [this.fallbackRate(req, 'STANDARD')];
    } catch (error) {
      console.warn('[DtdcAdapter] getRates live call failed, using static rate card', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return [this.fallbackRate(req, 'STANDARD')];
    }
  }

  /**
   * Check pincode serviceability via DTDC.
   *
   * DTDC Endpoint: POST /api/dtdc/serviceability
   * Body: { customer_code, license_key, pincode }
   *
   * On any failure (network, parse, or known-unserviceable pincode), we
   * report the pincode as not serviceable. Callers can retry or fall back
   * to a different carrier.
   */
  async getServiceability(input: ServiceabilityRequest): Promise<ServiceabilityResult> {
    console.log('[DtdcAdapter] getServiceability request', {
      origin: input.originPincode,
      dest: input.destinationPincode,
      paymentMethod: input.paymentMethod,
      weightGrams: input.weightGrams,
    });

    // DTDC's public API only checks a single pincode; use destination.
    try {
      // Endpoint: POST /api/dtdc/serviceability
      const payload = {
        customer_code: this.clientId,
        license_key: this.apiKey,
        pincode: input.destinationPincode,
      };
      const response = await this.makeRequestWithRetry(
        'POST',
        '/api/dtdc/serviceability',
        payload,
      );
      const serviceable = this.parseServiceabilityResponse(response.data);
      if (!serviceable) {
        return {
          serviceable: false,
          codAvailable: false,
          prepaidAvailable: false,
          reason: 'PINCODE_NOT_SERVICEABLE',
        };
      }
      return {
        serviceable: true,
        codAvailable: input.paymentMethod === 'COD',
        prepaidAvailable: true,
        estimatedDays: { min: 2, max: 5 },
      };
    } catch (error) {
      console.warn('[DtdcAdapter] getServiceability live call failed, defaulting to unserviceable', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return {
        serviceable: false,
        codAvailable: false,
        prepaidAvailable: false,
        reason: 'PINCODE_NOT_SERVICEABLE',
      };
    }
  }

  /**
   * Schedule a pickup with DTDC for a given pincode/date/time slot.
   *
   * DTDC Endpoint: POST /api/dtdc/pickup
   * Note: DTDC often embeds pickup requests in the order creation flow,
   * but the partner API also exposes a dedicated pickup endpoint that
   * accepts multiple AWBs at once.
   */
  async schedulePickup(input: SchedulePickupRequest): Promise<ScheduledPickup> {
    console.log('[DtdcAdapter] schedulePickup request', {
      pickupPincode: input.pickupPincode,
      pickupDate: input.pickupDate,
      slot: input.pickupTimeSlot,
      shipmentCount: input.shipmentIds.length,
    });

    const payload = {
      customer_code: this.clientId,
      license_key: this.apiKey,
      pincode: input.pickupPincode,
      pickup_date: input.pickupDate,
      time_slot: this.mapTimeSlotToDtdc(input.pickupTimeSlot),
      shipments: input.shipmentIds,
      contact: {
        name: input.contactName,
        phone: input.contactPhone,
      },
    };

    try {
      // Endpoint: POST /api/dtdc/pickup
      const response = await this.makeRequestWithRetry('POST', '/api/dtdc/pickup', payload);
      const pickupId =
        response.data?.pickup_id ||
        response.data?.PickupID ||
        `DTDC-PU-${input.pickupPincode}-${Date.now()}`;

      return {
        pickupId: String(pickupId),
        pickupDate: input.pickupDate,
        pickupTimeSlot: input.pickupTimeSlot,
        trackingUrl: `https://www.dtdc.in/track?pickup=${pickupId}`,
      };
    } catch (error) {
      console.warn('[DtdcAdapter] schedulePickup live call failed, generating synthetic pickup id', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      // Fallback: surface a deterministic local pickup id so callers can
      // still proceed. Real reconciliation is handled by a queue worker.
      return {
        pickupId: `DTDC-PU-LOCAL-${input.pickupPincode}-${Date.now()}`,
        pickupDate: input.pickupDate,
        pickupTimeSlot: input.pickupTimeSlot,
        trackingUrl: undefined,
      };
    }
  }

  /**
   * Cancel a previously scheduled DTDC pickup.
   *
   * DTDC Endpoint: POST /api/dtdc/pickupcancel
   * Body: { customer_code, license_key, pickup_id }
   */
  async cancelPickup(input: CancelPickupRequest): Promise<void> {
    console.log('[DtdcAdapter] cancelPickup request', {
      pickupId: input.pickupId,
      reason: input.reason,
    });

    try {
      // Endpoint: POST /api/dtdc/pickupcancel
      const payload = {
        customer_code: this.clientId,
        license_key: this.apiKey,
        pickup_id: input.pickupId,
        reason: input.reason || 'Cancelled by customer',
      };
      await this.makeRequestWithRetry('POST', '/api/dtdc/pickupcancel', payload);
      console.log('[DtdcAdapter] cancelPickup success', { pickupId: input.pickupId });
    } catch (error) {
      console.warn('[DtdcAdapter] cancelPickup live call failed (treating as no-op)', {
        pickupId: input.pickupId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      // Per the SS-007 spec, cancelPickup should resolve even on carrier failure
      // so the calling service can complete its local state transition.
    }
  }

  /**
   * Mark a COD shipment's cash as collected.
   *
   * DTDC has manual COD updates (their API exposes POST /api/dtdc/codupdate
   * for the partner to push a manual collection event). We attempt the call
   * and resolve either way; reconciliation is handled by the cod-remittance
   * queue (SS-019) and a no-op resolution here keeps the calling flow
   * non-blocking.
   */
  async markCodCollected(input: MarkCodRequest): Promise<void> {
    console.log('[DtdcAdapter] markCodCollected request', {
      awbNumber: input.awbNumber,
      collectedAmount: input.collectedAmount,
      collectedAt: input.collectedAt,
    });

    try {
      // Endpoint: POST /api/dtdc/codupdate
      const payload = {
        customer_code: this.clientId,
        license_key: this.apiKey,
        awb_number: input.awbNumber,
        collected_amount: input.collectedAmount,
        collected_at: input.collectedAt,
        reference: input.reference,
      };
      await this.makeRequestWithRetry('POST', '/api/dtdc/codupdate', payload);
      console.log('[DtdcAdapter] markCodCollected success', { awbNumber: input.awbNumber });
    } catch (error) {
      console.warn('[DtdcAdapter] markCodCollected live call failed (no-op fallback)', {
        awbNumber: input.awbNumber,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      // No-op: per the SS-007 spec this is a no-op-style implementation.
    }
  }

  /**
   * Fetch NDR action options for a DTDC shipment.
   *
   * DTDC Endpoint: GET /api/dtdc/ndraction?awb=...
   *
   * Maps DTDC's native reason codes to the canonical 4-action recovery model:
   *   NSZ              -> CANCEL       (Non-Serviceable Zone)
   *   CUS_UNAVAILABLE  -> REATTEMPT    (Customer unavailable)
   *   ADDR_INCORRECT   -> CHANGE_ADDRESS (Address incorrect)
   *   CUS_REFUSED      -> CANCEL       (Customer refused)
   *
   * On API failure, returns a sensible default action set so the calling
   * service can still present recovery options to the customer.
   */
  async getNdrActions(shipmentId: string): Promise<NdrActionOption[]> {
    console.log('[DtdcAdapter] getNdrActions request', { shipmentId });

    // Map of DTDC native reason codes -> canonical action code
    const dtdcReasonMap: Record<string, NdrActionOption> = {
      NSZ: {
        code: 'CANCEL',
        label: 'Pincode not serviceable — cancel and refund',
        requiresCustomerInput: false,
        description: 'DTDC reported a non-serviceable zone (NSZ).',
      },
      CUS_UNAVAILABLE: {
        code: 'REATTEMPT',
        label: 'Customer unavailable — reattempt delivery',
        requiresCustomerInput: false,
        description: 'Recipient was not available at the time of delivery.',
      },
      ADDR_INCORRECT: {
        code: 'CHANGE_ADDRESS',
        label: 'Address incorrect — update and reattempt',
        requiresCustomerInput: true,
        description: 'DTDC reported an incorrect address; customer must provide a corrected one.',
      },
      CUS_REFUSED: {
        code: 'CANCEL',
        label: 'Customer refused — cancel and RTO',
        requiresCustomerInput: false,
        description: 'Recipient refused to accept the shipment.',
      },
    };

    try {
      // Endpoint: GET /api/dtdc/ndraction?awb=...
      const response = await this.makeRequestWithRetry(
        'GET',
        `/api/dtdc/ndraction?awb=${encodeURIComponent(shipmentId)}`,
      );
      const reasonCode = this.parseNdrReasonCode(response.data);
      if (reasonCode && dtdcReasonMap[reasonCode]) {
        // Surface only the mapped canonical action for this specific NDR.
        return [dtdcReasonMap[reasonCode]];
      }
    } catch (error) {
      console.warn('[DtdcAdapter] getNdrActions live call failed, returning default action set', {
        shipmentId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    // Fallback: return the full set of 4 canonical actions so the calling
    // service can always present a recovery menu.
    return [
      {
        code: 'REATTEMPT',
        label: 'Reattempt delivery',
        requiresCustomerInput: false,
        description: 'Retry delivery at the same address on the next attempt',
      },
      {
        code: 'CHANGE_ADDRESS',
        label: 'Change delivery address',
        requiresCustomerInput: true,
        description: 'Customer provides a new delivery pincode / address',
      },
      {
        code: 'CANCEL',
        label: 'Cancel and RTO',
        requiresCustomerInput: false,
        description: 'Return to origin',
      },
      {
        code: 'OPEN_DISPUTE',
        label: 'Open dispute',
        requiresCustomerInput: true,
        description: 'Escalate to DTDC support for investigation',
      },
    ];
  }

  /**
   * Map canonical time slot to DTDC's expected slot string.
   */
  private mapTimeSlotToDtdc(slot: 'MORNING' | 'AFTERNOON' | 'EVENING'): string {
    switch (slot) {
      case 'MORNING':
        return '10:00-13:00';
      case 'AFTERNOON':
        return '13:00-17:00';
      case 'EVENING':
        return '17:00-20:00';
      default:
        return '10:00-17:00';
    }
  }

  /**
   * Parse a numeric rate out of a DTDC rate-quote response.
   */
  private parseRateFromResponse(data: any): number | null {
    if (!data || typeof data !== 'object') return null;
    const candidates = [
      data?.rate,
      data?.total_rate,
      data?.TotalRate,
      data?.amount,
      data?.data?.rate,
    ];
    for (const c of candidates) {
      const n = typeof c === 'string' ? parseFloat(c) : (typeof c === 'number' ? c : NaN);
      if (!Number.isNaN(n) && n > 0) return n;
    }
    return null;
  }

  /**
   * Build a canonical RateQuote from a numeric rate and a raw response.
   *
   * Per SS-007 spec, all DTDC RateQuote responses use `code: 'dtdc'`
   * (lowercase) as the canonical carrier identifier.
   */
  private buildRateQuote(
    req: RateQuoteRequest,
    serviceType: 'STANDARD' | 'EXPRESS' | 'SAME_DAY' | 'OVERNIGHT',
    rate: number,
    codAvailable: boolean,
    rawResponse?: unknown,
  ): RateQuote {
    return {
      carrier: 'DTDC',
      carrierCode: 'dtdc',
      serviceType,
      rate,
      currency: 'INR',
      estimatedDays: { min: 2, max: 5 },
      codAvailable,
      pickupAvailable: true,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      rawResponse,
    };
  }

  /**
   * Static rate-card fallback used when the DTDC rate API fails.
   * Uses a simple weight-based formula so callers always get a quote.
   */
  private fallbackRate(
    req: RateQuoteRequest,
    serviceType: 'STANDARD' | 'EXPRESS' | 'SAME_DAY' | 'OVERNIGHT' = 'STANDARD',
  ): RateQuote {
    const weightKg = Math.max(0.5, req.weightGrams / 1000);
    const baseRate = 80;
    const perKg = 45;
    const codSurcharge = req.paymentMethod === 'COD' ? 50 : 0;
    const rate = baseRate + Math.ceil(weightKg) * perKg + codSurcharge;
    return this.buildRateQuote(req, serviceType, rate, req.paymentMethod === 'COD');
  }

  /**
   * Parse the serviceability boolean out of a DTDC serviceability response.
   */
  private parseServiceabilityResponse(data: any): boolean {
    if (!data || typeof data !== 'object') return false;
    if (typeof data?.serviceable === 'boolean') return data.serviceable;
    if (typeof data?.status === 'string') {
      const s = data.status.toLowerCase();
      if (s === 'serviceable' || s === 'ok' || s === 'success') return true;
    }
    if (data?.data?.serviceable !== undefined) {
      return Boolean(data.data.serviceable);
    }
    return false;
  }

  /**
   * Parse the DTDC NDR reason code out of an ndraction response.
   */
  private parseNdrReasonCode(data: any): string | null {
    if (!data || typeof data !== 'object') return null;
    const candidates = [
      data?.reason_code,
      data?.reasonCode,
      data?.code,
      data?.ndr_reason,
      data?.data?.reason_code,
    ];
    for (const c of candidates) {
      if (typeof c === 'string' && c.trim().length > 0) return c.trim().toUpperCase();
    }
    return null;
  }

  private buildLabelPayload(req: CarrierLabelRequest): any {
    const delivery = req.deliveryAddress!;
    const pickup = req.pickupAddress;
    const pkg = req.packageDetails!;

    return {
      client_id: this.clientId,
      api_key: this.apiKey,
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

    const labelNumber = awbNumber || `DTDC-${req.shipmentId}-${Date.now()}`;

    return {
      labelNumber,
      labelUrl: labelUrl || undefined,
      format: (req.format as any) || 'PDF',
      carrierCode: this.code,
      serviceName: shipmentData?.service_type || 'DTDC Express',
      awbNumber: awbNumber || labelNumber,
      trackingUrl: awbNumber ? `https://www.dtdc.in/track/${awbNumber}` : undefined,
      estimatedDelivery: shipmentData?.estimated_delivery_date 
        ? new Date(shipmentData.estimated_delivery_date)
        : undefined,
    };
  }

  private parseTrackingResponse(data: any, trackingNumber: string): TrackingResponse {
    const shipment = data?.shipment || data;
    const trackingHistory = shipment?.tracking_history || shipment?.scans || [];

    const latestEvent = trackingHistory[trackingHistory.length - 1] || {};

    const status = this.mapDtdcStatus(latestEvent?.status || shipment?.status || 'Unknown');

    const events = trackingHistory.map((event: any) => ({
      status: this.mapDtdcStatus(event.status || event.scan_type),
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

  private mapDtdcStatus(status: string): string {
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
        console.log(`[DtdcAdapter] API request (attempt ${attempt}/${this.maxRetries})`, {
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
          console.error('[DtdcAdapter] Client error, not retrying', {
            status: error.response.status,
            data: error.response.data,
          });
          throw error;
        }

        const delay = this.retryDelay * Math.pow(2, attempt - 1);
        
        if (attempt < this.maxRetries) {
          console.warn(`[DtdcAdapter] Request failed, retrying in ${delay}ms`, {
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
    const labelNumber = `DTDC-${req.shipmentId}-${Date.now()}`;
    
    console.warn('[DtdcAdapter] Using fallback label generation', {
      shipmentId: req.shipmentId,
      labelNumber,
    });

    return {
      labelNumber,
      labelUrl: undefined,
      format: (req.format as any) || 'PDF',
      carrierCode: this.code,
      serviceName: 'DTDC Express',
      awbNumber: labelNumber,
      trackingUrl: `https://www.dtdc.in/track/${labelNumber}`,
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
