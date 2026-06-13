import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PickupsService } from './pickups.service';
import { PickupsResolver } from './pickups.resolver';

@Module({
  providers: [PrismaService, PickupsService, PickupsResolver],
  exports: [PickupsService],
})
export class PickupsModule {}
