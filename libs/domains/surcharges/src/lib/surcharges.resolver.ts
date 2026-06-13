import { Args, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import { PrismaService } from '../prisma/prisma.service';
import { UseGuards } from '@nestjs/common';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { RateSurchargeModel } from './rate-surcharge.model';
import { CreateRateSurchargeInput } from './create-rate-surcharge.input';
import { UpdateRateSurchargeInput } from './update-rate-surcharge.input';

@Resolver(() => RateSurchargeModel)
export class SurchargesResolver {
  constructor(private readonly prisma: PrismaService) {}

  @Query(() => [RateSurchargeModel])
  async rateSurcharges() {
    return this.prisma.rateSurcharge.findMany();
  }

  @Mutation(() => RateSurchargeModel)
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  async createRateSurcharge(@Args('input') input: CreateRateSurchargeInput) {
    return this.prisma.rateSurcharge.create({ data: input });
  }

  @Mutation(() => RateSurchargeModel)
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  async updateRateSurcharge(@Args('input') input: UpdateRateSurchargeInput) {
    const { id, ...data } = input;
    return this.prisma.rateSurcharge.update({ where: { id }, data });
  }

  @Mutation(() => RateSurchargeModel)
  @UseGuards(RolesGuard)
  @Roles('ADMIN')
  async deleteRateSurcharge(@Args('id', { type: () => Int }) id: number) {
    return this.prisma.rateSurcharge.delete({ where: { id } });
  }
}
