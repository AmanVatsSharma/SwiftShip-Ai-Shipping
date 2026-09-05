export interface Address {
  name: string;
  phone: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  pincode: string;
  country?: string;
}

export interface PackageDetails {
  weight: number; // in grams
  length?: number; // in cm
  width?: number; // in cm
  height?: number; // in cm
  codAmount?: number; // Cash on Delivery amount
  declaredValue?: number; // Declared value for insurance
}

export interface CarrierLabelRequest {
  shipmentId: number;
  trackingNumber: string;
  format?: 'PDF' | 'ZPL';
  // Shipping details
  pickupAddress?: Address;
  deliveryAddress?: Address;
  packageDetails?: PackageDetails;
  orderNumber?: string;
  // Additional metadata
  metadata?: Record<string, any>;
}

export interface CarrierLabelResponse {
  labelNumber: string;
  labelUrl?: string;
  format: 'PDF' | 'ZPL';
  carrierCode: string;
  serviceName?: string;
  awbNumber?: string; // Airway Bill Number
  trackingUrl?: string; // URL to track the shipment
  estimatedDelivery?: Date; // Estimated delivery date
}

export interface TrackingResponse {
  trackingNumber: string;
  status: string;
  subStatus?: string;
  description?: string;
  location?: string;
  occurredAt: Date;
  events: TrackingEvent[];
}

export interface TrackingEvent {
  status: string;
  subStatus?: string;
  description?: string;
  location?: string;
  occurredAt: Date;
  eventCode?: string;
}

export interface CarrierAdapter {
  code: string;
  generateLabel(req: CarrierLabelRequest): Promise<CarrierLabelResponse>;
  trackShipment(trackingNumber: string): Promise<TrackingResponse>;
  cancelShipment?(trackingNumber: string, reason?: string): Promise<boolean>;
  voidLabel?(labelNumber: string): Promise<boolean>;
  getRates(req: RateQuoteRequest): Promise<RateQuote[]>;
  getServiceability(
    input: ServiceabilityRequest,
  ): Promise<ServiceabilityResult>;
  schedulePickup(input: SchedulePickupRequest): Promise<ScheduledPickup>;
  cancelPickup?(input: CancelPickupRequest): Promise<void>;
  markCodCollected(input: MarkCodRequest): Promise<void>;
  getNdrActions(shipmentId: string): Promise<NdrActionOption[]>;
}

// ---- New: rate shopping + serviceability + pickup + COD + NDR ----

export interface RateQuoteRequest {
  originPincode: string;
  destinationPincode: string;
  weightGrams: number;
  paymentMethod: 'PREPAID' | 'COD';
  declaredValue?: number;
  length?: number;
  width?: number;
  height?: number;
  courierCode?: string; // optional: only quote a specific carrier
}

export interface RateQuote {
  carrier: string;
  carrierCode: string;
  serviceType: 'STANDARD' | 'EXPRESS' | 'SAME_DAY' | 'OVERNIGHT';
  rate: number; // INR
  currency: 'INR';
  estimatedDays: { min: number; max: number };
  codAvailable: boolean;
  pickupAvailable: boolean;
  expiresAt: Date;
  metadata?: Record<string, any>;
  rawResponse?: unknown;
}

export interface ServiceabilityRequest {
  originPincode: string;
  destinationPincode: string;
  paymentMethod: 'PREPAID' | 'COD';
  weightGrams: number;
}

export interface ServiceabilityResult {
  serviceable: boolean;
  codAvailable: boolean;
  prepaidAvailable: boolean;
  estimatedDays?: { min: number; max: number };
  reason?: string;
}

export interface SchedulePickupRequest {
  pickupPincode: string;
  pickupDate: string; // ISO date
  pickupTimeSlot: 'MORNING' | 'AFTERNOON' | 'EVENING';
  shipmentIds: string[];
  contactName: string;
  contactPhone: string;
}

export interface ScheduledPickup {
  pickupId: string;
  pickupDate: string;
  pickupTimeSlot: string;
  trackingUrl?: string;
}

export interface CancelPickupRequest {
  pickupId: string;
  reason?: string;
}

export interface MarkCodRequest {
  awbNumber: string;
  collectedAmount: number;
  collectedAt: string; // ISO
  reference?: string;
}

export interface NdrActionOption {
  code: 'REATTEMPT' | 'CHANGE_ADDRESS' | 'CANCEL' | 'OPEN_DISPUTE';
  label: string;
  requiresCustomerInput: boolean;
  description?: string;
}
