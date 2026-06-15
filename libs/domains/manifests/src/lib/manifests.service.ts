/**
 * Manifests service (TypeORM-backed — SS-043a).
 *
 * Generates shipment manifests: a manifest groups a set of outbound
 * shipments under a single manifest number that the carrier picks up as
 * one bundle. Persistence is via `@InjectRepository(ManifestEntity)` and
 * `@InjectRepository(ManifestItemEntity)`. See MIGRATION.md §7 for the
 * runbook that moved this lib off the legacy shim.
 */
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ManifestEntity, ManifestItemEntity } from '@swiftship/platform-typeorm';
import { TenantContext } from '@swiftship/domains-tenants';

@Injectable()
export class ManifestsService {
  constructor(
    @InjectRepository(ManifestEntity)
    private readonly manifests: Repository<ManifestEntity>,
    @InjectRepository(ManifestItemEntity)
    private readonly manifestItems: Repository<ManifestItemEntity>,
    private readonly dataSource: DataSource,
    private readonly tenantContext: TenantContext,
  ) {}

  /**
   * List all manifests for the current tenant, newest first.
   */
  async listManifests(): Promise<ManifestEntity[]> {
    const tid = this.requireTenantId();
    return this.manifests.find({
      where: { tenantId: tid },
      order: { createdAt: 'DESC' },
      relations: ['items'],
    });
  }

  /**
   * Look up a single manifest by id (tenant-scoped).
   */
  async getManifest(id: number): Promise<ManifestEntity> {
    const tid = this.requireTenantId();
    const m = await this.manifests.findOne({
      where: { id, tenantId: tid },
      relations: ['items'],
    });
    if (!m) throw new NotFoundException(`Manifest ${id} not found`);
    return m;
  }

  /**
   * Generate a manifest that groups the supplied shipment ids under a
   * fresh manifest number. Returns the manifest entity with its
   * manifestItem rows already persisted.
   *
   * Both writes run inside a single transaction so a manifest can never
   * exist without its item rows (or vice versa).
   */
  async generateManifest(shipmentIds: number[]) {
    const tid = this.requireTenantId();
    const manifestNo = `MAN-${Date.now()}`;

    return this.dataSource.transaction(async (manager) => {
      const manifest = manager.create(ManifestEntity, {
        manifestNo,
        tenantId: tid,
      });
      const saved = await manager.save(manifest);

      if (shipmentIds.length > 0) {
        const items = manager.create(
          ManifestItemEntity,
          shipmentIds.map((id) => ({
            manifestId: saved.id,
            shipmentId: id,
          })),
        );
        await manager.save(items);
      }

      return saved;
    });
  }

  /**
   * Centralised tenantId guard. The resolver is the only consumer
   * (the service may be called from internal flows like scheduled
   * jobs that bind a tenant context first).
   */
  private requireTenantId(): number {
    const tid = this.tenantContext.getTenantId();
    if (tid === null || tid === undefined) {
      throw new NotFoundException('Tenant context required for manifests operation');
    }
    return Number(tid);
  }
}
