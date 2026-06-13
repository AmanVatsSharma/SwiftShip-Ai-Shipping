import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ManifestsService } from './manifests.service';
import { ManifestsResolver } from './manifests.resolver';

@Module({
  providers: [PrismaService, ManifestsService, ManifestsResolver],
  exports: [ManifestsService],
})
export class ManifestsModule {}
