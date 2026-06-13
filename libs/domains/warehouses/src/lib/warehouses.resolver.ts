import { Resolver, Query, Mutation, Args, Int } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { GqlAuthGuard, RolesGuard, Roles } from '@swiftship/platform-auth';
import { Warehouse, WarehouseCoverage } from './warehouse.model';
import { CreateWarehouseInput } from './dto/create-warehouse.input';
import { UpdateWarehouseInput } from './dto/update-warehouse.input';
import { UpsertWarehouseCoverageInput } from './dto/upsert-warehouse-coverage.input';
import { WarehousesService } from './warehouses.service';

@Resolver(() => Warehouse)
@UseGuards(GqlAuthGuard, RolesGuard)
export class WarehousesResolver {
  constructor(private readonly service: WarehousesService) {}

  @Query(() => [Warehouse], { name: 'warehouses' })
  @Roles('ADMIN', 'STAFF')
  list(
    @Args('search', { type: () => String, nullable: true }) search?: string,
    @Args('isActive', { type: () => Boolean, nullable: true }) isActive?: boolean,
  ) {
    return this.service.list({ search, isActive });
  }

  @Query(() => Warehouse, { name: 'warehouse' })
  @Roles('ADMIN', 'STAFF')
  one(@Args('id', { type: () => Int }) id: number) {
    return this.service.findOne(id);
  }

  @Mutation(() => Warehouse)
  @Roles('ADMIN')
  createWarehouse(@Args('input') input: CreateWarehouseInput) {
    return this.service.create(input);
  }

  @Mutation(() => Warehouse)
  @Roles('ADMIN')
  updateWarehouse(@Args('input') input: UpdateWarehouseInput) {
    return this.service.update(input.id, input);
  }

  @Mutation(() => Boolean)
  @Roles('ADMIN')
  async deleteWarehouse(@Args('id', { type: () => Int }) id: number) {
    await this.service.remove(id);
    return true;
  }

  // ---- coverage
  @Query(() => [WarehouseCoverage], { name: 'warehouseCoverage' })
  @Roles('ADMIN', 'STAFF')
  coverage(@Args('warehouseId', { type: () => Int }) warehouseId: number) {
    return this.service.listCoverage(warehouseId);
  }

  @Mutation(() => WarehouseCoverage)
  @Roles('ADMIN')
  upsertCoverage(@Args('input') input: UpsertWarehouseCoverageInput) {
    return this.service.upsertCoverage(input);
  }

  @Mutation(() => Boolean)
  @Roles('ADMIN')
  async deleteCoverage(@Args('id', { type: () => Int }) id: number) {
    await this.service.removeCoverage(id);
    return true;
  }
}
