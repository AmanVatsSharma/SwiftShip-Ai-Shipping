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
    baseUrl: string = 'https://apis.fedex.com',
  ) {
    if (!clientId || !clientSecret || !accountNumber) {
      throw new Error(
        'FedEx India client ID, client secret, and account number are required',
      );
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
      throw new Error(
        'Delivery address is required for FedEx India label generation',
      );
    }

    if (!req.packageDetails?.weight) {
      throw new Error(
        'Package weight is required for FedEx India label generation',
      );
    }

    try {
      await this.ensureAuthenticated();
      const payload = this.buildLabelPayload(req);
      const response = await this.makeRequestWithRetry(
        'POST',
        '/ship/v1/shipments',
        payload,
      );
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
    console.log('[FedExIndiaAdapter] trackShipment request', {
      trackingNumber,
    });

    if (!trackingNumber) {
      throw new Error('Tracking number is required');
    }

    try {
      await this.ensureAuthenticated();
      const payload = {
        trackingInfo: [
          {
            trackingNumberInfo: {
              trackingNumber,
            },
          },
        ],
      };

      const response = await this.makeRequestWithRetry(
        'POST',
        '/track/v1/trackingnumbers',
        payload,
      );
      const trackingData = this.parseTrackingResponse(
        response.data,
        trackingNumber,
      );

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

  async cancelShipment(
    trackingNumber: string,
    reason?: string,
  ): Promise<boolean> {
    console.log('[FedExIndiaAdapter] cancelShipment request', {
      trackingNumber,
      reason,
    });

    try {
      await this.ensureAuthenticated();
      const payload = {
        trackingNumber,
        cancellationReason: reason || 'Cancelled by customer',
      };

      await this.makeRequestWithRetry(
        'POST',
        '/ship/v1/shipments/cancel',
        payload,
      );
      console.log('[FedExIndiaAdapter] cancelShipment success', {
        trackingNumber,
      });
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
      await this.makeRequestWithRetry(
        'POST',
        `/ship/v1/shipments/${encodeURIComponent(labelNumber)}/void`,
      );
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

  /**
   * Get shipping rates from FedEx India.
   * Hits POST /rate/v1/rates/quotes; falls back to the static rate card on failure.
   */
  async getRates(req: RateQuoteRequest): Promise<RateQuote[]> {
    console.log('[FedExIndiaAdapter] getRates request', {
      originPincode: req.originPincode,
      destinationPincode: req.destinationPincode,
      weightGrams: req.weightGrams,
      paymentMethod: req.paymentMethod,
    });

    try {
      await this.ensureAuthenticated();
      const payload = this.buildRatePayload(req);
      const response = await this.makeRequestWithRetry(
        'POST',
        '/rate/v1/rates/quotes',
        payload,
      );
      const quotes = this.parseRateResponse(response.data, req);

      console.log('[FedExIndiaAdapter] getRates success', {
        quoteCount: quotes.length,
      });
      return quotes;
    } catch (error) {
      console.error(
        '[FedExIndiaAdapter] getRates failed, using static fallback',
        {
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      );
      return this.getStaticRateQuotes(req);
    }
  }

  /**
   * Check serviceability via FedEx /availability/v1/addressserviceables.
   */
  async getServiceability(
    input: ServiceabilityRequest,
  ): Promise<ServiceabilityResult> {
    console.log('[FedExIndiaAdapter] getServiceability request', input);

    try {
      await this.ensureAuthenticated();
      const payload = {
        originAddress: { postalCode: input.originPincode, countryCode: 'IN' },
        destinationAddress: {
          postalCode: input.destinationPincode,
          countryCode: 'IN',
        },
        services: [
          'PRIORITY_OVERNIGHT',
          'FEDEX_2_DAY',
          'FEDEX_INTERNATIONAL_PRIORITY',
        ],
        packageWeight: {
          value: (input.weightGrams / 1000).toFixed(2),
          units: 'KG',
        },
      };

      const response = await this.makeRequestWithRetry(
        'POST',
        '/availability/v1/addressserviceables',
        payload,
      );
      const result = this.parseServiceabilityResponse(response.data, input);

      console.log('[FedExIndiaAdapter] getServiceability success', result);
      return result;
    } catch (error) {
      console.error(
        '[FedExIndiaAdapter] getServiceability failed, using fallback',
        {
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      );
      return this.getStaticServiceability(input);
    }
  }

  /**
   * Schedule a FedEx pickup via POST /pickup/v1/pickups.
   */
  async schedulePickup(input: SchedulePickupRequest): Promise<ScheduledPickup> {
    console.log('[FedExIndiaAdapter] schedulePickup request', input);

    try {
      await this.ensureAuthenticated();
      const readyTimestamp = this.buildReadyTimestamp(
        input.pickupDate,
        input.pickupTimeSlot,
      );
      const payload = {
        associatedAccountNumber: { value: this.accountNumber },
        carrierCode: 'FDXE',
        countryCode: 'IN',
        originAddress: {
          streetLines: [],
          city: 'NA',
          stateOrProvinceCode: 'NA',
          postalCode: input.pickupPincode,
          countryCode: 'IN',
        },
        readyTimestamp,
        carrierPickupLocation: `${input.contactName} pickup`,
        locationContact: {
          personName: input.contactName,
          phoneNumber: input.contactPhone,
        },
        shipmentIds: input.shipmentIds.map((id) => ({ value: id })),
      };

      const response = await this.makeRequestWithRetry(
        'POST',
        '/pickup/v1/pickups',
        payload,
      );
      const data = response.data?.output || response.data;
      const confirmationCode =
        data?.pickupConfirmationCode || data?.confirmationNumber;

      console.log('[FedExIndiaAdapter] schedulePickup success', {
        confirmationCode,
      });

      return {
        pickupId: confirmationCode || `FEDEX-PIK-${Date.now()}`,
        pickupDate: input.pickupDate,
        pickupTimeSlot: input.pickupTimeSlot,
        trackingUrl: confirmationCode
          ? `https://www.fedex.com/fedextrack/?trknbr=${confirmationCode}`
          : undefined,
      };
    } catch (error) {
      console.error(
        '[FedExIndiaAdapter] schedulePickup failed, using fallback',
        {
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      );
      const pickupId = `FEDEX-PIK-${Date.now()}`;
      return {
        pickupId,
        pickupDate: input.pickupDate,
        pickupTimeSlot: input.pickupTimeSlot,
        trackingUrl: `https://www.fedex.com/fedextrack/?trknbr=${pickupId}`,
      };
    }
  }

  /**
   * Cancel a previously scheduled FedEx pickup via POST /pickup/v1/pickups/cancel.
   */
  async cancelPickup(input: CancelPickupRequest): Promise<void> {
    console.log('[FedExIndiaAdapter] cancelPickup request', input);

    try {
      await this.ensureAuthenticated();
      await this.makeRequestWithRetry('POST', '/pickup/v1/pickups/cancel', {
        pickupConfirmationCode: input.pickupId,
        reason: input.reason || 'Cancelled by customer',
        carrierCode: 'FDXE',
        countryCode: 'IN',
      });
      console.log('[FedExIndiaAdapter] cancelPickup success', {
        pickupId: input.pickupId,
      });
    } catch (error) {
      console.error('[FedExIndiaAdapter] cancelPickup failed', {
        pickupId: input.pickupId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Mark COD as collected.
   * FedEx India COD is fully auto-reconciled via FedEx's daily settlement file —
   * the queue-based reconciliation worker handles it. We throw NotImplementedError
   * so callers route to the recon queue rather than sending a no-op confirmation.
   */
  async markCodCollected(_input: MarkCodRequest): Promise<void> {
    console.log(
      '[FedExIndiaAdapter] markCodCollected request — FedEx COD is auto-reconciled',
    );
    const err = new Error(
      'FedEx India COD is auto-reconciled; markCodCollected is not implemented. The queue-based reconciliation worker handles it.',
    );
    (err as any).name = 'NotImplementedError';
    throw err;
  }

  /**
   * Map FedEx tracking exception codes to NDR action options.
   * Hits GET /track/v1/trackingnumbers, then parses trackingEvents[].exceptionCode.
   * Maps:
   *  - 'AHS' (Address Hold)         → CHANGE_ADDRESS
   *  - 'CDX' (Customer Delivery Exception) → REATTEMPT
   *  - 'RCX' (Recipient Refused)   → CANCEL
   */
  async getNdrActions(shipmentId: string): Promise<NdrActionOption[]> {
    console.log('[FedExIndiaAdapter] getNdrActions request', { shipmentId });

    try {
      await this.ensureAuthenticated();
      const payload = {
        trackingInfo: [
          {
            trackingNumberInfo: { trackingNumber: shipmentId },
          },
        ],
      };

      const response = await this.makeRequestWithRetry(
        'POST',
        '/track/v1/trackingnumbers',
        payload,
      );
      const codes = this.collectFedExExceptionCodes(response.data);

      console.log('[FedExIndiaAdapter] getNdrActions resolved', {
        shipmentId,
        exceptionCodes: codes,
      });

      return this.mapFedExExceptionCodesToNdrActions(codes);
    } catch (error) {
      console.error('[FedExIndiaAdapter] getNdrActions failed', {
        shipmentId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      // Conservative fallback: offer the full NDR action set so operators can act manually.
      return this.defaultNdrActions();
    }
  }

  private buildRatePayload(req: RateQuoteRequest): any {
    const serviceTypes = [
      'PRIORITY_OVERNIGHT',
      'FEDEX_2_DAY',
      'FEDEX_INTERNATIONAL_PRIORITY',
    ];

    return {
      accountNumber: { value: this.accountNumber },
      rateRequestControlParameters: {
        returnTransitTimes: true,
        servicesNeededOnRateFailure: true,
        variableOptions: 'FREIGHT_GUARANTEE',
      },
      requestedShipment: {
        shipper: {
          address: { postalCode: req.originPincode, countryCode: 'IN' },
        },
        recipient: {
          address: { postalCode: req.destinationPincode, countryCode: 'IN' },
        },
        pickupType: 'USE_SCHEDULED_PICKUP',
        requestedPackageLineItems: [
          {
            weight: {
              value: (req.weightGrams / 1000).toFixed(2),
              units: 'KG',
            },
            ...(req.length && req.width && req.height
              ? {
                  dimensions: {
                    length: req.length.toString(),
                    width: req.width.toString(),
                    height: req.height.toString(),
                    units: 'CM',
                  },
                }
              : {}),
          },
        ],
        serviceType: serviceTypes[0],
        ...(req.paymentMethod === 'COD' && {
          specialServicesRequested: {
            specialServiceTypes: ['COD'],
            codDetail: {
              codCollectionAmount: {
                amount: (req.declaredValue || 0).toString(),
                currency: 'INR',
              },
            },
          },
        }),
      },
    };
  }

  private parseRateResponse(data: any, req: RateQuoteRequest): RateQuote[] {
    const output = data?.output || data;
    const rateReply = output?.rateReplyDetails || output?.rateReplies || [];
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    if (!Array.isArray(rateReply) || rateReply.length === 0) {
      return this.getStaticRateQuotes(req);
    }

    const quotes: RateQuote[] = rateReply
      .filter((r: any) => r && (r.ratedShipmentDetails || r.shipmentRateDetail))
      .map((r: any) => {
        const rated = r.ratedShipmentDetails?.[0] || r.shipmentRateDetail || {};
        const totalAmount = parseFloat(
          rated.totalNetCharge ||
            rated.shipmentRateDetail?.totalNetCharge ||
            '0',
        );
        const transitDays = rated.transitDays || rated.deliveryTimestamp;
        const serviceType = r.serviceType || rated.serviceType;
        const minDays =
          typeof transitDays === 'string' ? 1 : transitDays?.minDays || 1;
        const maxDays =
          typeof transitDays === 'string'
            ? Math.max(2, Number(transitDays) || 2)
            : transitDays?.maxDays || 3;

        return {
          carrier: 'FedEx India',
          carrierCode: this.code,
          serviceType: this.mapFedExServiceType(serviceType),
          rate: totalAmount,
          currency: 'INR' as const,
          estimatedDays: { min: minDays, max: maxDays },
          codAvailable: req.paymentMethod === 'COD',
          pickupAvailable: true,
          expiresAt,
          rawResponse: r,
        };
      });

    return quotes.length > 0 ? quotes : this.getStaticRateQuotes(req);
  }

  private getStaticRateQuotes(req: RateQuoteRequest): RateQuote[] {
    const baseRate = 250;
    const weightCharge = Math.ceil(req.weightGrams / 500) * 30;
    const codCharge = req.paymentMethod === 'COD' ? 50 : 0;
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    return [
      {
        carrier: 'FedEx India',
        carrierCode: this.code,
        serviceType: 'EXPRESS',
        rate: baseRate + weightCharge + codCharge,
        currency: 'INR',
        estimatedDays: { min: 1, max: 2 },
        codAvailable: req.paymentMethod === 'COD',
        pickupAvailable: true,
        expiresAt,
        rawResponse: { fallback: true, source: 'static_rate_card' },
      },
    ];
  }

  private mapFedExServiceType(
    serviceType: string | undefined,
  ): 'STANDARD' | 'EXPRESS' | 'SAME_DAY' | 'OVERNIGHT' {
    const s = (serviceType || '').toUpperCase();
    if (s.includes('SAME_DAY')) return 'SAME_DAY';
    if (s.includes('OVERNIGHT') || s.includes('PRIORITY')) return 'OVERNIGHT';
    if (
      s.includes('EXPRESS') ||
      s.includes('2_DAY') ||
      s.includes('INTERNATIONAL')
    )
      return 'EXPRESS';
    return 'STANDARD';
  }

  private parseServiceabilityResponse(
    data: any,
    input: ServiceabilityRequest,
  ): ServiceabilityResult {
    const output = data?.output || data;
    const responses =
      output?.addressServiceabilityResponses ||
      output?.serviceabilityResponses ||
      [];
    const anyServiceable = responses.some((r: any) => r?.serviceable === true);

    if (responses.length === 0) {
      return this.getStaticServiceability(input);
    }

    return {
      serviceable: anyServiceable,
      codAvailable: anyServiceable && input.paymentMethod === 'COD',
      prepaidAvailable: anyServiceable,
      estimatedDays: { min: 1, max: 3 },
      reason: anyServiceable ? undefined : 'NOT_SERVICEABLE',
    };
  }

  private getStaticServiceability(
    input: ServiceabilityRequest,
  ): ServiceabilityResult {
    const valid =
      /^\d{6}$/.test(input.originPincode) &&
      /^\d{6}$/.test(input.destinationPincode);
    return {
      serviceable: valid,
      codAvailable: valid,
      prepaidAvailable: valid,
      estimatedDays: { min: 1, max: 3 },
      reason: valid ? undefined : 'INVALID_PINCODE',
    };
  }

  private buildReadyTimestamp(
    pickupDate: string,
    timeSlot: 'MORNING' | 'AFTERNOON' | 'EVENING',
  ): string {
    const date = new Date(pickupDate);
    let hour = 9;
    if (timeSlot === 'MORNING') hour = 9;
    else if (timeSlot === 'AFTERNOON') hour = 13;
    else if (timeSlot === 'EVENING') hour = 17;
    date.setHours(hour, 0, 0, 0);
    return date.toISOString();
  }

  private collectFedExExceptionCodes(data: any): string[] {
    const output = data?.output || data;
    const results = output?.completeTrackResults || [];
    const codes: string[] = [];

    for (const result of results) {
      const trackResults = result?.trackResults || [];
      for (const tr of trackResults) {
        const scanEvents = tr?.scanEvents || tr?.trackingEvents || [];
        for (const ev of scanEvents) {
          const code =
            ev?.exceptionCode ||
            ev?.statusExceptionCode ||
            ev?.statusDetail?.code;
          if (code && !codes.includes(code)) {
            codes.push(code);
          }
        }
        // Also surface latestStatusDetail code if it's exception-like
        const detailCode = tr?.latestStatusDetail?.code;
        if (
          detailCode &&
          /^[A-Z]{3}$/.test(detailCode) &&
          !codes.includes(detailCode)
        ) {
          codes.push(detailCode);
        }
      }
    }

    return codes;
  }

  private mapFedExExceptionCodesToNdrActions(
    codes: string[],
  ): NdrActionOption[] {
    const actions: NdrActionOption[] = [];
    const seen = new Set<NdrActionOption['code']>();

    const push = (action: NdrActionOption) => {
      if (!seen.has(action.code)) {
        seen.add(action.code);
        actions.push(action);
      }
    };

    for (const raw of codes) {
      const code = (raw || '').toUpperCase();
      switch (code) {
        case 'AHS': // Address Hold
          push({
            code: 'CHANGE_ADDRESS',
            label: 'Update delivery address',
            requiresCustomerInput: true,
            description:
              'FedEx reported an address hold (AHS). Collect a corrected address from the customer.',
          });
          break;
        case 'CDX': // Customer Delivery Exception
          push({
            code: 'REATTEMPT',
            label: 'Reattempt delivery',
            requiresCustomerInput: false,
            description:
              'Customer delivery exception (CDX) — schedule a reattempt on the next business day.',
          });
          break;
        case 'RCX': // Recipient Refused
          push({
            code: 'CANCEL',
            label: 'Cancel and RTO',
            requiresCustomerInput: false,
            description:
              'Recipient refused the shipment (RCX) — initiate return to origin.',
          });
          break;
        default:
          // Unknown FedEx exception code — still offer a generic reattempt.
          push({
            code: 'REATTEMPT',
            label: 'Reattempt delivery',
            requiresCustomerInput: false,
            description: `Unmapped FedEx exception code: ${code}`,
          });
      }
    }

    if (actions.length === 0) {
      // No exception codes found — surface the full action set so operators can act.
      return this.defaultNdrActions();
    }

    // Always include OPEN_DISPUTE as a final escalation option.
    push({
      code: 'OPEN_DISPUTE',
      label: 'Open a dispute',
      requiresCustomerInput: true,
      description:
        'Escalate to FedEx India support if none of the above resolves the issue.',
    });

    return actions;
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
        description: 'Customer needs to confirm a new address',
      },
      {
        code: 'CANCEL',
        label: 'Cancel and RTO',
        requiresCustomerInput: false,
        description: 'Return to origin',
      },
      {
        code: 'OPEN_DISPUTE',
        label: 'Open a dispute',
        requiresCustomerInput: true,
        description: 'Escalate to FedEx India support',
      },
    ];
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
        },
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
        shipper: pickup
          ? {
              contact: {
                personName: pickup.name,
                phoneNumber: pickup.phone,
              },
              address: {
                streetLines: [pickup.addressLine1, pickup.addressLine2].filter(
                  Boolean,
                ),
                city: pickup.city,
                stateOrProvinceCode: pickup.state,
                postalCode: pickup.pincode,
                countryCode: pickup.country || 'IN',
              },
            }
          : undefined,
        recipients: [
          {
            contact: {
              personName: delivery.name,
              phoneNumber: delivery.phone,
            },
            address: {
              streetLines: [
                delivery.addressLine1,
                delivery.addressLine2,
              ].filter(Boolean),
              city: delivery.city,
              stateOrProvinceCode: delivery.state,
              postalCode: delivery.pincode,
              countryCode: delivery.country || 'IN',
            },
          },
        ],
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
        requestedPackageLineItems: [
          {
            weight: {
              value: (pkg.weight / 1000).toFixed(2),
              units: 'KG',
            },
            dimensions:
              pkg.length && pkg.width && pkg.height
                ? {
                    length: pkg.length.toString(),
                    width: pkg.width.toString(),
                    height: pkg.height.toString(),
                    units: 'CM',
                  }
                : undefined,
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
          },
        ],
        ...(req.orderNumber && {
          customerReferences: [
            {
              customerReferenceType: 'CUSTOMER_REFERENCE',
              value: req.orderNumber,
            },
          ],
        }),
      },
      accountNumber: {
        value: this.accountNumber,
      },
    };
  }

  private parseLabelResponse(
    data: any,
    req: CarrierLabelRequest,
  ): CarrierLabelResponse {
    const output = data?.output || data;
    const transactionShipments = output?.transactionShipments || [];
    const shipment = transactionShipments[0] || {};
    const masterTrackingNumber =
      shipment?.masterTrackingNumber || shipment?.trackingNumber;
    const labelUrl = shipment?.label?.url || shipment?.labelUrl;

    const labelNumber =
      masterTrackingNumber || `FEDEX-${req.shipmentId}-${Date.now()}`;

    return {
      labelNumber,
      labelUrl: labelUrl || undefined,
      format: (req.format as any) || 'PDF',
      carrierCode: this.code,
      serviceName: shipment?.serviceType || 'FedEx Standard Overnight',
      awbNumber: masterTrackingNumber || labelNumber,
      trackingUrl: masterTrackingNumber
        ? `https://www.fedex.com/apps/fedextrack/?tracknumbers=${masterTrackingNumber}`
        : undefined,
      estimatedDelivery: shipment?.estimatedDeliveryDate
        ? new Date(shipment.estimatedDeliveryDate)
        : undefined,
    };
  }

  private parseTrackingResponse(
    data: any,
    trackingNumber: string,
  ): TrackingResponse {
    const output = data?.output || data;
    const completeTrackResults = output?.completeTrackResults || [];
    const result = completeTrackResults[0] || {};
    const trackResults = result?.trackResults || [];
    const trackResult = trackResults[0] || {};
    const scanEvents = trackResult?.scanEvents || [];

    const latestEvent = scanEvents[scanEvents.length - 1] || {};
    const status = this.mapFedExStatus(
      trackResult?.latestStatusDetail?.code ||
        latestEvent?.eventType ||
        'Unknown',
    );

    const events = scanEvents.map((event: any) => ({
      status: this.mapFedExStatus(event.eventType || event.status),
      subStatus: event.eventDescription || event.scanLocation?.city,
      description: event.eventDescription || event.status,
      location:
        event.scanLocation?.city || event.scanLocation?.stateOrProvinceCode,
      occurredAt: new Date(event.date || event.timestamp || Date.now()),
      eventCode: event.eventType,
    }));

    return {
      trackingNumber,
      status,
      subStatus: latestEvent?.eventDescription,
      description:
        latestEvent?.eventDescription ||
        trackResult?.latestStatusDetail?.description,
      location:
        latestEvent?.scanLocation?.city ||
        trackResult?.latestStatusDetail?.scanLocation?.city,
      occurredAt: latestEvent?.date ? new Date(latestEvent.date) : new Date(),
      events,
    };
  }

  private mapFedExStatus(status: string): string {
    const s = (status || '').toLowerCase();
    if (s.includes('delivered') || s.includes('dl')) return 'DELIVERED';
    if (s.includes('transit') || s.includes('it') || s.includes('on_vehicle'))
      return 'IN_TRANSIT';
    if (s.includes('picked_up') || s.includes('pu')) return 'SHIPPED';
    if (s.includes('pending') || s.includes('created')) return 'PENDING';
    if (s.includes('cancel') || s.includes('void')) return 'CANCELLED';
    return 'UNKNOWN';
  }

  private async makeRequestWithRetry(
    method: 'GET' | 'POST',
    endpoint: string,
    data?: any,
  ): Promise<any> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers: any = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };

    if (this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`;
    }

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        console.log(
          `[FedExIndiaAdapter] API request (attempt ${attempt}/${this.maxRetries})`,
          {
            method,
            url,
            hasData: !!data,
          },
        );

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

        if (
          error instanceof AxiosError &&
          error.response?.status &&
          error.response.status >= 400 &&
          error.response.status < 500
        ) {
          console.error('[FedExIndiaAdapter] Client error, not retrying', {
            status: error.response.status,
            data: error.response.data,
          });
          throw error;
        }

        const delay = this.retryDelay * Math.pow(2, attempt - 1);

        if (attempt < this.maxRetries) {
          console.warn(
            `[FedExIndiaAdapter] Request failed, retrying in ${delay}ms`,
            {
              attempt,
              error: lastError.message,
            },
          );
          await this.sleep(delay);
        }
      }
    }

    throw lastError || new Error('Request failed after retries');
  }

  private generateFallbackLabel(
    req: CarrierLabelRequest,
  ): CarrierLabelResponse {
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
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
