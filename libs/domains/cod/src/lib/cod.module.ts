import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CodService } from './cod.service';
import { CodResolver } from './cod.resolver';

@Module({
  providers: [PrismaService, CodService, CodResolver],
  exports: [CodService],
})
export class CodModule {}
