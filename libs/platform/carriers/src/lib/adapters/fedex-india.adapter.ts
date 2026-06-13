import { 
  CarrierAdapter, 
  CarrierLabelRequest, 
  CarrierLabelResponse, 
  TrackingResponse,
} from '../adapter.interface';
import axios, { AxiosError } from 'axios';

/**
 * FedEx India Carrier Adapter
 * 
 * Implements integration with FedEx India API.
 * FedEx is a global logistics provider with strong presence in India.
 * 
 * API Documentation: https://developer.fedex.com/api/en-in
 */
export class FedExIndiaAdapter implements CarrierAdapter {
  code = 'FEDEX_INDIA';
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly accountNumber: string;
  private readonly baseUrl: string;
  private readonly maxRetries: number = 3;
  private readonly retryDelay: number = 1000;
  private accessToken: string | null = null;
  private tokenExpiry: Date | null = null;

  constructor(
    clientId: string, 
    clientSecret: string, 
    accountNumber: string,
    baseUrl: string = 'https://apis.fedex.com'
  ) {
    if (!clientId || !clientSecret || !accountNumber) {
      throw new Error('FedEx India client ID, client secret, and account number are required');
    }
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.accountNumber = accountNumber;
    this.baseUrl = baseUrl;
    console.log('[FedExIndiaAdapter] Initialized', { 
      baseUrl, 
      hasClientId: !!clientId, 
      hasClientSecret: !!clientSecret,
      hasAccountNumber: !!accountNumber,
    });
  }

  async generateLabel(req: CarrierLabelRequest): Promise<CarrierLabelResponse> {
    console.log('[FedExIndiaAdapter] generateLabel request', {
      shipmentId: req.shipmentId,
      trackingNumber: req.trackingNumber,
      format: req.format,
      hasDeliveryAddress: !!req.deliveryAddress,
      packageWeight: req.packageDetails?.weight,
    });

    if (!req.deliveryAddress) {
      throw new Error('Delivery address is required for FedEx India label generation');
    }

    if (!req.packageDetails?.weight) {
      throw new Error('Package weight is required for FedEx India label generation');
    }

    try {
      await this.ensureAuthenticated();
      const payload = this.buildLabelPayload(req);
      const response = await this.makeRequestWithRetry('POST', '/ship/v1/shipments', payload);
      const labelData = this.parseLabelResponse(response.data, req);

      console.log('[FedExIndiaAdapter] generateLabel success', {
        shipmentId: req.shipmentId,
        labelNumber: labelData.labelNumber,
        awbNumber: labelData.awbNumber,
      });

      return labelData;
    } catch (error) {
      console.error('[FedExIndiaAdapter] generateLabel failed', {
        shipmentId: req.shipmentId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return this.generateFallbackLabel(req);
    }
  }

  async trackShipment(trackingNumber: string): Promise<TrackingResponse> {
    console.log('[FedExIndiaAdapter] trackShipment request', { trackingNumber });

    if (!trackingNumber) {
      throw new Error('Tracking number is required');
    }

    try {
      await this.ensureAuthenticated();
      const payload = {
        trackingInfo: [{
          trackingNumberInfo: {
            trackingNumber,
          },
        }],
      };

      const response = await this.makeRequestWithRetry('POST', '/track/v1/trackingnumbers', payload);
      const trackingData = this.parseTrackingResponse(response.data, trackingNumber);

      console.log('[FedExIndiaAdapter] trackShipment success', {
        trackingNumber,
        status: trackingData.status,
        eventCount: trackingData.events.length,
      });

      return trackingData;
    } catch (error) {
      console.error('[FedExIndiaAdapter] trackShipment failed', {
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
    console.log('[FedExIndiaAdapter] cancelShipment request', { trackingNumber, reason });

    try {
      await this.ensureAuthenticated();
      const payload = {
        trackingNumber,
        cancellationReason: reason || 'Cancelled by customer',
      };

      await this.makeRequestWithRetry('POST', '/ship/v1/shipments/cancel', payload);
      console.log('[FedExIndiaAdapter] cancelShipment success', { trackingNumber });
      return true;
    } catch (error) {
      console.error('[FedExIndiaAdapter] cancelShipment failed', {
        trackingNumber,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return false;
    }
  }

  async voidLabel(labelNumber: string): Promise<boolean> {
    console.log('[FedExIndiaAdapter] voidLabel request', { labelNumber });

    try {
      await this.ensureAuthenticated();
      await this.makeRequestWithRetry('POST', `/ship/v1/shipments/${encodeURIComponent(labelNumber)}/void`);
      console.log('[FedExIndiaAdapter] voidLabel success', { labelNumber });
      return true;
    } catch (error) {
      console.error('[FedExIndiaAdapter] voidLabel failed', {
        labelNumber,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return false;
    }
  }

  private async ensureAuthenticated(): Promise<void> {
    if (this.accessToken && this.tokenExpiry && new Date() < this.tokenExpiry) {
      return;
    }

    console.log('[FedExIndiaAdapter] Authenticating to get access token');

    try {
      const response = await axios.post(
        `${this.baseUrl}/oauth/token`,
        new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: this.clientId,
          client_secret: this.clientSecret,
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

      console.log('[FedExIndiaAdapter] Authentication successful', {
        tokenExpiry: this.tokenExpiry,
      });
    } catch (error) {
      console.error('[FedExIndiaAdapter] Authentication failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw new Error('Failed to authenticate with FedEx India API');
    }
  }

  private buildLabelPayload(req: CarrierLabelRequest): any {
    const delivery = req.deliveryAddress!;
    const pickup = req.pickupAddress;
    const pkg = req.packageDetails!;

    return {
      labelResponseOptions: req.format || 'PDF',
      requestedShipment: {
        shipper: pickup ? {
          contact: {
            personName: pickup.name,
            phoneNumber: pickup.phone,
          },
          address: {
            streetLines: [pickup.addressLine1, pickup.addressLine2].filter(Boolean),
            city: pickup.city,
            stateOrProvinceCode: pickup.state,
            postalCode: pickup.pincode,
            countryCode: pickup.country || 'IN',
          },
        } : undefined,
        recipients: [{
          contact: {
            personName: delivery.name,
            phoneNumber: delivery.phone,
          },
          address: {
            streetLines: [delivery.addressLine1, delivery.addressLine2].filter(Boolean),
            city: delivery.city,
            stateOrProvinceCode: delivery.state,
            postalCode: delivery.pincode,
            countryCode: delivery.country || 'IN',
          },
        }],
        shipDatestamp: new Date().toISOString().split('T')[0],
        serviceType: 'STANDARD_OVERNIGHT',
        packagingType: 'YOUR_PACKAGING',
        pickupType: 'USE_SCHEDULED_PICKUP',
        blockInsightVisibility: false,
        shippingChargesPayment: {
          paymentType: 'SENDER',
        },
        labelSpecification: {
          imageType: req.format === 'ZPL' ? 'ZPL' : 'PDF',
          labelStockType: 'PAPER_4X6',
        },
        requestedPackageLineItems: [{
          weight: {
            value: (pkg.weight / 1000).toFixed(2),
            units: 'KG',
          },
          dimensions: (pkg.length && pkg.width && pkg.height) ? {
            length: pkg.length.toString(),
            width: pkg.width.toString(),
            height: pkg.height.toString(),
            units: 'CM',
          } : undefined,
          ...(pkg.codAmount && {
            specialServicesRequested: {
              specialServiceTypes: ['COD'],
              codDetail: {
                codCollectionAmount: {
                  amount: pkg.codAmount.toString(),
                  currency: 'INR',
                },
              },
            },
          }),
        }],
        ...(req.orderNumber && {
          customerReferences: [{
            customerReferenceType: 'CUSTOMER_REFERENCE',
            value: req.orderNumber,
          }],
        }),
      },
      accountNumber: {
        value: this.accountNumber,
      },
    };
  }

  private parseLabelResponse(data: any, req: CarrierLabelRequest): CarrierLabelResponse {
    const output = data?.output || data;
    const transactionShipments = output?.transactionShipments || [];
    const shipment = transactionShipments[0] || {};
    const masterTrackingNumber = shipment?.masterTrackingNumber || shipment?.trackingNumber;
    const labelUrl = shipment?.label?.url || shipment?.labelUrl;

    const labelNumber = masterTrackingNumber || `FEDEX-${req.shipmentId}-${Date.now()}`;

    return {
      labelNumber,
      labelUrl: labelUrl || undefined,
      format: (req.format as any) || 'PDF',
      carrierCode: this.code,
      serviceName: shipment?.serviceType || 'FedEx Standard Overnight',
      awbNumber: masterTrackingNumber || labelNumber,
      trackingUrl: masterTrackingNumber ? `https://www.fedex.com/apps/fedextrack/?tracknumbers=${masterTrackingNumber}` : undefined,
      estimatedDelivery: shipment?.estimatedDeliveryDate 
        ? new Date(shipment.estimatedDeliveryDate)
        : undefined,
    };
  }

  private parseTrackingResponse(data: any, trackingNumber: string): TrackingResponse {
    const output = data?.output || data;
    const completeTrackResults = output?.completeTrackResults || [];
    const result = completeTrackResults[0] || {};
    const trackResults = result?.trackResults || [];
    const trackResult = trackResults[0] || {};
    const scanEvents = trackResult?.scanEvents || [];

    const latestEvent = scanEvents[scanEvents.length - 1] || {};
    const status = this.mapFedExStatus(trackResult?.latestStatusDetail?.code || latestEvent?.eventType || 'Unknown');

    const events = scanEvents.map((event: any) => ({
      status: this.mapFedExStatus(event.eventType || event.status),
      subStatus: event.eventDescription || event.scanLocation?.city,
      description: event.eventDescription || event.status,
      location: event.scanLocation?.city || event.scanLocation?.stateOrProvinceCode,
      occurredAt: new Date(event.date || event.timestamp || Date.now()),
      eventCode: event.eventType,
    }));

    return {
      trackingNumber,
      status,
      subStatus: latestEvent?.eventDescription,
      description: latestEvent?.eventDescription || trackResult?.latestStatusDetail?.description,
      location: latestEvent?.scanLocation?.city || trackResult?.latestStatusDetail?.scanLocation?.city,
      occurredAt: latestEvent?.date ? new Date(latestEvent.date) : new Date(),
      events,
    };
  }

  private mapFedExStatus(status: string): string {
    const s = (status || '').toLowerCase();
    if (s.includes('delivered') || s.includes('dl')) return 'DELIVERED';
    if (s.includes('transit') || s.includes('it') || s.includes('on_vehicle')) return 'IN_TRANSIT';
    if (s.includes('picked_up') || s.includes('pu')) return 'SHIPPED';
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

    if (this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`;
    }

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        console.log(`[FedExIndiaAdapter] API request (attempt ${attempt}/${this.maxRetries})`, {
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

        if (response.data?.errors) {
          throw new Error(`API Error: ${JSON.stringify(response.data.errors)}`);
        }

        return response;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');
        
        if (error instanceof AxiosError && error.response?.status === 401) {
          this.accessToken = null;
          this.tokenExpiry = null;
          await this.ensureAuthenticated();
          if (attempt < this.maxRetries) {
            continue;
          }
        }
        
        if (error instanceof AxiosError && error.response?.status && error.response.status >= 400 && error.response.status < 500) {
          console.error('[FedExIndiaAdapter] Client error, not retrying', {
            status: error.response.status,
            data: error.response.data,
          });
          throw error;
        }

        const delay = this.retryDelay * Math.pow(2, attempt - 1);
        
        if (attempt < this.maxRetries) {
          console.warn(`[FedExIndiaAdapter] Request failed, retrying in ${delay}ms`, {
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
    const labelNumber = `FEDEX-${req.shipmentId}-${Date.now()}`;
    
    console.warn('[FedExIndiaAdapter] Using fallback label generation', {
      shipmentId: req.shipmentId,
      labelNumber,
    });

    return {
      labelNumber,
      labelUrl: undefined,
      format: (req.format as any) || 'PDF',
      carrierCode: this.code,
      serviceName: 'FedEx Standard Overnight',
      awbNumber: labelNumber,
      trackingUrl: `https://www.fedex.com/apps/fedextrack/?tracknumbers=${labelNumber}`,
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
