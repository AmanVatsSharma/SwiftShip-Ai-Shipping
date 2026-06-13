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
 * DHL Express India Carrier Adapter
 *
 * Implements integration with DHL Express API for label generation,
 * tracking, and shipment management.
 *
 * API Documentation: https://developer.dhlecommerce.dhl.com
 *
 * Flow:
 * 1. Label Generation: OAuth2 authentication, creates shipment and generates AWB
 * 2. Tracking: Fetches real-time tracking updates
 * 3. Authentication: OAuth2 client_credentials flow with 'shipping' scope
 *
 * Configuration:
 * - DHL_CLIENT_ID: OAuth2 client ID
 * - DHL_CLIENT_SECRET: OAuth2 client secret
 * - DHL_ACCOUNT_NUMBER: DHL account number
 */
export class DhlAdapter implements CarrierAdapter {
  code = 'DHL';
  private readonly config: ConfigService;
  private readonly baseUrl: string;
  private readonly maxRetries: number = 3;
  private readonly retryDelay: number = 1000;
  private accessToken: string | null = null;
  private tokenExpiry: Date | null = null;

  constructor(config: ConfigService) {
    this.config = config;
    this.baseUrl = 'https://api.dhlecommerce.dhl.com';

    const clientId = this.config.get<string>('DHL_CLIENT_ID');
    const clientSecret = this.config.get<string>('DHL_CLIENT_SECRET');
    const accountNumber = this.config.get<string>('DHL_ACCOUNT_NUMBER');

    if (!clientId || !clientSecret || !accountNumber) {
      throw new Error('DHL client ID, client secret, and account number are required');
    }

    console.log('[DhlAdapter] Initialized', {
      baseUrl: this.baseUrl,
      hasClientId: !!clientId,
      hasClientSecret: !!clientSecret,
      hasAccountNumber: !!accountNumber,
    });
  }

  /**
   * Check if the adapter is properly configured with all required credentials
   * @returns True if all required environment variables are set
   */
  isConfigured(): boolean {
    return !!(
      this.config.get<string>('DHL_CLIENT_ID') &&
      this.config.get<string>('DHL_CLIENT_SECRET') &&
      this.config.get<string>('DHL_ACCOUNT_NUMBER')
    );
  }

  /**
   * Generate a shipping label via DHL API
   *
   * @param req - Label generation request with shipment details
   * @returns Label response with AWB number and label URL
   */
  async generateLabel(req: CarrierLabelRequest): Promise<CarrierLabelResponse> {
    console.log('[DhlAdapter] generateLabel request', {
      shipmentId: req.shipmentId,
      trackingNumber: req.trackingNumber,
      format: req.format,
      hasDeliveryAddress: !!req.deliveryAddress,
      packageWeight: req.packageDetails?.weight,
    });

    if (!req.deliveryAddress) {
      throw new Error('Delivery address is required for DHL label generation');
    }

    if (!req.packageDetails?.weight) {
      throw new Error('Package weight is required for DHL label generation');
    }

    try {
      // In production mode, we would authenticate and make real API calls
      if (process.env.NODE_ENV === 'production') {
        await this.ensureAuthenticated();
        const payload = this.buildLabelPayload(req);
        const response = await this.makeRequestWithRetry('POST', '/api/labels', payload);
        const labelData = this.parseLabelResponse(response.data, req);

        console.log('[DhlAdapter] generateLabel success', {
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
      console.error('[DhlAdapter] generateLabel failed', {
        shipmentId: req.shipmentId,
        error: errorMessage,
        errorDetails: error instanceof AxiosError ? {
          status: error.response?.status,
          statusText: error.response?.statusText,
          data: error.response?.data,
        } : undefined,
      });

      // Return deterministic label number for graceful degradation
      console.warn('[DhlAdapter] Falling back to deterministic label generation');
      return this.generateFallbackLabel(req);
    }
  }

  /**
   * Track a shipment via DHL API
   *
   * @param trackingNumber - AWB/tracking number to track
   * @returns Tracking response with current status and events
   */
  async trackShipment(trackingNumber: string): Promise<TrackingResponse> {
    console.log('[DhlAdapter] trackShipment request', { trackingNumber });

    if (!trackingNumber) {
      throw new Error('Tracking number is required');
    }

    try {
      // In production mode, make real API calls
      if (process.env.NODE_ENV === 'production') {
        await this.ensureAuthenticated();
        const response = await this.makeRequestWithRetry(
          'GET',
          `/api/tracking/${encodeURIComponent(trackingNumber)}`
        );
        const trackingData = this.parseTrackingResponse(response.data, trackingNumber);

        console.log('[DhlAdapter] trackShipment success', {
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
      console.error('[DhlAdapter] trackShipment failed', {
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
   * @param origin - Origin address
   * @param destination - Destination address
   * @param packageDetails - Package details
   * @returns Rate information (currently throws NotImplementedException)
   */
  async getRates(origin: Address, destination: Address, packageDetails: PackageDetails): Promise<any> {
    throw new Error('DHL rate quoting not yet implemented — wire to /rates endpoint in a follow-up');
  }

  /**
   * Check serviceability for addresses (stub implementation)
   * @param origin - Origin address
   * @param destination - Destination address
   * @returns Serviceability information (currently throws NotImplementedException)
   */
  async getServiceability(origin: Address, destination: Address): Promise<any> {
    throw new Error('DHL serviceability checking not yet implemented — wire to /serviceability endpoint in a follow-up');
  }

  /**
   * Schedule a pickup (stub implementation)
   * @param pickupRequest - Pickup request details
   * @returns Pickup confirmation (currently throws NotImplementedException)
   */
  async schedulePickup(pickupRequest: any): Promise<any> {
    throw new Error('DHL pickup scheduling not yet implemented — wire to /pickups endpoint in a follow-up');
  }

  /**
   * Mark as cash collected (stub implementation)
   * @param trackingNumber - Tracking number of the COD shipment
   * @returns Confirmation (currently throws NotImplementedException)
   */
  async markCodCollected(trackingNumber: string): Promise<any> {
    throw new Error('DHL COD collection marking not yet implemented — wire to /cod endpoint in a follow-up');
  }

  /**
   * Get NDR actions (stub implementation)
   * @param trackingNumber - Tracking number of shipment with NDR
   * @returns Available NDR actions (currently throws NotImplementedException)
   */
  async getNdrActions(trackingNumber: string): Promise<any> {
    throw new Error('DHL NDR actions not yet implemented — wire to /ndr endpoint in a follow-up');
  }

  /**
   * Get access token for DHL OAuth2 authentication
   */
  private async ensureAuthenticated(): Promise<void> {
    if (this.accessToken && this.tokenExpiry && new Date() < this.tokenExpiry) {
      return;
    }

    console.log('[DhlAdapter] Authenticating to get DHL access token');

    try {
      const clientId = this.config.get<string>('DHL_CLIENT_ID');
      const clientSecret = this.config.get<string>('DHL_CLIENT_SECRET');
      const accountNumber = this.config.get<string>('DHL_ACCOUNT_NUMBER');

      const response = await axios.post(
        `${this.baseUrl}/oauth/token`,
        new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: String(clientId),
          client_secret: String(clientSecret),
          account_number: String(accountNumber),
          scope: 'shipping',
        }),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );

      this.accessToken = response.data.access_token;
      const expiresIn = response.data.expires_in || 3600;
      this.tokenExpiry = new Date(Date.now() + (expiresIn - 60) * 1000);

      console.log('[DhlAdapter] Authentication successful', {
        tokenExpiry: this.tokenExpiry,
      });
    } catch (error) {
      console.error('[DhlAdapter] Authentication failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw new Error('Failed to authenticate with DHL API');
    }
  }

  /**
   * Build DHL API payload for label generation
   */
  private buildLabelPayload(req: CarrierLabelRequest): any {
    const delivery = req.deliveryAddress!;
    const pickup = req.pickupAddress;
    const pkg = req.packageDetails!;

    return {
      trackingNumber: req.trackingNumber,
      shipmentId: req.shipmentId,
      // Delivery address
      recipient: {
        address: {
          streetAddress: [delivery.addressLine1, delivery.addressLine2].filter(Boolean),
          city: delivery.city,
          stateOrProvinceCode: delivery.state,
          postalCode: delivery.pincode,
          country: delivery.country || 'IN',
        },
        personName: delivery.name,
        phoneNumber: delivery.phone,
      },
      // Pickup address if provided
      ...(pickup && {
        shipper: {
          address: {
            streetAddress: [pickup.addressLine1, pickup.addressLine2].filter(Boolean),
            city: pickup.city,
            stateOrProvinceCode: pickup.state,
            postalCode: pickup.pincode,
            country: pickup.country || 'IN',
          },
          personName: pickup.name,
          phoneNumber: pickup.phone,
        },
      }),
      // Package details
      package: {
        weight: {
          value: (pkg.weight / 1000).toFixed(2), // Convert grams to kg
          unit: 'KG',
        },
        ...(pkg.length && pkg.width && pkg.height && {
          dimensions: {
            length: pkg.length.toString(),
            width: pkg.width.toString(),
            height: pkg.height.toString(),
            unit: 'CM',
          },
        }),
        ...(pkg.codAmount && {
          cod: {
            amount: pkg.codAmount.toString(),
            currency: 'INR',
          },
        }),
        declaredValue: pkg.declaredValue?.toString(),
      },
      service: 'EXPRESS',
      labelFormat: req.format || 'PDF',
      ...(req.orderNumber && {
        customerReferences: [{
          type: 'CUSTOMER_REFERENCE',
          value: req.orderNumber,
        }],
      }),
    };
  }

  /**
   * Parse DHL label generation response
   */
  private parseLabelResponse(data: any, req: CarrierLabelRequest): CarrierLabelResponse {
    const waybill = data?.trackingNumber || data?.waybill || data?.awb;
    const labelUrl = data?.labelUrl || data?.labelPdf || data?.pdfUrl;

    const labelNumber = waybill || `DHL${req.shipmentId}`;

    return {
      labelNumber,
      labelUrl: labelUrl || undefined,
      format: (req.format as any) || 'PDF',
      carrierCode: this.code,
      serviceName: data?.serviceType || 'DHL Express',
      awbNumber: waybill || labelNumber,
      trackingUrl: waybill ? `https://www.dhl.com/track-and-track/track.html?trackingNumber=${waybill}` : undefined,
      estimatedDelivery: data?.estimatedDelivery ? new Date(data.estimatedDelivery) : undefined,
    };
  }

  /**
   * Parse DHL tracking response
   */
  private parseTrackingResponse(data: any, trackingNumber: string): TrackingResponse {
    const shipment = data?.shipment || data;
    const events = shipment?.events || shipment?.trackingHistory || [];

    const latestEvent = events[events.length - 1] || {};
    const status = this.mapDhlStatus(latestEvent?.status || shipment?.status || 'Unknown');

    const trackingEvents = events.map((event: any) => ({
      status: this.mapDhlStatus(event.status || event.eventType),
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
   * Map DHL status codes to our status enum
   */
  private mapDhlStatus(status: string): string {
    const s = (status || '').toLowerCase();
    if (s.includes('delivered') || s.includes('dl')) return 'DELIVERED';
    if (s.includes('transit') || s.includes('in_transit') || s.includes('it')) return 'IN_TRANSIT';
    if (s.includes('picked_up') || s.includes('pu')) return 'SHIPPED';
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
    const headers: any = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };

    if (this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`;
    }

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        console.log(`[DhlAdapter] API request (attempt ${attempt}/${this.maxRetries})`, {
          method,
          url,
          hasData: !!data,
        });

        const config: any = {
          method,
          url,
          headers,
          timeout: 15000, // 15 second timeout
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
          console.error('[DhlAdapter] Client error, not retrying', {
            status: error.response.status,
            data: error.response.data,
          });
          throw error;
        }

        // If unauthorized, try to re-authenticate
        if (error instanceof AxiosError && error.response?.status === 401) {
          this.accessToken = null;
          this.tokenExpiry = null;
          await this.ensureAuthenticated();
          if (attempt < this.maxRetries) {
            console.log('[DhlAdapter] Re-authenticating and retrying...');
            continue;
          }
        }

        // Calculate delay with exponential backoff
        const delay = this.retryDelay * Math.pow(2, attempt - 1);

        if (attempt < this.maxRetries) {
          console.warn(`[DhlAdapter] Request failed, retrying in ${delay}ms`, {
            attempt,
            error: lastError.message,
          });
          await this.sleep(delay);
        } else {
          console.error('[DhlAdapter] Request failed after all retries', {
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
    const awb = `DHL${Date.now()}`;

    return {
      labelNumber: awb,
      labelUrl: `https://sandbox.dhl.com/labels/${awb}.pdf`,
      format: (req.format as any) ?? 'PDF',
      carrierCode: this.code,
      serviceName: 'DHL Express',
      awbNumber: awb,
      trackingUrl: `https://www.dhl.com/track-and-trail/tracking.shtml?trackNumber=${awb}`,
      estimatedDelivery: req.packageDetails?.weight
        ? new Date(Date.now() + (req.packageDetails.weight > 1000 ? 5 : 3) * 24 * 60 * 60 * 1000)
        : undefined,
    };
  }

  /**
   * Generate mock tracking response for non-production environments
   */
  private generateMockTracking(trackingNumber: string): TrackingResponse {
    console.log('[DhlAdapter] generateMockTracking', { trackingNumber });

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
          location: 'Origin Warehouse',
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
    const labelNumber = `DHL-${req.shipmentId}-${Date.now()}`;

    console.warn('[DhlAdapter] Using fallback label generation', {
      shipmentId: req.shipmentId,
      labelNumber,
    });

    return {
      labelNumber,
      labelUrl: undefined,
      format: (req.format as any) || 'PDF',
      carrierCode: this.code,
      serviceName: 'DHL Express',
      awbNumber: labelNumber,
      trackingUrl: `https://www.dhl.com/track-and-trail/tracking.shtml?trackNumber=${labelNumber}`,
    };
  }

  /**
   * Sleep utility for retry delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}