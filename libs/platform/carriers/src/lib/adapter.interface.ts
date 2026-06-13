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
}
