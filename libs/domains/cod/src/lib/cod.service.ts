import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CodService {
  constructor(private readonly prisma: PrismaService) {}

  async remit(orderId: number, amount: number, referenceId?: string) {
    const order = await this.prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');
    if (await this.prisma.codRemittance.findUnique({ where: { orderId } })) {
      throw new BadRequestException('Remittance already exists for order');
    }
    return this.prisma.codRemittance.create({ data: { orderId, amount, referenceId, status: 'REMITTED', remittedAt: new Date() } });
  }
}
