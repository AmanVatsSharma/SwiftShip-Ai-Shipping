import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NdrService } from './ndr.service';
import { NdrResolver } from './ndr.resolver';

@Module({
  providers: [PrismaService, NdrService, NdrResolver],
  exports: [NdrService],
})
export class NdrModule {}
