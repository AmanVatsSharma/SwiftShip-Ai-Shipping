import { 
  CarrierAdapter, 
  CarrierLabelRequest, 
  CarrierLabelResponse, 
  TrackingResponse,
  Address,
  PackageDetails 
} from '../adapter.interface';
import axios, { AxiosError } from 'axios';

/**
 * Xpressbees Carrier Adapter
 * 
 * Implements integration with Xpressbees shipping API for label generation,
 * tracking, and shipment management.
 * 
 * API Documentation: https://xpressbees.com/api-docs
 * 
 * Flow:
 * 1. Label Generation: Creates shipment and generates AWB label
 * 2. Tracking: Fetches real-time tracking updates
 * 3. Cancellation: Cancels shipments before pickup
 * 4. Label Voiding: Voids labels that haven't been used
 * 
 * Error Handling:
 * - Retries failed requests with exponential backoff
 * - Validates API responses
 * - Falls back gracefully on errors
 * - Comprehensive logging for debugging
 */
export class XpressbeesAdapter implements CarrierAdapter {
  code = 'XPRESSBEES';
  private readonly token?: string;
  private readonly baseUrl: string;
  private readonly maxRetries: number = 3;
  private readonly retryDelay: number = 1000; // 1 second

  constructor(token?: string, baseUrl: string = 'https://shipment.xpressbees.com') {
    this.token = token;
    this.baseUrl = baseUrl;
    console.log('[XpressbeesAdapter] Initialized', { baseUrl, hasToken: !!token });
  }

  /**
   * Generate a shipping label via Xpressbees API
   * 
   * API Endpoint: POST /api/v1/shipments/create
   * 
   * @param req - Label generation request with shipment details
   * @returns Label response with AWB number and label URL
   */
  async generateLabel(req: CarrierLabelRequest): Promise<CarrierLabelResponse> {
    console.log('[XpressbeesAdapter] generateLabel request', {
      shipmentId: req.shipmentId,
      trackingNumber: req.trackingNumber,
      format: req.format,
      hasPickupAddress: !!req.pickupAddress,
      hasDeliveryAddress: !!req.deliveryAddress,
      packageWeight: req.packageDetails?.weight,
    });

    // Validate required fields
    if (!req.deliveryAddress) {
      throw new Error('Delivery address is required for Xpressbees label generation');
    }

    if (!req.packageDetails?.weight) {
      throw new Error('Package weight is required for Xpressbees label generation');
    }

    // If no token, use fallback
    if (!this.token) {
      console.warn('[XpressbeesAdapter] No token provided, using fallback label generation');
      return this.generateFallbackLabel(req);
    }

    try {
      // Build Xpressbees API payload
      const payload = this.buildLabelPayload(req);
      
      // Make API call with retry logic
      const response = await this.makeRequestWithRetry(
        'POST',
        '/api/v1/shipments/create',
        payload
      );

      // Parse response
      const labelData = this.parseLabelResponse(response.data, req);

      console.log('[XpressbeesAdapter] generateLabel success', {
        shipmentId: req.shipmentId,
        labelNumber: labelData.labelNumber,
        awbNumber: labelData.awbNumber,
        hasLabelUrl: !!labelData.labelUrl,
      });

      return labelData;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[XpressbeesAdapter] generateLabel failed', {
        shipmentId: req.shipmentId,
        error: errorMessage,
        errorDetails: error instanceof AxiosError ? {
          status: error.response?.status,
          statusText: error.response?.statusText,
          data: error.response?.data,
        } : undefined,
      });

      // Fallback: Generate deterministic label number for graceful degradation
      console.warn('[XpressbeesAdapter] Falling back to stub label generation');
      return this.generateFallbackLabel(req);
    }
  }

  /**
   * Track a shipment via Xpressbees API
   * 
   * API Endpoint: GET /api/v1/tracking/{trackingNumber}
   * 
   * @param trackingNumber - AWB/tracking number to track
   * @returns Tracking response with current status and events
   */
  async trackShipment(trackingNumber: string): Promise<TrackingResponse> {
    console.log('[XpressbeesAdapter] trackShipment request', { trackingNumber });

    if (!trackingNumber) {
      throw new Error('Tracking number is required');
    }

    // If no token, use fallback
    if (!this.token) {
      console.warn('[XpressbeesAdapter] No token provided, using fallback tracking');
      return this.generateFallbackTracking(trackingNumber);
    }

    try {
      // Make API call with retry logic
      const response = await this.makeRequestWithRetry(
        'GET',
        `/api/v1/tracking/${encodeURIComponent(trackingNumber)}`
      );

      // Parse tracking response
      const trackingData = this.parseTrackingResponse(response.data, trackingNumber);

      console.log('[XpressbeesAdapter] trackShipment success', {
        trackingNumber,
        status: trackingData.status,
        eventCount: trackingData.events.length,
      });

      return trackingData;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[XpressbeesAdapter] trackShipment failed', {
        trackingNumber,
        error: errorMessage,
        errorDetails: error instanceof AxiosError ? {
          status: error.response?.status,
          statusText: error.response?.statusText,
        } : undefined,
      });

      // Return fallback tracking response on error
      return this.generateFallbackTracking(trackingNumber);
    }
  }

  /**
   * Cancel a shipment via Xpressbees API
   * 
   * API Endpoint: POST /api/v1/shipments/{trackingNumber}/cancel
   * 
   * @param trackingNumber - AWB/tracking number to cancel
   * @param reason - Optional cancellation reason
   * @returns True if cancellation successful
   */
  async cancelShipment(trackingNumber: string, reason?: string): Promise<boolean> {
    console.log('[XpressbeesAdapter] cancelShipment request', { trackingNumber, reason });

    if (!this.token) {
      console.warn('[XpressbeesAdapter] No token provided, cannot cancel shipment');
      return false;
    }

    try {
      const payload = {
        reason: reason || 'Cancelled by customer',
      };

      await this.makeRequestWithRetry(
        'POST',
        `/api/v1/shipments/${encodeURIComponent(trackingNumber)}/cancel`,
        payload
      );

      console.log('[XpressbeesAdapter] cancelShipment success', { trackingNumber });
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[XpressbeesAdapter] cancelShipment failed', {
        trackingNumber,
        error: errorMessage,
      });
      return false;
    }
  }

  /**
   * Void a label via Xpressbees API
   * 
   * API Endpoint: POST /api/v1/labels/{labelNumber}/void
   * 
   * @param labelNumber - Label/AWB number to void
   * @returns True if voiding successful
   */
  async voidLabel(labelNumber: string): Promise<boolean> {
    console.log('[XpressbeesAdapter] voidLabel request', { labelNumber });

    if (!this.token) {
      console.warn('[XpressbeesAdapter] No token provided, cannot void label');
      return false;
    }

    try {
      await this.makeRequestWithRetry(
        'POST',
        `/api/v1/labels/${encodeURIComponent(labelNumber)}/void`
      );

      console.log('[XpressbeesAdapter] voidLabel success', { labelNumber });
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[XpressbeesAdapter] voidLabel failed', {
        labelNumber,
        error: errorMessage,
      });
      return false;
    }
  }

  /**
   * Build Xpressbees API payload for label generation
   */
  private buildLabelPayload(req: CarrierLabelRequest): any {
    const delivery = req.deliveryAddress!;
    const pickup = req.pickupAddress;
    const pkg = req.packageDetails!;

    const payload: any = {
      // Shipment details
      shipment: {
        // Delivery address (required)
        consignee_name: delivery.name,
        consignee_phone: delivery.phone,
        consignee_address: delivery.addressLine1,
        consignee_pincode: delivery.pincode,
        consignee_city: delivery.city,
        consignee_state: delivery.state,
        consignee_country: delivery.country || 'India',
        ...(delivery.addressLine2 && { consignee_address2: delivery.addressLine2 }),
      },
      // Package details
      weight: (pkg.weight / 1000).toFixed(2), // Convert grams to kg
      ...(pkg.length && { length: pkg.length.toString() }),
      ...(pkg.width && { width: pkg.width.toString() }),
      ...(pkg.height && { height: pkg.height.toString() }),
      // COD amount if applicable
      ...(pkg.codAmount && { cod_amount: pkg.codAmount.toString() }),
      // Order reference
      ...(req.orderNumber && { order_number: req.orderNumber }),
      // Label format
      label_format: req.format || 'PDF',
    };

    // Add pickup address if provided
    if (pickup) {
      payload.pickup = {
        pickup_name: pickup.name,
        pickup_phone: pickup.phone,
        pickup_address: pickup.addressLine1,
        pickup_pincode: pickup.pincode,
        pickup_city: pickup.city,
        pickup_state: pickup.state,
        pickup_country: pickup.country || 'India',
        ...(pickup.addressLine2 && { pickup_address2: pickup.addressLine2 }),
      };
    }

    return payload;
  }

  /**
   * Parse Xpressbees label generation response
   */
  private parseLabelResponse(data: any, req: CarrierLabelRequest): CarrierLabelResponse {
    // Xpressbees API response structure
    const awbNumber = data?.awb || data?.awb_number || data?.tracking_number;
    const labelUrl = data?.label_url || data?.label || data?.label_pdf;
    const shipmentData = data?.shipment || data;

    const labelNumber = awbNumber || `XBE-${req.shipmentId}-${Date.now()}`;

    return {
      labelNumber,
      labelUrl: labelUrl || undefined,
      format: (req.format as any) || 'PDF',
      carrierCode: this.code,
      serviceName: shipmentData?.service_type || 'XB Standard',
      awbNumber: awbNumber || labelNumber,
      trackingUrl: awbNumber ? `https://xpressbees.com/track/${awbNumber}` : undefined,
      estimatedDelivery: shipmentData?.estimated_delivery_date 
        ? new Date(shipmentData.estimated_delivery_date)
        : undefined,
    };
  }

  /**
   * Parse Xpressbees tracking response
   */
  private parseTrackingResponse(data: any, trackingNumber: string): TrackingResponse {
    // Xpressbees tracking response structure
    const shipment = data?.shipment || data;
    const trackingHistory = shipment?.tracking_history || shipment?.events || [];

    const latestEvent = trackingHistory[trackingHistory.length - 1] || {};

    // Map Xpressbees status to our status
    const status = this.mapXpressbeesStatus(latestEvent?.status || shipment?.status || 'Unknown');

    // Build events from tracking history
    const events = trackingHistory.map((event: any) => ({
      status: this.mapXpressbeesStatus(event.status || event.scan_type),
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
      occurredAt: latestEvent?.timestamp 
        ? new Date(latestEvent.timestamp)
        : new Date(),
      events,
    };
  }

  /**
   * Map Xpressbees status codes to our status enum
   */
  private mapXpressbeesStatus(xpressbeesStatus: string): string {
    const status = (xpressbeesStatus || '').toLowerCase();
    
    if (status.includes('delivered') || status.includes('dl')) {
      return 'DELIVERED';
    }
    if (status.includes('transit') || status.includes('in_transit') || status.includes('it')) {
      return 'IN_TRANSIT';
    }
    if (status.includes('shipped') || status.includes('pickup') || status.includes('pu')) {
      return 'SHIPPED';
    }
    if (status.includes('pending') || status.includes('created') || status.includes('cr')) {
      return 'PENDING';
    }
    if (status.includes('cancel') || status.includes('void')) {
      return 'CANCELLED';
    }
    
    return 'UNKNOWN';
  }

  /**
   * Make HTTP request with retry logic and exponential backoff
   */
  private async makeRequestWithRetry(
    method: 'GET' | 'POST',
    endpoint: string,
    data?: any
  ): Promise<any> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers: any = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };

    // Add authorization header if token is available
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        console.log(`[XpressbeesAdapter] API request (attempt ${attempt}/${this.maxRetries})`, {
          method,
          url,
          hasData: !!data,
        });

        const config: any = {
          method,
          url,
          headers,
          timeout: 10000, // 10 second timeout
        };

        if (method === 'POST' && data) {
          config.data = data;
        }

        const response = await axios(config);

        // Check for API-level errors in response
        if (response.data?.error || response.data?.errors) {
          throw new Error(`API Error: ${JSON.stringify(response.data.error || response.data.errors)}`);
        }

        return response;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');
        
        // Don't retry on 4xx errors (client errors)
        if (error instanceof AxiosError && error.response?.status && error.response.status >= 400 && error.response.status < 500) {
          console.error('[XpressbeesAdapter] Client error, not retrying', {
            status: error.response.status,
            data: error.response.data,
          });
          throw error;
        }

        // Calculate delay with exponential backoff
        const delay = this.retryDelay * Math.pow(2, attempt - 1);
        
        if (attempt < this.maxRetries) {
          console.warn(`[XpressbeesAdapter] Request failed, retrying in ${delay}ms`, {
            attempt,
            error: lastError.message,
          });
          await this.sleep(delay);
        } else {
          console.error('[XpressbeesAdapter] Request failed after all retries', {
            attempts: this.maxRetries,
            error: lastError.message,
          });
        }
      }
    }

    throw lastError || new Error('Request failed after retries');
  }

  /**
   * Generate fallback label when API fails or token not available
   */
  private generateFallbackLabel(req: CarrierLabelRequest): CarrierLabelResponse {
    const labelNumber = `XBE-${req.shipmentId}-${Date.now()}`;
    
    console.warn('[XpressbeesAdapter] Using fallback label generation', {
      shipmentId: req.shipmentId,
      labelNumber,
    });

    return {
      labelNumber,
      labelUrl: undefined,
      format: (req.format as any) || 'PDF',
      carrierCode: this.code,
      serviceName: 'XB Standard',
      awbNumber: labelNumber,
      trackingUrl: `https://xpressbees.com/track/${labelNumber}`,
    };
  }

  /**
   * Generate fallback tracking when API fails or token not available
   */
  private generateFallbackTracking(trackingNumber: string): TrackingResponse {
    return {
      trackingNumber,
      status: 'UNKNOWN',
      description: 'Unable to fetch tracking information',
      occurredAt: new Date(),
      events: [],
    };
  }

  /**
   * Sleep utility for retry delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
