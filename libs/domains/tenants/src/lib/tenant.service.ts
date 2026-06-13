import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantEntity } from './entities';
import type {
  CreateTenantInput,
  UpdateTenantInput,
} from './tenant.input';

export interface TenantListFilter {
  status?: string;
  tier?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

@Injectable()
export class TenantService {
  constructor(
    @InjectRepository(TenantEntity)
    private readonly tenants: Repository<TenantEntity>,
  ) {}

  async create(input: CreateTenantInput): Promise<TenantEntity> {
    const tenant = this.tenants.create({
      slug: input.slug,
      name: input.name,
      tier: (input.tier ?? 'STARTER') as TenantEntity['tier'],
      status: (input.status ?? 'TRIAL') as TenantEntity['status'],
      settings: input.settings ?? {},
    });
    return this.tenants.save(tenant);
  }

  async findById(id: number): Promise<TenantEntity> {
    const tenant = await this.tenants.findOne({ where: { id } });
    if (!tenant) {
      throw new NotFoundException(`Tenant ${id} not found`);
    }
    return tenant;
  }

  async findBySlug(slug: string): Promise<TenantEntity | null> {
    return this.tenants.findOne({ where: { slug } });
  }

  async findByApiKey(
    _prefix: string,
    _hashedKey: string,
  ): Promise<TenantEntity | null> {
    // Persistence is wired by SS-005; stub for W1.
    return null;
  }

  async suspend(id: number): Promise<TenantEntity> {
    const tenant = await this.findById(id);
    tenant.status = 'SUSPENDED';
    return this.tenants.save(tenant);
  }

  async list(filter: TenantListFilter = {}): Promise<TenantEntity[]> {
    const qb = this.tenants.createQueryBuilder('t');
    if (filter.status) qb.andWhere('t.status = :status', { status: filter.status });
    if (filter.tier) qb.andWhere('t.tier = :tier', { tier: filter.tier });
    if (filter.search) {
      qb.andWhere('(t.name ILIKE :s OR t.slug ILIKE :s)', {
        s: `%${filter.search}%`,
      });
    }
    qb.orderBy('t.createdAt', 'DESC');
    if (filter.limit) qb.take(filter.limit);
    if (filter.offset) qb.skip(filter.offset);
    return qb.getMany();
  }

  async update(id: number, input: UpdateTenantInput): Promise<TenantEntity> {
    const tenant = await this.findById(id);
    if (input.name !== undefined) tenant.name = input.name;
    if (input.tier !== undefined)
      tenant.tier = input.tier as TenantEntity['tier'];
    if (input.status !== undefined)
      tenant.status = input.status as TenantEntity['status'];
    if (input.settings !== undefined) tenant.settings = input.settings;
    return this.tenants.save(tenant);
  }
}
