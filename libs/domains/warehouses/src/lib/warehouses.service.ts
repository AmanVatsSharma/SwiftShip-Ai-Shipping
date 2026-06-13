/**
 * Warehouses Service (TypeORM-backed, Nx lib).
 *
 * This is the pilot pattern for migrating a `src/<feature>/` module to a
 * proper Nx library. Service injects repositories instead of a Prisma client
 * and uses TypeORM's query builder for everything.
 *
 * The old `src/warehouses/warehouses.service.ts` is the source of truth until
 * Plan 3 — this lib re-exports the public surface from there, plus new methods
 * that use TypeORM repositories. New resolvers should target this lib.
 */
import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Like } from 'typeorm';
import {
  WarehouseEntity,
  WarehouseCoverageEntity,
  WarehouseSellerProfileEntity,
} from '@swiftship/platform-typeorm';
import { CreateWarehouseInput } from './dto/create-warehouse.input';
import { UpdateWarehouseInput } from './dto/update-warehouse.input';
import { UpsertWarehouseCoverageInput } from './dto/upsert-warehouse-coverage.input';

@Injectable()
export class WarehousesService {
  constructor(
    @InjectRepository(WarehouseEntity)
    private readonly warehouses: Repository<WarehouseEntity>,
    @InjectRepository(WarehouseCoverageEntity)
    private readonly coverage: Repository<WarehouseCoverageEntity>,
    @InjectRepository(WarehouseSellerProfileEntity)
    private readonly sellers: Repository<WarehouseSellerProfileEntity>,
  ) {}

  // ---- list
  async list(filter?: { search?: string; isActive?: boolean }) {
    const qb = this.warehouses.createQueryBuilder('w');
    if (filter?.search) {
      qb.andWhere(
        '(w.name ILIKE :s OR w.code ILIKE :s OR w.city ILIKE :s OR w.pincode ILIKE :s)',
        { s: `%${filter.search}%` },
      );
    }
    if (typeof filter?.isActive === 'boolean') {
      qb.andWhere('w.isActive = :a', { a: filter.isActive });
    }
    qb.orderBy('w.createdAt', 'DESC');
    return qb.getMany();
  }

  async findOne(id: number) {
    const wh = await this.warehouses.findOne({ where: { id } });
    if (!wh) throw new NotFoundException(`Warehouse ${id} not found`);
    return wh;
  }

  async findByCode(code: string) {
    const wh = await this.warehouses.findOne({ where: { code } });
    if (!wh) throw new NotFoundException(`Warehouse ${code} not found`);
    return wh;
  }

  // ---- create
  async create(input: CreateWarehouseInput) {
    const existing = await this.warehouses.findOne({ where: { code: input.code } });
    if (existing) throw new BadRequestException(`Warehouse code ${input.code} already exists`);
    const wh = this.warehouses.create(input);
    return this.warehouses.save(wh);
  }

  // ---- update
  async update(id: number, input: UpdateWarehouseInput) {
    const wh = await this.findOne(id);
    Object.assign(wh, input);
    return this.warehouses.save(wh);
  }

  // ---- delete
  async remove(id: number) {
    const wh = await this.findOne(id);
    await this.warehouses.softRemove(wh);
    return { id, ok: true };
  }

  // ---- coverage
  async listCoverage(warehouseId: number) {
    return this.coverage.find({
      where: { warehouseId },
      order: { pincode: 'ASC' },
    });
  }

  async upsertCoverage(input: UpsertWarehouseCoverageInput) {
    const existing = await this.coverage.findOne({
      where: { warehouseId: input.warehouseId, pincode: input.pincode },
    });
    if (existing) {
      Object.assign(existing, input);
      return this.coverage.save(existing);
    }
    return this.coverage.save(this.coverage.create(input));
  }

  async removeCoverage(id: number) {
    const c = await this.coverage.findOne({ where: { id } });
    if (!c) throw new NotFoundException(`Coverage ${id} not found`);
    await this.coverage.remove(c);
    return { id, ok: true };
  }

  // ---- seller profiles (placeholder for Plan 3 expansion)
  async listSellers(warehouseId: number) {
    return this.sellers.find({ where: { warehouseId, isActive: true } });
  }
}
