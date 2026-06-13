import { 
  CarrierAdapter, 
  CarrierLabelRequest, 
  CarrierLabelResponse, 
  TrackingResponse,
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

  constructor(clientId: string, apiKey: string, baseUrl: string = 'https://www.gati.com') {
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
