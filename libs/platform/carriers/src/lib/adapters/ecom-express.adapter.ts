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
 * Ecom Express Carrier Adapter
 *
 * Implements integration with Ecom Express API.
 * Ecom Express is a leading e-commerce logistics provider in India.
 *
 * API Documentation: https://www.ecomexpress.in/api-docs
 * Public API base: https://clconnect.ecomexpress.in
 */
export class NotImplementedError extends Error {
  constructor(method: string, reason: string) {
    super(`[EcomExpressAdapter] ${method} not implemented: ${reason}`);
    this.name = 'NotImplementedError';
  }
}

export class EcomExpressAdapter implements CarrierAdapter {
  code = 'ECOM_EXPRESS';
  private readonly username: string;
  private readonly password: string;
  private readonly baseUrl: string;
  private readonly maxRetries: number = 3;
  private readonly retryDelay: number = 1000;

  constructor(username: string, password: string, baseUrl: string = 'https://clconnect.ecomexpress.in') {
    if (!username || !password) {
      throw new Error('Ecom Express username and password are required');
    }
    this.username = username;
    this.password = password;
    this.baseUrl = baseUrl;
    console.log('[EcomExpressAdapter] Initialized', { baseUrl, hasUsername: !!username, hasPassword: !!password });
  }

  async generateLabel(req: CarrierLabelRequest): Promise<CarrierLabelResponse> {
    console.log('[EcomExpressAdapter] generateLabel request', {
      shipmentId: req.shipmentId,
      trackingNumber: req.trackingNumber,
      format: req.format,
      hasDeliveryAddress: !!req.deliveryAddress,
      packageWeight: req.packageDetails?.weight,
    });

    if (!req.deliveryAddress) {
      throw new Error('Delivery address is required for Ecom Express label generation');
    }

    if (!req.packageDetails?.weight) {
      throw new Error('Package weight is required for Ecom Express label generation');
    }

    try {
      const payload = this.buildLabelPayload(req);
      const response = await this.makeRequestWithRetry('POST', '/apiv2/manifest', payload);
      const labelData = this.parseLabelResponse(response.data, req);

      console.log('[EcomExpressAdapter] generateLabel success', {
        shipmentId: req.shipmentId,
        labelNumber: labelData.labelNumber,
        awbNumber: labelData.awbNumber,
      });

      return labelData;
    } catch (error) {
      console.error('[EcomExpressAdapter] generateLabel failed', {
        shipmentId: req.shipmentId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return this.generateFallbackLabel(req);
    }
  }

  async trackShipment(trackingNumber: string): Promise<TrackingResponse> {
    console.log('[EcomExpressAdapter] trackShipment request', { trackingNumber });

    if (!trackingNumber) {
      throw new Error('Tracking number is required');
    }

    try {
      const response = await this.makeRequestWithRetry(
        'GET',
        `/apiv2/track?awb=${encodeURIComponent(trackingNumber)}`
      );
      const trackingData = this.parseTrackingResponse(response.data, trackingNumber);

      console.log('[EcomExpressAdapter] trackShipment success', {
        trackingNumber,
        status: trackingData.status,
        eventCount: trackingData.events.length,
      });

      return trackingData;
    } catch (error) {
      console.error('[EcomExpressAdapter] trackShipment failed', {
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
    console.log('[EcomExpressAdapter] cancelShipment request', { trackingNumber, reason });

    try {
      const payload = {
        awb: trackingNumber,
        reason: reason || 'Cancelled by customer',
      };

      await this.makeRequestWithRetry('POST', '/apiv2/cancel', payload);
      console.log('[EcomExpressAdapter] cancelShipment success', { trackingNumber });
      return true;
    } catch (error) {
      console.error('[EcomExpressAdapter] cancelShipment failed', {
        trackingNumber,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return false;
    }
  }

  async voidLabel(labelNumber: string): Promise<boolean> {
    console.log('[EcomExpressAdapter] voidLabel request', { labelNumber });

    try {
      await this.makeRequestWithRetry('POST', `/apiv2/label/${encodeURIComponent(labelNumber)}/void`);
      console.log('[EcomExpressAdapter] voidLabel success', { labelNumber });
      return true;
    } catch (error) {
      console.error('[EcomExpressAdapter] voidLabel failed', {
        labelNumber,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return false;
    }
  }

  // -----------------------------------------------------------------------
  // Rate shopping + serviceability + pickup + COD + NDR (SS-007 additions)
  // -----------------------------------------------------------------------

  /**
   * Get shipping rates from Ecom Express's tariff API.
   *
   * API Endpoint: POST /apiv2/calculateTariff (form-encoded)
   *
   * Falls back to a static rate card (per-kg) on any failure so the
   * rate-shop layer can still surface a quote.
   */
  async getRates(req: RateQuoteRequest): Promise<RateQuote[]> {
    console.log('[EcomExpressAdapter] getRates request', req);

    if (req.courierCode && req.courierCode !== this.code) {
      return [];
    }

    try {
      const params = new URLSearchParams();
      params.append('username', this.username);
      params.append('password', this.password);
      params.append('origin_pin', req.originPincode);
      params.append('destination_pin', req.destinationPincode);
      params.append('weight', String(req.weightGrams / 1000));
      params.append('payment_mode', req.paymentMethod === 'COD' ? 'COD' : 'Prepaid');

      const response = await this.makeFormRequest(
        'POST',
        '/apiv2/calculateTariff',
        params.toString(),
      );

      return this.parseRateResponse(response.data, req);
    } catch (error) {
      console.error('[EcomExpressAdapter] getRates failed, using fallback rate card', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return [this.buildFallbackRateQuote(req)];
    }
  }

  /**
   * Check serviceability between two Indian pincodes.
   *
   * API Endpoint: POST /apiv2/pincodeServiceability
   */
  async getServiceability(input: ServiceabilityRequest): Promise<ServiceabilityResult> {
    console.log('[EcomExpressAdapter] getServiceability request', input);

    try {
      const params = new URLSearchParams();
      params.append('username', this.username);
      params.append('password', this.password);
      params.append('origin_pin', input.originPincode);
      params.append('destination_pin', input.destinationPincode);

      const response = await this.makeFormRequest(
        'POST',
        '/apiv2/pincodeServiceability',
        params.toString(),
      );

      const data = response.data ?? {};
      const serviceableFlag = data?.serviceable ?? data?.status ?? data?.is_serviceable;
      const codAvailable = data?.cod ?? data?.cod_available ?? true;
      const prepaidAvailable = data?.prepaid ?? data?.prepaid_available ?? true;

      const serviceable = serviceableFlag === true || serviceableFlag === 'Y' || serviceableFlag === 'YES';

      return {
        serviceable,
        codAvailable: serviceable && (codAvailable === true || codAvailable === 'Y' || codAvailable === 'YES'),
        prepaidAvailable: serviceable && (prepaidAvailable === true || prepaidAvailable === 'Y' || prepaidAvailable === 'YES'),
        estimatedDays: { min: 2, max: 5 },
        reason: serviceable ? undefined : 'PINCODE_NOT_SERVICEABLE',
      };
    } catch (error) {
      console.error('[EcomExpressAdapter] getServiceability failed, returning fallback', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      // Ecom Express is one of the larger India-wide networks — be optimistic
      // on transient failures and let the live rate call still try the route.
      const valid = /^\d{6}$/.test(input.originPincode) && /^\d{6}$/.test(input.destinationPincode);
      return {
        serviceable: valid,
        codAvailable: valid,
        prepaidAvailable: valid,
        estimatedDays: { min: 2, max: 5 },
        reason: valid ? undefined : 'INVALID_PINCODE',
      };
    }
  }

  /**
   * Schedule a pickup with Ecom Express.
   *
   * API Endpoint: POST /apiv2/pickup_request (form-encoded)
   */
  async schedulePickup(input: SchedulePickupRequest): Promise<ScheduledPickup> {
    console.log('[EcomExpressAdapter] schedulePickup request', input);

    const params = new URLSearchParams();
    params.append('username', this.username);
    params.append('password', this.password);
    params.append('pickup_pincode', input.pickupPincode);
    params.append('pickup_date', input.pickupDate);
    params.append('pickup_time', input.pickupTimeSlot);
    params.append('contact_name', input.contactName);
    params.append('contact_phone', input.contactPhone);
    if (input.shipmentIds?.length) {
      params.append('shipments', input.shipmentIds.join(','));
    }

    const response = await this.makeFormRequest('POST', '/apiv2/pickup_request', params.toString());

    const data = response.data ?? {};
    const pickupId = String(
      data?.pickup_id ?? data?.pickupId ?? data?.request_id ?? `EE-PICKUP-${Date.now()}`,
    );

    return {
      pickupId,
      pickupDate: input.pickupDate,
      pickupTimeSlot: input.pickupTimeSlot,
      trackingUrl: `https://clconnect.ecomexpress.in/pickups/${pickupId}`,
    };
  }

  /**
   * Cancel a previously scheduled pickup.
   *
   * API Endpoint: POST /apiv2/pickup_cancel (form-encoded)
   */
  async cancelPickup(input: CancelPickupRequest): Promise<void> {
    console.log('[EcomExpressAdapter] cancelPickup request', input);

    const params = new URLSearchParams();
    params.append('username', this.username);
    params.append('password', this.password);
    params.append('pickup_id', input.pickupId);
    if (input.reason) {
      params.append('reason', input.reason);
    }

    await this.makeFormRequest('POST', '/apiv2/pickup_cancel', params.toString());
  }

  /**
   * Ecom Express auto-reconciles COD on delivery. Their public API
   * does not expose a manual "mark collected" endpoint, so the queue-
   * based reconciliation job (SS-019) is the source of truth.
   */
  async markCodCollected(input: MarkCodRequest): Promise<void> {
    console.warn(
      '[EcomExpressAdapter] markCodCollected invoked but Ecom Express auto-reconciles COD on delivery; deferring to SS-019 queue-based reconciliation',
      { awb: input.awbNumber },
    );
    throw new NotImplementedError(
      'markCodCollected',
      'Ecom Express auto-reconciles COD on delivery; defer to SS-019 queue-based reconciliation',
    );
  }

  /**
   * Inspect an AWB's current NDR status and map Ecom Express's NDRCode
   * to the canonical action vocabulary.
   *
   * API Endpoint: GET /apiv2/track?awb=...
   *
   * Mapping:
   *   UA (Undelivered)              → REATTEMPT
   *   CN (Customer Not Available)   → REATTEMPT
   *   WA (Wrong Address)            → CHANGE_ADDRESS
   *   CR (Customer Refused)         → CANCEL
   */
  async getNdrActions(shipmentId: string): Promise<NdrActionOption[]> {
    console.log('[EcomExpressAdapter] getNdrActions request', { shipmentId });

    try {
      const response = await this.makeRequestWithRetry(
        'GET',
        `/apiv2/track?awb=${encodeURIComponent(shipmentId)}`,
      );

      const data = response.data ?? {};
      const ndrCode: string =
        data?.NDRCode ?? data?.ndr_code ?? data?.ndrCode ?? data?.reason_code ?? '';
      const ndrReason: string =
        data?.NDRReason ?? data?.ndr_reason ?? data?.ndrReason ?? data?.reason ?? '';

      return this.buildNdrActionsForCode(ndrCode, ndrReason);
    } catch (error) {
      console.error('[EcomExpressAdapter] getNdrActions failed, returning canonical defaults', {
        shipmentId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return this.buildNdrActionsForCode('', '');
    }
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  private buildNdrActionsForCode(ndrCode: string, ndrReason: string): NdrActionOption[] {
    const code = (ndrCode || '').toUpperCase();
    const reason = ndrReason || ndrCode;

    switch (code) {
      case 'UA': // Undelivered — generic re-attempt
        return [
          {
            code: 'REATTEMPT',
            label: 'Reattempt delivery',
            requiresCustomerInput: false,
            description: `Ecom Express reported Undelivered (${reason}). Schedule another attempt.`,
          },
        ];
      case 'CN': // Customer not available
        return [
          {
            code: 'REATTEMPT',
            label: 'Reattempt delivery',
            requiresCustomerInput: true,
            description: `Customer not available (${reason}). Confirm a new time slot before retry.`,
          },
        ];
      case 'WA': // Wrong address
        return [
          {
            code: 'CHANGE_ADDRESS',
            label: 'Update delivery address',
            requiresCustomerInput: true,
            description: `Wrong address reported (${reason}). Customer must provide a corrected address.`,
          },
        ];
      case 'CR': // Customer refused
        return [
          {
            code: 'CANCEL',
            label: 'Cancel and RTO',
            requiresCustomerInput: false,
            description: `Customer refused delivery (${reason}). Initiate RTO.`,
          },
        ];
      default:
        // No NDR or unknown code — surface the full canonical vocabulary
        // so the UI can still offer a next step.
        return [
          {
            code: 'REATTEMPT',
            label: 'Reattempt delivery',
            requiresCustomerInput: false,
            description: 'Try delivering again',
          },
          {
            code: 'CHANGE_ADDRESS',
            label: 'Update delivery address',
            requiresCustomerInput: true,
            description: 'Customer needs to confirm a new address',
          },
          {
            code: 'CANCEL',
            label: 'Cancel and RTO',
            requiresCustomerInput: false,
            description: 'Return to origin',
          },
        ];
    }
  }

  private parseRateResponse(data: any, req: RateQuoteRequest): RateQuote[] {
    const total = Number(
      data?.total_amount ?? data?.totalAmount ?? data?.tariff ?? data?.rate ?? 0,
    );

    if (total > 0) {
      return [
        {
          carrier: 'Ecom Express',
          carrierCode: 'ecom-express',
          serviceType: 'STANDARD',
          rate: total,
          currency: 'INR',
          estimatedDays: { min: 2, max: 5 },
          codAvailable: req.paymentMethod === 'COD',
          pickupAvailable: true,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          rawResponse: data,
        },
      ];
    }

    // No usable amount in the response — fall back.
    return [this.buildFallbackRateQuote(req, data)];
  }

  private buildFallbackRateQuote(req: RateQuoteRequest, rawResponse?: unknown): RateQuote {
    // Ecom Express surface rate card: ₹49 base + ₹30 per kg + COD surcharge.
    const weightKg = req.weightGrams / 1000;
    const base = 49;
    const perKg = 30;
    const codSurcharge = req.paymentMethod === 'COD' ? Math.max(40, req.declaredValue ? 0 : 40) : 0;
    const fallbackRate = Math.round(base + weightKg * perKg + codSurcharge);

    return {
      carrier: 'Ecom Express',
      carrierCode: 'ecom-express',
      serviceType: 'STANDARD',
      rate: fallbackRate,
      currency: 'INR',
      estimatedDays: { min: 2, max: 5 },
      codAvailable: req.paymentMethod === 'COD',
      pickupAvailable: true,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      rawResponse: rawResponse ?? { source: 'fallback_rate_card' },
    };
  }

  private buildLabelPayload(req: CarrierLabelRequest): any {
    const delivery = req.deliveryAddress!;
    const pickup = req.pickupAddress;
    const pkg = req.packageDetails!;

    return {
      username: this.username,
      password: this.password,
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

    const labelNumber = awbNumber || `ECOM-${req.shipmentId}-${Date.now()}`;

    return {
      labelNumber,
      labelUrl: labelUrl || undefined,
      format: (req.format as any) || 'PDF',
      carrierCode: this.code,
      serviceName: shipmentData?.service_type || 'Ecom Express',
      awbNumber: awbNumber || labelNumber,
      trackingUrl: awbNumber ? `https://www.ecomexpress.in/track/${awbNumber}` : undefined,
      estimatedDelivery: shipmentData?.estimated_delivery_date
        ? new Date(shipmentData.estimated_delivery_date)
        : undefined,
    };
  }

  private parseTrackingResponse(data: any, trackingNumber: string): TrackingResponse {
    const shipment = data?.shipment || data;
    const trackingHistory = shipment?.tracking_history || shipment?.scans || [];

    const latestEvent = trackingHistory[trackingHistory.length - 1] || {};

    const status = this.mapEcomStatus(latestEvent?.status || shipment?.status || 'Unknown');

    const events = trackingHistory.map((event: any) => ({
      status: this.mapEcomStatus(event.status || event.scan_type),
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

  private mapEcomStatus(status: string): string {
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
    };

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        console.log(`[EcomExpressAdapter] API request (attempt ${attempt}/${this.maxRetries})`, {
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
          console.error('[EcomExpressAdapter] Client error, not retrying', {
            status: error.response.status,
            data: error.response.data,
          });
          throw error;
        }

        const delay = this.retryDelay * Math.pow(2, attempt - 1);

        if (attempt < this.maxRetries) {
          console.warn(`[EcomExpressAdapter] Request failed, retrying in ${delay}ms`, {
            attempt,
            error: lastError.message,
          });
          await this.sleep(delay);
        }
      }
    }

    throw lastError || new Error('Request failed after retries');
  }

  /**
   * Form-encoded POST for the Ecom Express public API (rate, serviceability,
   * pickup). Returns a 4xx error to the caller so the caller can decide
   * whether to fall back or surface the error.
   */
  private async makeFormRequest(
    method: 'POST' | 'GET',
    endpoint: string,
    formBody: string,
  ): Promise<any> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers = {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json',
    };

    const config: any = {
      method,
      url,
      headers,
      timeout: 10000,
      data: method === 'POST' ? formBody : undefined,
    };

    const response = await axios(config);

    if (response.data?.error || response.data?.errors) {
      throw new Error(`API Error: ${JSON.stringify(response.data.error || response.data.errors)}`);
    }

    return response;
  }

  private generateFallbackLabel(req: CarrierLabelRequest): CarrierLabelResponse {
    const labelNumber = `ECOM-${req.shipmentId}-${Date.now()}`;

    console.warn('[EcomExpressAdapter] Using fallback label generation', {
      shipmentId: req.shipmentId,
      labelNumber,
    });

    return {
      labelNumber,
      labelUrl: undefined,
      format: (req.format as any) || 'PDF',
      carrierCode: this.code,
      serviceName: 'Ecom Express',
      awbNumber: labelNumber,
      trackingUrl: `https://www.ecomexpress.in/track/${labelNumber}`,
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
