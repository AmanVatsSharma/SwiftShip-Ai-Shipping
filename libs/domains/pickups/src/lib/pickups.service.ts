import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PickupEntity, ShipmentEntity } from '@swiftship/platform-typeorm';

@Injectable()
export class PickupsService {
  constructor(
    @InjectRepository(PickupEntity)
    private readonly pickups: Repository<PickupEntity>,
    @InjectRepository(ShipmentEntity)
    private readonly shipments: Repository<ShipmentEntity>,
  ) {}

  async schedulePickup(shipmentId: number, scheduledAt: Date) {
    const shipment = await this.shipments.findOne({ where: { id: shipmentId } });
    if (!shipment) throw new NotFoundException(`Shipment ${shipmentId} not found`);
    const existing = await this.pickups.findOne({ where: { shipmentId } });
    if (existing) {
      throw new BadRequestException('Pickup already scheduled for this shipment');
    }
    const pickup = this.pickups.create({ shipmentId, scheduledAt });
    return this.pickups.save(pickup);
  }
}
