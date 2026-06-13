import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NdrService {
  constructor(private readonly prisma: PrismaService) {}

  async openCase(shipmentId: number, reason: string) {
    const shipment = await this.prisma.shipment.findUnique({ where: { id: shipmentId } });
    if (!shipment) throw new NotFoundException('Shipment not found');
    return this.prisma.ndrCase.upsert({
      where: { shipmentId },
      update: { reason, status: 'OPEN' },
      create: { shipmentId, reason },
    });
  }

  async closeCase(shipmentId: number, actionNotes?: string) {
    return this.prisma.ndrCase.update({ where: { shipmentId }, data: { status: 'CLOSED', actionNotes } });
  }

  async analytics() {
    const byReason = await this.prisma.ndrCase.groupBy({ by: ['reason'], _count: { reason: true } });
    const open = await this.prisma.ndrCase.count({ where: { status: 'OPEN' } });
    const closed = await this.prisma.ndrCase.count({ where: { status: 'CLOSED' } });
    return { byReason, open, closed };
  }
}
