import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DashboardResolver } from './dashboard.resolver';
import { DashboardService } from './dashboard.service';

@Module({
  providers: [PrismaService, DashboardResolver, DashboardService],
  exports: [DashboardService],
})
export class DashboardModule {}