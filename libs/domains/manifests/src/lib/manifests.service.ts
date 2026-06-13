import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ManifestsService {
  constructor(private readonly prisma: PrismaService) {}

  async generateManifest(shipmentIds: number[]) {
    const manifestNo = `MAN-${Date.now()}`;
    const manifest = await this.prisma.manifest.create({ data: { manifestNo } });
    await this.prisma.manifestItem.createMany({ data: shipmentIds.map(id => ({ manifestId: manifest.id, shipmentId: id })) });
    return manifest;
  }
}
