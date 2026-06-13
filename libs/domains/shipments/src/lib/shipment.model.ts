import {
  ObjectType,
  Field,
  Int,
  Float,
  registerEnumType,
} from '@nestjs/graphql';
import { Warehouse } from '../warehouses/warehouse.model';

export enum ShipmentStatus {
  PENDING = 'PENDING',
  SHIPPED = 'SHIPPED',
  IN_TRANSIT = 'IN_TRANSIT',
  DELIVERED = 'DELIVERED',
  CANCELLED = 'CANCELLED',
}

registerEnumType(ShipmentStatus, {
  name: 'ShipmentStatus',
});

@ObjectType()
export class Shipment {
  @Field(() => Int)
  id: number;

  @Field()
  trackingNumber: string;

  @Field(() => ShipmentStatus)
  status: ShipmentStatus;

  @Field(() => Int)
  orderId: number;

  @Field(() => Int)
  carrierId: number;

  @Field(() => Int, { nullable: true })
  warehouseId?: number | null;

  @Field({ nullable: true })
  shippedAt?: Date;

  @Field({ nullable: true })
  deliveredAt?: Date;

  @Field({ nullable: true })
  originPincode?: string | null;

  @Field({ nullable: true })
  destinationPincode?: string | null;

  @Field(() => Int, { nullable: true })
  weightGrams?: number | null;

  @Field(() => Float, { nullable: true })
  lengthCm?: number | null;

  @Field(() => Float, { nullable: true })
  widthCm?: number | null;

  @Field(() => Float, { nullable: true })
  heightCm?: number | null;

  @Field()
  createdAt: Date;

  @Field()
  updatedAt: Date;

  @Field(() => Warehouse, { nullable: true })
  warehouse?: Warehouse | null;

  @Field(() => ShippingLabel, { nullable: true })
  label?: ShippingLabel | null;

  @Field(() => [TrackingEvent], { nullable: 'itemsAndList' })
  trackingEvents?: TrackingEvent[] | null;
}

@ObjectType()
export class ShippingLabel {
  @Field(() => Int)
  id: number;

  @Field(() => Int)
  shipmentId: number;

  @Field()
  labelNumber: string;

  @Field()
  carrierCode: string;

  @Field({ nullable: true })
  serviceName?: string | null;

  @Field({ nullable: true })
  format?: string | null;

  @Field({ nullable: true })
  labelUrl?: string | null;

  @Field(() => LabelStatus)
  status: LabelStatus;

  @Field()
  requestedAt: Date;

  @Field({ nullable: true })
  generatedAt?: Date | null;

  @Field()
  createdAt: Date;

  @Field()
  updatedAt: Date;
}

export enum LabelStatus {
  PENDING = 'PENDING',
  GENERATED = 'GENERATED',
  FAILED = 'FAILED',
  VOIDED = 'VOIDED',
}

registerEnumType(LabelStatus, { name: 'LabelStatus' });

@ObjectType()
export class TrackingEvent {
  @Field(() => Int)
  id: number;

  @Field(() => Int)
  shipmentId: number;

  @Field()
  trackingNumber: string;

  @Field()
  status: string;

  @Field({ nullable: true })
  subStatus?: string | null;

  @Field({ nullable: true })
  description?: string | null;

  @Field({ nullable: true })
  eventCode?: string | null;

  @Field({ nullable: true })
  location?: string | null;

  @Field()
  occurredAt: Date;

  @Field({ nullable: true })
  raw?: string | null;

  @Field()
  createdAt: Date;
}
