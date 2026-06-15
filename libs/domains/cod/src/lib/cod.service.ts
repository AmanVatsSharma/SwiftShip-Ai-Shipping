import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CodRemittanceEntity, OrderEntity } from '@swiftship/platform-typeorm';

@Injectable()
export class CodService {
  constructor(
    @InjectRepository(OrderEntity)
    private readonly orders: Repository<OrderEntity>,
    @InjectRepository(CodRemittanceEntity)
    private readonly remittances: Repository<CodRemittanceEntity>,
  ) {}

  async remit(orderId: number, amount: number, referenceId?: string) {
    const order = await this.orders.findOne({ where: { id: orderId } });
    if (!order) throw new NotFoundException('Order not found');
    if (await this.remittances.findOne({ where: { orderId } })) {
      throw new BadRequestException('Remittance already exists for order');
    }
    return this.remittances.save({
      orderId,
      amount,
      referenceId: referenceId ?? null,
      status: 'REMITTED',
      remittedAt: new Date(),
    });
  }
}
