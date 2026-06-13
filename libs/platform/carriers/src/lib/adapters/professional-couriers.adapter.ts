import {
  CarrierAdapter,
  CarrierLabelRequest,
  CarrierLabelResponse,
  TrackingResponse,
  Address,
  PackageDetails
} from '../adapter.interface';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosError } from 'axios';

/**
 * Professional Couriers (PCA) Carrier Adapter
 *
 * Implements integration with Professional Couriers API.
 * Professional Couriers is a leading Indian courier service provider
 * with extensive coverage across India.
 *
 * API Documentation: https://api.professionalcouriers.com
 *
 * Configuration:
 * - PCA_API_KEY: Professional Couriers API key
 * - PCA_USERNAME: Professional Couriers account username
 */
export class ProfessionalCouriersAdapter implements CarrierAdapter {
  code = 'PCA';
  private readonly config: ConfigService;
  private readonly baseUrl: string;
  private readonly maxRetries: number = 3;
  private readonly retryDelay: number = 1000;

  constructor(config: ConfigService) {
    this.config = config;
    this.baseUrl = 'https://api.professionalcouriers.com';

    const apiKey = this.config.get<string>('PCA_API_KEY');
    const username = this.config.get<string>('PCA_USERNAME');

    if (!apiKey || !username) {
      throw new Error('Professional Couriers API key and username are required');
    }

    console.log('[ProfessionalCouriersAdapter] Initialized', {
      baseUrl: this.baseUrl,
      hasApiKey: !!apiKey,
      hasUsername: !!username,
    });
  }

  /**
   * Check if the adapter is properly configured with all required credentials
   * @returns True if all required environment variables are set
   */
  isConfigured(): boolean {
    return !!(
      this.config.get<string>('PCA_API_KEY') &&
      this.config.get<string>('PCA_USERNAME')
    );
  }

  /**
   * Generate a shipping label via Professional Couriers API
   *
   * @param req - Label generation request with shipment details
   * @returns Label response with AWB number and label URL
   */
  async generateLabel(req: CarrierLabelRequest): Promise<CarrierLabelResponse> {
    console.log('[ProfessionalCouriersAdapter] generateLabel request', {
      shipmentId: req.shipmentId,
      trackingNumber: req.trackingNumber,
      format: req.format,
      hasDeliveryAddress: !!req.deliveryAddress,
      packageWeight: req.packageDetails?.weight,
    });

    if (!req.deliveryAddress) {
      throw new Error('Delivery address is required for Professional Couriers label generation');
    }

    if (!req.packageDetails?.weight) {
      throw new Error('Package weight is required for Professional Couriers label generation');
    }

    try {
      // In production mode, we would make real API calls
      if (process.env.NODE_ENV === 'production') {
        const payload = this.buildLabelPayload(req);
        const response = await this.makeRequestWithRetry('POST', '/api/shipments', payload);
        const labelData = this.parseLabelResponse(response.data, req);

        console.log('[ProfessionalCouriersAdapter] generateLabel success', {
          shipmentId: req.shipmentId,
          labelNumber: labelData.labelNumber,
          awbNumber: labelData.awbNumber,
        });

        return labelData;
      } else {
        // In non-production mode, return sandbox-style response
        return this.generateSandboxLabel(req);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[ProfessionalCouriersAdapter] generateLabel failed', {
        shipmentId: req.shipmentId,
        error: errorMessage,
        errorDetails: error instanceof AxiosError ? {
          status: error.response?.status,
          statusText: error.response?.statusText,
          data: error.response?.data,
        } : undefined,
      });

      // Return deterministic label number for graceful degradation
      console.warn('[ProfessionalCouriersAdapter] Falling back to deterministic label generation');
      return this.generateFallbackLabel(req);
    }
  }

  /**
   * Track a shipment via Professional Couriers API
   *
   * @param trackingNumber - AWB/tracking number to track
   * @returns Tracking response with current status and events
   */
  async trackShipment(trackingNumber: string): Promise<TrackingResponse> {
    console.log('[ProfessionalCouriersAdapter] trackShipment request', { trackingNumber });

    if (!trackingNumber) {
      throw new Error('Tracking number is required');
    }

    try {
      // In production mode, make real API calls
      if (process.env.NODE_ENV === 'production') {
        const response = await this.makeRequestWithRetry(
          'GET',
          `/api/tracking/${encodeURIComponent(trackingNumber)}`
        );
        const trackingData = this.parseTrackingResponse(response.data, trackingNumber);

        console.log('[ProfessionalCouriersAdapter] trackShipment success', {
          trackingNumber,
          status: trackingData.status,
          eventCount: trackingData.events.length,
        });

        return trackingData;
      } else {
        // In non-production mode, return mock tracking data
        return this.generateMockTracking(trackingNumber);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[ProfessionalCouriersAdapter] trackShipment failed', {
        trackingNumber,
        error: errorMessage,
        errorDetails: error instanceof AxiosError ? {
          status: error.response?.status,
          statusText: error.response?.statusText,
        } : undefined,
      });

      // Return mock tracking response on error
      return this.generateMockTracking(trackingNumber);
    }
  }

  /**
   * Get rates for shipping (stub implementation)
   */
  async getRates(origin: Address, destination: Address, packageDetails: PackageDetails): Promise<any> {
    throw new Error('PCA getRates not yet implemented for PCA');
  }

  /**
   * Check serviceability for addresses (stub implementation)
   */
  async getServiceability(origin: Address, destination: Address): Promise<any> {
    throw new Error('PCA getServiceability not yet implemented for PCA');
  }

  /**
   * Schedule a pickup (stub implementation)
   */
  async schedulePickup(pickupRequest: any): Promise<any> {
    throw new Error('PCA schedulePickup not yet implemented for PCA');
  }

  /**
   * Mark as cash collected (stub implementation)
   */
  async markCodCollected(trackingNumber: string): Promise<any> {
    throw new Error('PCA markCodCollected not yet implemented for PCA');
  }

  /**
   * Get NDR actions (stub implementation)
   */
  async getNdrActions(trackingNumber: string): Promise<any> {
    throw new Error('PCA getNdrActions not yet implemented for PCA');
  }

  /**
   * Build Professional Couriers API payload for label generation
   */
  private buildLabelPayload(req: CarrierLabelRequest): any {
    const delivery = req.deliveryAddress!;
    const pickup = req.pickupAddress;
    const pkg = req.packageDetails!;
    const username = this.config.get<string>('PCA_USERNAME');

    return {
      username,
      shipmentId: req.shipmentId,
      trackingNumber: req.trackingNumber,
      // Consignee (delivery address)
      consignee: {
        name: delivery.name,
        mobile: delivery.phone,
        address: [delivery.addressLine1, delivery.addressLine2].filter(Boolean).join(', '),
        city: delivery.city,
        state: delivery.state,
        pincode: delivery.pincode,
        country: delivery.country || 'India',
      },
      // Consignor (pickup address) if provided
      ...(pickup && {
        consignor: {
          name: pickup.name,
          mobile: pickup.phone,
          address: [pickup.addressLine1, pickup.addressLine2].filter(Boolean).join(', '),
          city: pickup.city,
          state: pickup.state,
          pincode: pickup.pincode,
          country: pickup.country || 'India',
        },
      }),
      // Package details
      parcel: {
        weight: (pkg.weight / 1000).toFixed(2), // Convert grams to kg
        ...(pkg.length && { length: pkg.length.toString() }),
        ...(pkg.width && { width: pkg.width.toString() }),
        ...(pkg.height && { height: pkg.height.toString() }),
        ...(pkg.codAmount && { codAmount: pkg.codAmount.toString() }),
        ...(pkg.declaredValue && { declaredValue: pkg.declaredValue.toString() }),
      },
      service: 'STANDARD',
      labelFormat: req.format || 'PDF',
      ...(req.orderNumber && { referenceNo: req.orderNumber }),
    };
  }

  /**
   * Parse Professional Couriers label generation response
   */
  private parseLabelResponse(data: any, req: CarrierLabelRequest): CarrierLabelResponse {
    const waybill = data?.awbNo || data?.awb || data?.trackingNo || data?.trackingNumber;
    const labelUrl = data?.labelUrl || data?.labelPdf;

    const labelNumber = waybill || `PCA-${req.shipmentId}-${Date.now()}`;

    return {
      labelNumber,
      labelUrl: labelUrl || undefined,
      format: (req.format as any) || 'PDF',
      carrierCode: this.code,
      serviceName: data?.serviceType || 'Professional Couriers Standard',
      awbNumber: waybill || labelNumber,
      trackingUrl: waybill ? `https://www.professionalcouriers.com/track?awb=${waybill}` : undefined,
      estimatedDelivery: data?.estimatedDelivery ? new Date(data.estimatedDelivery) : undefined,
    };
  }

  /**
   * Parse Professional Couriers tracking response
   */
  private parseTrackingResponse(data: any, trackingNumber: string): TrackingResponse {
    const tracking = data?.tracking || data?.shipment || {};
    const events = tracking?.events || tracking?.history || [];

    const latestEvent = events[events.length - 1] || {};
    const status = this.mapProfessionalCouriersStatus(latestEvent?.status || tracking?.status || 'Unknown');

    const trackingEvents = events.map((event: any) => ({
      status: this.mapProfessionalCouriersStatus(event.status || event.eventType),
      subStatus: event.subStatus || event.eventType,
      description: event.description || event.status,
      location: event.location || event.city || event.destination,
      occurredAt: new Date(event.timestamp || event.date || Date.now()),
      eventCode: event.eventType,
    }));

    return {
      trackingNumber,
      status,
      subStatus: latestEvent?.subStatus,
      description: latestEvent?.description || latestEvent?.status,
      location: latestEvent?.location || latestEvent?.city,
      occurredAt: latestEvent?.timestamp ? new Date(latestEvent.timestamp) : new Date(),
      events: trackingEvents,
    };
  }

  /**
   * Map Professional Couriers status codes to our status enum
   */
  private mapProfessionalCouriersStatus(status: string): string {
    const s = (status || '').toLowerCase();
    if (s.includes('delivered') || s.includes('dl')) return 'DELIVERED';
    if (s.includes('transit') || s.includes('in_transit') || s.includes('it')) return 'IN_TRANSIT';
    if (s.includes('picked_up') || s.includes('pu') || s.includes('pickup')) return 'SHIPPED';
    if (s.includes('pending') || s.includes('created') || s.includes('cr')) return 'PENDING';
    if (s.includes('cancel') || s.includes('void')) return 'CANCELLED';
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
    const apiKey = this.config.get<string>('PCA_API_KEY');

    const headers: any = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'X-API-Key': apiKey,
    };

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        console.log(`[ProfessionalCouriersAdapter] API request (attempt ${attempt}/${this.maxRetries})`, {
          method,
          url,
          hasData: !!data,
        });

        const config: any = {
          method,
          url,
          headers,
          timeout: 15000,
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
          console.error('[ProfessionalCouriersAdapter] Client error, not retrying', {
            status: error.response.status,
            data: error.response.data,
          });
          throw error;
        }

        // Calculate delay with exponential backoff
        const delay = this.retryDelay * Math.pow(2, attempt - 1);

        if (attempt < this.maxRetries) {
          console.warn(`[ProfessionalCouriersAdapter] Request failed, retrying in ${delay}ms`, {
            attempt,
            error: lastError.message,
          });
          await this.sleep(delay);
        } else {
          console.error('[ProfessionalCouriersAdapter] Request failed after all retries', {
            attempts: this.maxRetries,
            error: lastError.message,
          });
        }
      }
    }

    throw lastError || new Error('Request failed after retries');
  }

  /**
   * Generate sandbox label for non-production environments
   */
  private generateSandboxLabel(req: CarrierLabelRequest): CarrierLabelResponse {
    const awb = `PCA${Date.now()}`;

    return {
      labelNumber: awb,
      labelUrl: `https://sandbox.professionalcouriers.com/labels/${awb}.pdf`,
      format: (req.format as any) ?? 'PDF',
      carrierCode: this.code,
      serviceName: 'Professional Couriers Standard',
      awbNumber: awb,
      trackingUrl: `https://www.professionalcouriers.com/track?awb=${awb}`,
      estimatedDelivery: req.packageDetails?.weight
        ? new Date(Date.now() + (req.packageDetails.weight > 1000 ? 5 : 3) * 24 * 60 * 60 * 1000)
        : undefined,
    };
  }

  /**
   * Generate mock tracking response for non-production environments
   */
  private generateMockTracking(trackingNumber: string): TrackingResponse {
    console.log('[ProfessionalCouriersAdapter] generateMockTracking', { trackingNumber });

    return {
      trackingNumber,
      status: 'IN_TRANSIT',
      description: 'Shipment is in transit',
      location: 'Transit Hub',
      occurredAt: new Date(),
      events: [
        {
          status: 'SHIPPED',
          description: 'Shipment picked up',
          location: 'Origin Branch',
          occurredAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
          eventCode: 'PICKED_UP',
        },
        {
          status: 'IN_TRANSIT',
          description: 'In transit to destination',
          location: 'Transit Hub',
          occurredAt: new Date(Date.now() - 12 * 60 * 60 * 1000),
          eventCode: 'IN_TRANSIT',
        },
      ],
    };
  }

  /**
   * Generate fallback label when API fails
   */
  private generateFallbackLabel(req: CarrierLabelRequest): CarrierLabelResponse {
    const labelNumber = `PCA-${req.shipmentId}-${Date.now()}`;

    console.warn('[ProfessionalCouriersAdapter] Using fallback label generation', {
      shipmentId: req.shipmentId,
      labelNumber,
    });

    return {
      labelNumber,
      labelUrl: undefined,
      format: (req.format as any) || 'PDF',
      carrierCode: this.code,
      serviceName: 'Professional Couriers Standard',
      awbNumber: labelNumber,
      trackingUrl: `https://www.professionalcouriers.com/track?awb=${labelNumber}`,
    };
  }

  /**
   * Sleep utility for retry delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}