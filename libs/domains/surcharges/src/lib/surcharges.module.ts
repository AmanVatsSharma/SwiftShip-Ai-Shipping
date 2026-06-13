import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SurchargesResolver } from './surcharges.resolver';

@Module({
  providers: [PrismaService, SurchargesResolver],
})
export class SurchargesModule {}
