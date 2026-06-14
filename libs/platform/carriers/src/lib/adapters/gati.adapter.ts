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
 * Gati Carrier Adapter
 * 
 * Implements integration with Gati Limited API.
 * Gati is a leading express logistics and supply chain solutions provider in India.
 * 
 * API Documentation: https://www.gati.com/api-docs
 */
export class GatiAdapter implements CarrierAdapter {
  code = 'GATI';
  private readonly clientId: string;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly maxRetries: number = 3;
  private readonly retryDelay: number = 1000;

  constructor(clientId: string, apiKey: string, baseUrl: string = 'https://api.gatikwe.com') {
    if (!clientId || !apiKey) {
      throw new Error('Gati client ID and API key are required');
    }
    this.clientId = clientId;
    this.apiKey = apiKey;
    this.baseUrl = baseUrl;
    console.log('[GatiAdapter] Initialized', { baseUrl, hasClientId: !!clientId, hasApiKey: !!apiKey });
  }

  async generateLabel(req: CarrierLabelRequest): Promise<CarrierLabelResponse> {
    console.log('[GatiAdapter] generateLabel request', {
      shipmentId: req.shipmentId,
      trackingNumber: req.trackingNumber,
      format: req.format,
      hasDeliveryAddress: !!req.deliveryAddress,
      packageWeight: req.packageDetails?.weight,
    });

    if (!req.deliveryAddress) {
      throw new Error('Delivery address is required for Gati label generation');
    }

    if (!req.packageDetails?.weight) {
      throw new Error('Package weight is required for Gati label generation');
    }

    try {
      const payload = this.buildLabelPayload(req);
      const response = await this.makeRequestWithRetry('POST', '/api/shipment/create', payload);
      const labelData = this.parseLabelResponse(response.data, req);

      console.log('[GatiAdapter] generateLabel success', {
        shipmentId: req.shipmentId,
        labelNumber: labelData.labelNumber,
        awbNumber: labelData.awbNumber,
      });

      return labelData;
    } catch (error) {
      console.error('[GatiAdapter] generateLabel failed', {
        shipmentId: req.shipmentId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return this.generateFallbackLabel(req);
    }
  }

  async trackShipment(trackingNumber: string): Promise<TrackingResponse> {
    console.log('[GatiAdapter] trackShipment request', { trackingNumber });

    if (!trackingNumber) {
      throw new Error('Tracking number is required');
    }

    try {
      const response = await this.makeRequestWithRetry(
        'GET',
        `/api/tracking/${encodeURIComponent(trackingNumber)}`
      );
      const trackingData = this.parseTrackingResponse(response.data, trackingNumber);

      console.log('[GatiAdapter] trackShipment success', {
        trackingNumber,
        status: trackingData.status,
        eventCount: trackingData.events.length,
      });

      return trackingData;
    } catch (error) {
      console.error('[GatiAdapter] trackShipment failed', {
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
    console.log('[GatiAdapter] cancelShipment request', { trackingNumber, reason });

    try {
      const payload = {
        waybill: trackingNumber,
        cancellation_reason: reason || 'Cancelled by customer',
      };

      await this.makeRequestWithRetry('POST', '/api/shipment/cancel', payload);
      console.log('[GatiAdapter] cancelShipment success', { trackingNumber });
      return true;
    } catch (error) {
      console.error('[GatiAdapter] cancelShipment failed', {
        trackingNumber,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return false;
    }
  }

  async voidLabel(labelNumber: string): Promise<boolean> {
    console.log('[GatiAdapter] voidLabel request', { labelNumber });

    try {
      await this.makeRequestWithRetry('POST', `/api/label/${encodeURIComponent(labelNumber)}/void`);
      console.log('[GatiAdapter] voidLabel success', { labelNumber });
      return true;
    } catch (error) {
      console.error('[GatiAdapter] voidLabel failed', {
        labelNumber,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return false;
    }
  }

  /**
   * Get shipping rate quotes from Gati
   *
   * API Endpoint: POST /api/rate/calculator
   *
   * @param req - Rate quote request with origin/dest/weight/payment mode
   * @returns Array of rate quotes (with code: 'gati')
   */
  async getRates(req: RateQuoteRequest): Promise<RateQuote[]> {
    console.log('[GatiAdapter] getRates request', {
      originPincode: req.originPincode,
      destinationPincode: req.destinationPincode,
      weightGrams: req.weightGrams,
      paymentMethod: req.paymentMethod,
    });

    try {
      const payload = {
        client_id: this.clientId,
        origin_pincode: req.originPincode,
        destination_pincode: req.destinationPincode,
        weight: (req.weightGrams / 1000).toFixed(2),
        payment_mode: req.paymentMethod,
        ...(req.declaredValue && { declared_value: req.declaredValue }),
        ...(req.length && { length: req.length }),
        ...(req.width && { width: req.width }),
        ...(req.height && { height: req.height }),
      };

      const response = await this.makeRequestWithRetry('POST', '/api/rate/calculator', payload);
      const quotes = this.parseRateResponse(response.data, req);

      console.log('[GatiAdapter] getRates success', { count: quotes.length });
      return quotes;
    } catch (error) {
      console.error('[GatiAdapter] getRates failed, falling back to static rate card', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return this.getFallbackRates(req);
    }
  }

  /**
   * Check if a destination pincode is serviceable by Gati
   *
   * API Endpoint: POST /api/pincode/check
   *
   * @param input - Serviceability request
   * @returns Serviceability result
   */
  async getServiceability(input: ServiceabilityRequest): Promise<ServiceabilityResult> {
    console.log('[GatiAdapter] getServiceability request', {
      originPincode: input.originPincode,
      destinationPincode: input.destinationPincode,
      paymentMethod: input.paymentMethod,
    });

    try {
      const payload = {
        client_id: this.clientId,
        origin_pincode: input.originPincode,
        destination_pincode: input.destinationPincode,
        payment_mode: input.paymentMethod,
        weight: (input.weightGrams / 1000).toFixed(2),
      };

      const response = await this.makeRequestWithRetry('POST', '/api/pincode/check', payload);
      const data = response.data?.data || response.data || {};

      const serviceable = !!(data.serviceable ?? data.is_serviceable ?? data.cod_available ?? true);
      const codAvailable = !!(data.cod_available ?? data.cod);
      const prepaidAvailable = !!(data.prepaid_available ?? data.prepaid ?? true);
      const eta = data.estimated_days || data.transit_days;
      const estimatedDays = eta
        ? { min: Number(eta.min ?? eta.min_days ?? 1), max: Number(eta.max ?? eta.max_days ?? eta) }
        : undefined;

      return {
        serviceable,
        codAvailable,
        prepaidAvailable,
        estimatedDays,
        reason: serviceable ? undefined : (data.reason || 'Pincode not serviceable by Gati'),
      };
    } catch (error) {
      console.error('[GatiAdapter] getServiceability failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return {
        serviceable: true,
        codAvailable: input.paymentMethod === 'COD',
        prepaidAvailable: true,
        estimatedDays: { min: 2, max: 5 },
        reason: 'Fallback serviceability (API error)',
      };
    }
  }

  /**
   * Schedule a pickup with Gati
   *
   * API Endpoint: POST /api/pickup/create
   *
   * @param input - Pickup request
   * @returns Scheduled pickup details
   */
  async schedulePickup(input: SchedulePickupRequest): Promise<ScheduledPickup> {
    console.log('[GatiAdapter] schedulePickup request', {
      pickupPincode: input.pickupPincode,
      pickupDate: input.pickupDate,
      shipmentCount: input.shipmentIds.length,
    });

    try {
      const payload = {
        client_id: this.clientId,
        pickup_pincode: input.pickupPincode,
        pickup_date: input.pickupDate,
        pickup_time_slot: input.pickupTimeSlot,
        shipment_ids: input.shipmentIds,
        contact_name: input.contactName,
        contact_phone: input.contactPhone,
      };

      const response = await this.makeRequestWithRetry('POST', '/api/pickup/create', payload);
      const data = response.data?.data || response.data || {};

      const pickupId = data.pickup_id || data.id || `GATI-PU-${Date.now()}`;

      console.log('[GatiAdapter] schedulePickup success', { pickupId });
      return {
        pickupId,
        pickupDate: data.pickup_date || input.pickupDate,
        pickupTimeSlot: data.pickup_time_slot || input.pickupTimeSlot,
        trackingUrl: data.tracking_url || `https://www.gati.com/track/${pickupId}`,
      };
    } catch (error) {
      console.error('[GatiAdapter] schedulePickup failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      // Fallback: synthesize a pickup id so callers can still track
      const fallbackId = `GATI-PU-FB-${Date.now()}`;
      return {
        pickupId: fallbackId,
        pickupDate: input.pickupDate,
        pickupTimeSlot: input.pickupTimeSlot,
        trackingUrl: `https://www.gati.com/track/${fallbackId}`,
      };
    }
  }

  /**
   * Cancel a previously scheduled pickup
   *
   * API Endpoint: POST /api/pickup/cancel
   *
   * @param input - Cancel pickup request
   */
  async cancelPickup(input: CancelPickupRequest): Promise<void> {
    console.log('[GatiAdapter] cancelPickup request', { pickupId: input.pickupId });

    try {
      const payload = {
        client_id: this.clientId,
        pickup_id: input.pickupId,
        ...(input.reason && { reason: input.reason }),
      };

      await this.makeRequestWithRetry('POST', '/api/pickup/cancel', payload);
      console.log('[GatiAdapter] cancelPickup success', { pickupId: input.pickupId });
    } catch (error) {
      console.error('[GatiAdapter] cancelPickup failed', {
        pickupId: input.pickupId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Mark COD as collected.
   * Gati auto-reconciles COD via the carrier's daily settlement; this is not
   * supported via the API.
   */
  async markCodCollected(_input: MarkCodRequest): Promise<void> {
    throw new Error('NotImplementedError: Gati auto-reconciles COD; markCodCollected is not supported via the Gati API');
  }

  /**
   * Get NDR (Non-Delivery Report) actions for a shipment.
   *
   * API Endpoint: GET /api/track/ndr?awb=...
   *
   * Maps Gati reason codes to the canonical NDR actions:
   *   - CUSTOMER_NOT_AVAILABLE -> REATTEMPT
   *   - ADDRESS_INCORRECT      -> CHANGE_ADDRESS
   *   - PHONE_OFF              -> REATTEMPT
   *   - REFUSED                -> CANCEL
   *
   * @param shipmentId - AWB / shipment identifier
   * @returns Array of NDR action options
   */
  async getNdrActions(shipmentId: string): Promise<NdrActionOption[]> {
    console.log('[GatiAdapter] getNdrActions request', { shipmentId });

    try {
      const response = await this.makeRequestWithRetry(
        'GET',
        `/api/track/ndr?awb=${encodeURIComponent(shipmentId)}`,
      );
      const data = response.data?.data || response.data || {};
      const rawActions: any[] = data.actions || data.ndr_actions || [];

      if (rawActions.length > 0) {
        return rawActions
          .map((a) => this.mapGatiNdrAction(a.reason || a.code || a.reason_code))
          .filter((a): a is NdrActionOption => a !== null);
      }

      // If API returned no actions, return the default menu
      return this.getDefaultNdrActions();
    } catch (error) {
      console.error('[GatiAdapter] getNdrActions failed, returning default actions', {
        shipmentId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return this.getDefaultNdrActions();
    }
  }

  private mapGatiNdrAction(reason: string): NdrActionOption | null {
    if (!reason) return null;
    const code = String(reason).toUpperCase();

    switch (code) {
      case 'CUSTOMER_NOT_AVAILABLE':
        return {
          code: 'REATTEMPT',
          label: 'Reattempt delivery',
          requiresCustomerInput: false,
          description: 'Customer was not available at the time of delivery attempt.',
        };
      case 'ADDRESS_INCORRECT':
        return {
          code: 'CHANGE_ADDRESS',
          label: 'Change delivery address',
          requiresCustomerInput: true,
          description: 'The provided address could not be located. Please provide a corrected address.',
        };
      case 'PHONE_OFF':
        return {
          code: 'REATTEMPT',
          label: 'Reattempt delivery',
          requiresCustomerInput: false,
          description: 'Customer phone was unreachable. Schedule another delivery attempt.',
        };
      case 'REFUSED':
        return {
          code: 'CANCEL',
          label: 'Cancel shipment',
          requiresCustomerInput: false,
          description: 'Customer refused to accept the shipment. Initiate cancellation / RTO.',
        };
      default:
        return {
          code: 'OPEN_DISPUTE',
          label: 'Open dispute',
          requiresCustomerInput: true,
          description: `Unhandled Gati NDR reason: ${reason}`,
        };
    }
  }

  private getDefaultNdrActions(): NdrActionOption[] {
    return [
      {
        code: 'REATTEMPT',
        label: 'Reattempt delivery',
        requiresCustomerInput: false,
        description: 'Schedule another delivery attempt.',
      },
      {
        code: 'CHANGE_ADDRESS',
        label: 'Change delivery address',
        requiresCustomerInput: true,
        description: 'Provide a corrected address for reattempt.',
      },
      {
        code: 'CANCEL',
        label: 'Cancel shipment',
        requiresCustomerInput: false,
        description: 'Cancel the shipment and initiate RTO.',
      },
    ];
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

    const labelNumber = awbNumber || `GATI-${req.shipmentId}-${Date.now()}`;

    return {
      labelNumber,
      labelUrl: labelUrl || undefined,
      format: (req.format as any) || 'PDF',
      carrierCode: this.code,
      serviceName: shipmentData?.service_type || 'Gati Express',
      awbNumber: awbNumber || labelNumber,
      trackingUrl: awbNumber ? `https://www.gati.com/track/${awbNumber}` : undefined,
      estimatedDelivery: shipmentData?.estimated_delivery_date 
        ? new Date(shipmentData.estimated_delivery_date)
        : undefined,
    };
  }

  private parseTrackingResponse(data: any, trackingNumber: string): TrackingResponse {
    const shipment = data?.shipment || data;
    const trackingHistory = shipment?.tracking_history || shipment?.scans || [];

    const latestEvent = trackingHistory[trackingHistory.length - 1] || {};

    const status = this.mapGatiStatus(latestEvent?.status || shipment?.status || 'Unknown');

    const events = trackingHistory.map((event: any) => ({
      status: this.mapGatiStatus(event.status || event.scan_type),
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

  private mapGatiStatus(status: string): string {
    const s = (status || '').toLowerCase();
    if (s.includes('delivered') || s.includes('dl')) return 'DELIVERED';
    if (s.includes('transit') || s.includes('it')) return 'IN_TRANSIT';
    if (s.includes('shipped') || s.includes('pickup') || s.includes('pu')) return 'SHIPPED';
    if (s.includes('pending') || s.includes('created')) return 'PENDING';
    if (s.includes('cancel') || s.includes('void')) return 'CANCELLED';
    return 'UNKNOWN';
  }

  private parseRateResponse(data: any, req: RateQuoteRequest): RateQuote[] {
    const rawQuotes: any[] =
      data?.data?.quotes || data?.quotes || (Array.isArray(data) ? data : []);
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    if (rawQuotes.length === 0) {
      return this.getFallbackRates(req);
    }

    return rawQuotes.map((q) => {
      const serviceRaw = String(q.service_type || q.service || 'STANDARD').toUpperCase();
      const allowedServiceTypes = ['STANDARD', 'EXPRESS', 'SAME_DAY', 'OVERNIGHT'] as const;
      const serviceType = (allowedServiceTypes.find((s) => s === serviceRaw) ||
        'STANDARD') as RateQuote['serviceType'];

      const eta = q.estimated_days || q.transit_days || { min: 2, max: 5 };

      return {
        carrier: 'Gati',
        carrierCode: 'gati',
        serviceType,
        rate: Number(q.rate ?? q.total_charge ?? q.charge ?? 0),
        currency: 'INR',
        estimatedDays: { min: Number(eta.min ?? 2), max: Number(eta.max ?? 5) },
        codAvailable: !!(q.cod_available ?? q.cod ?? req.paymentMethod === 'COD'),
        pickupAvailable: !!(q.pickup_available ?? true),
        expiresAt: q.expires_at ? new Date(q.expires_at) : expiresAt,
        rawResponse: q,
      };
    });
  }

  private getFallbackRates(req: RateQuoteRequest): RateQuote[] {
    const weightKg = req.weightGrams / 1000;
    // Simple deterministic pricing: base ₹100 + ₹60/kg (cod surcharge +₹40)
    const baseRate = Math.round(100 + weightKg * 60 + (req.paymentMethod === 'COD' ? 40 : 0));
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    return [
      {
        carrier: 'Gati',
        carrierCode: 'gati',
        serviceType: 'STANDARD',
        rate: baseRate,
        currency: 'INR',
        estimatedDays: { min: 3, max: 5 },
        codAvailable: req.paymentMethod === 'COD',
        pickupAvailable: true,
        expiresAt,
        rawResponse: { source: 'static_rate_card', carrier: 'gati' },
      },
    ];
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
        console.log(`[GatiAdapter] API request (attempt ${attempt}/${this.maxRetries})`, {
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
          console.error('[GatiAdapter] Client error, not retrying', {
            status: error.response.status,
            data: error.response.data,
          });
          throw error;
        }

        const delay = this.retryDelay * Math.pow(2, attempt - 1);
        
        if (attempt < this.maxRetries) {
          console.warn(`[GatiAdapter] Request failed, retrying in ${delay}ms`, {
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
    const labelNumber = `GATI-${req.shipmentId}-${Date.now()}`;
    
    console.warn('[GatiAdapter] Using fallback label generation', {
      shipmentId: req.shipmentId,
      labelNumber,
    });

    return {
      labelNumber,
      labelUrl: undefined,
      format: (req.format as any) || 'PDF',
      carrierCode: this.code,
      serviceName: 'Gati Express',
      awbNumber: labelNumber,
      trackingUrl: `https://www.gati.com/track/${labelNumber}`,
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
