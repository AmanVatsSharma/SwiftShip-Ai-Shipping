/**
 * SS-027a — tsoa ShippingRatesController.
 *
 * Mirrors `src/shipping-rates/shipping-rates.resolver.ts` via direct
 * TypeORM access on `ShippingRateEntity`. The legacy service in
 * `src/shipping-rates/` still uses `PrismaService`; this controller
 * bypasses it to keep the public REST surface free of any Prisma
 * dependency (SS-044 ban).
 *
 * Auth: `X-Swiftship-Api-Key` (enforced globally).
 */
import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Path,
  Body,
  Route,
  Security,
  Tags,
  SuccessResponse,
  Response,
} from 'tsoa';
import { Injectable, Inject, NotFoundException, BadRequestException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IsInt, IsPositive, IsString, IsNotEmpty, IsNumber, IsOptional, Min, Max } from 'class-validator';
import { ShippingRateResponse } from './shipping-rates.model';
import { toRateResponse } from './shapers';

const SHIPPING_RATE_REPO_TOKEN = getRepositoryToken('ShippingRateEntity' as any);

export class CreateShippingRateBody {
  @IsInt()
  @IsPositive()
  carrierId!: number;

  @IsString()
  @IsNotEmpty()
  serviceName!: string;

  @IsNumber()
  @Min(0.01)
  rate!: number;

  @IsInt()
  @Min(1)
  @Max(30)
  estimatedDeliveryDays!: number;
}

export class UpdateShippingRateBody {
  @IsString()
  @IsOptional()
  serviceName?: string;

  @IsNumber()
  @Min(0.01)
  @IsOptional()
  rate?: number;

  @IsInt()
  @Min(1)
  @Max(30)
  @IsOptional()
  estimatedDeliveryDays?: number;
}

@Injectable()
@Route('v1/shipping-rates')
@Tags('Shipping Rates')
@Security('api_key')
export class ShippingRatesController extends Controller {
  constructor(
    @Inject(SHIPPING_RATE_REPO_TOKEN)
    private readonly rates: Repository<any>,
  ) {
    super();
  }

  /** List all shipping rates. */
  @Get()
  @SuccessResponse('200', 'OK')
  public async listRates(): Promise<{ rates: ShippingRateResponse[] }> {
    const rows = await this.rates.find();
    return { rates: rows.map(toRateResponse) };
  }

  /** Get a single shipping rate by id. */
  @Get('{id}')
  @SuccessResponse('200', 'OK')
  @Response<NotFoundException>(404, 'Shipping rate not found')
  public async findRateById(@Path() id: number): Promise<ShippingRateResponse> {
    const r = await this.rates.findOne({ where: { id } });
    if (!r) throw new NotFoundException(`Shipping rate ${id} not found`);
    return toRateResponse(r);
  }

  /** All rates for a given carrier. */
  @Get('by-carrier/{carrierId}')
  @SuccessResponse('200', 'OK')
  public async ratesByCarrier(
    @Path() carrierId: number,
  ): Promise<{ rates: ShippingRateResponse[] }> {
    const rows = await this.rates.find({ where: { carrierId } });
    return { rates: rows.map(toRateResponse) };
  }

  /** Cheapest rate across all carriers (lowest `rate` value). */
  @Get('cheapest')
  @SuccessResponse('200', 'OK')
  public async cheapest(): Promise<ShippingRateResponse | null> {
    const r = await this.rates.findOne({ order: { rate: 'ASC' } });
    return r ? toRateResponse(r) : null;
  }

  /** Fastest rate across all carriers (lowest `estimatedDeliveryDays`). */
  @Get('fastest')
  @SuccessResponse('200', 'OK')
  public async fastest(): Promise<ShippingRateResponse | null> {
    const r = await this.rates.findOne({ order: { estimatedDeliveryDays: 'ASC' } });
    return r ? toRateResponse(r) : null;
  }

  /** Best-value rate (cheapest among the fastest 3). */
  @Get('best-value')
  @SuccessResponse('200', 'OK')
  public async bestValue(): Promise<ShippingRateResponse | null> {
    const rows = await this.rates.find({
      order: { estimatedDeliveryDays: 'ASC' },
      take: 3,
    });
    if (!rows.length) return null;
    const best = rows.reduce((a, b) => (Number(a.rate) <= Number(b.rate) ? a : b));
    return toRateResponse(best);
  }

  /** Create a new shipping rate. */
  @Post()
  @SuccessResponse('201', 'Created')
  @Response<BadRequestException>(400, 'Invalid input')
  public async createRate(@Body() body: CreateShippingRateBody): Promise<ShippingRateResponse> {
    if (!body) throw new BadRequestException('Body is required');
    const created = await this.rates.save(this.rates.create({ ...body }));
    return toRateResponse(created);
  }

  /** Update a shipping rate (partial). */
  @Patch('{id}')
  @SuccessResponse('200', 'OK')
  @Response<NotFoundException>(404, 'Shipping rate not found')
  public async updateRate(
    @Path() id: number,
    @Body() body: UpdateShippingRateBody,
  ): Promise<ShippingRateResponse> {
    const r = await this.rates.findOne({ where: { id } });
    if (!r) throw new NotFoundException(`Shipping rate ${id} not found`);
    if (body.serviceName !== undefined) r.serviceName = body.serviceName;
    if (body.rate !== undefined) r.rate = body.rate;
    if (body.estimatedDeliveryDays !== undefined) {
      r.estimatedDeliveryDays = body.estimatedDeliveryDays;
    }
    const saved = await this.rates.save(r);
    return toRateResponse(saved);
  }

  /** Delete a shipping rate. */
  @Delete('{id}')
  @SuccessResponse('200', 'OK')
  @Response<NotFoundException>(404, 'Shipping rate not found')
  public async deleteRate(
    @Path() id: number,
  ): Promise<{ id: number; ok: true }> {
    const result = await this.rates.delete({ id });
    if (!result.affected) throw new NotFoundException(`Shipping rate ${id} not found`);
    return { id, ok: true };
  }
}
