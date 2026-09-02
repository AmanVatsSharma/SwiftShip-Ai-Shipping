import { Args, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Roles, RolesGuard } from '@swiftship/platform-auth';
import { RateSurchargeEntity } from '@swiftship/platform-typeorm';
import { RateSurchargeModel } from './rate-surcharge.model';
import { CreateRateSurchargeInput } from './create-rate-surcharge.input';
import { UpdateRateSurchargeInput } from './update-rate-surcharge.input';

/**
 * Surcharges resolver (TypeORM-backed, SS-101 decommission port).
 *
 * Prisma → TypeORM call-site mapping (see MIGRATION.md §7):
 *   prisma.rateSurcharge.findMany()  → repo.find()
 *   prisma.rateSurcharge.create(...)  → repo.create + repo.save
 *   prisma.rateSurcharge.update(...)  → repo.findOne + Object.assign + repo.save
 *   prisma.rateSurcharge.delete(...)  → repo.remove
 */
@Resolver(() => RateSurchargeModel)
export class SurchargesResolver {
  constructor(
    @InjectRepository(RateSurchargeEntity)
    private readonly surcharges: Repository<RateSurchargeEntity>,
  ) {}

  @Query(() => [RateSurchargeModel])
  async rateSurcharges() {
    return this.surcharges.find();
  }

  @Mutation(() => RateSurchargeModel)
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  async createRateSurcharge(@Args('input') input: CreateRateSurchargeInput) {
    const surcharge = this.surcharges.create({ ...input });
    return this.surcharges.save(surcharge);
  }

  @Mutation(() => RateSurchargeModel)
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  async updateRateSurcharge(@Args('input') input: UpdateRateSurchargeInput) {
    const { id, ...data } = input;
    const surcharge = await this.surcharges.findOne({ where: { id } });
    if (!surcharge) {
      throw new Error(`Rate surcharge with ID ${id} not found`);
    }
    Object.assign(surcharge, data);
    return this.surcharges.save(surcharge);
  }

  @Mutation(() => RateSurchargeModel)
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  async deleteRateSurcharge(@Args('id', { type: () => Int }) id: number) {
    const surcharge = await this.surcharges.findOne({ where: { id } });
    if (!surcharge) {
      throw new Error(`Rate surcharge with ID ${id} not found`);
    }
    return this.surcharges.remove(surcharge);
  }
}
