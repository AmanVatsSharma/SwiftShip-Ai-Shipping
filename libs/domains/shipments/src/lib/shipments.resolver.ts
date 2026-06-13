import {
  Resolver,
  Query,
  Mutation,
  Args,
  Int,
  ResolveField,
  Parent,
} from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { GqlAuthGuard, RolesGuard, Roles } from '@swiftship/platform-auth';
import {
  Shipment,
  ShipmentStatus,
  ShippingLabel,
  TrackingEvent,
} from './shipment.model';
import { ShipmentsService } from './shipments.service';
import { CreateShipmentInput } from './dto/create-shipment.input';
import { UpdateShipmentInput } from './dto/update-shipment.input';
import { ShipmentsFilterInput } from './dto/shipments-filter.input';
import { CreateLabelInput } from './dto/create-label.input';
import { IngestTrackingInput } from './dto/ingest-tracking.input';

@Resolver(() => Shipment)
@UseGuards(GqlAuthGuard, RolesGuard)
export class ShipmentsResolver {
  constructor(private readonly service: ShipmentsService) {}

  @Query(() => [Shipment], { name: 'shipments' })
  @Roles('ADMIN', 'STAFF', 'SELLER')
  getShipments() {
    return this.service.getShipments();
  }

  @Query(() => Shipment, { name: 'shipment' })
  @Roles('ADMIN', 'STAFF', 'SELLER')
  one(@Args('id', { type: () => Int }) id: number) {
    return this.service.getShipment(id);
  }

  @Query(() => [Shipment], { name: 'filterShipments' })
  @Roles('ADMIN', 'STAFF', 'SELLER')
  filter(@Args('filter') filter: ShipmentsFilterInput) {
    return this.service.filterShipments(filter);
  }

  @Mutation(() => Shipment)
  @Roles('ADMIN', 'STAFF', 'SELLER')
  createShipment(@Args('input') input: CreateShipmentInput) {
    return this.service.createShipment(input);
  }

  @Mutation(() => Shipment)
  @Roles('ADMIN', 'STAFF')
  updateShipment(@Args('input') input: UpdateShipmentInput) {
    return this.service.updateShipment(input);
  }

  @Mutation(() => Shipment)
  @Roles('ADMIN', 'STAFF')
  cancelShipment(@Args('id', { type: () => Int }) id: number) {
    return this.service.cancelShipment(id);
  }

  // ---- labels
  @Mutation(() => ShippingLabel)
  @Roles('ADMIN', 'STAFF', 'SELLER')
  generateShippingLabel(@Args('input') input: CreateLabelInput) {
    return this.service.generateLabel(input);
  }

  // ---- tracking
  @Mutation(() => TrackingEvent)
  @Roles('ADMIN', 'STAFF')
  ingestTracking(@Args('input') input: IngestTrackingInput) {
    return this.service.ingestTracking(input);
  }
}
