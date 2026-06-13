import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PickupsService {
  constructor(private readonly prisma: PrismaService) {}

  async schedulePickup(shipmentId: number, scheduledAt: Date) {
    const shipment = await this.prisma.shipment.findUnique({ where: { id: shipmentId } });
    if (!shipment) throw new NotFoundException(`Shipment ${shipmentId} not found`);
    if (await this.prisma.pickup.findUnique({ where: { shipmentId } })) {
      throw new BadRequestException('Pickup already scheduled for this shipment');
    }
    return this.prisma.pickup.create({ data: { shipmentId, scheduledAt } });
  }
}
