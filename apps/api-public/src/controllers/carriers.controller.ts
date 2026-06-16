/**
 * SS-027a — tsoa CarriersController.
 *
 * Mirrors the GraphQL surface in `src/carriers/carrier.resolver.ts` via
 * direct TypeORM access. The legacy carrier service in `src/carriers/`
 * still uses `PrismaService`; this controller bypasses it and reads
 * `CarrierEntity` directly through `@InjectRepository` to keep the
 * public REST surface free of any Prisma dependency (SS-044 ban).
 *
 * Auth: `X-Swiftship-Api-Key` (enforced globally by `tenantKeyMiddleware`).
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
import { Injectable, Inject, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { CarrierResponse } from './carrier.model';
import { toCarrierResponse } from './shapers';

const CARRIER_REPO_TOKEN = getRepositoryToken('CarrierEntity' as any);

export class CreateCarrierBody {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  apiKey!: string;
}

export class UpdateCarrierBody {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  apiKey?: string;
}

@Injectable()
@Route('v1/carriers')
@Tags('Carriers')
@Security('api_key')
export class CarriersController extends Controller {
  constructor(
    @Inject(CARRIER_REPO_TOKEN)
    private readonly carriers: Repository<any>,
  ) {
    super();
  }

  /**
   * List all carriers (in name-ascending order to match the legacy
   * `getCarriers()` behaviour).
   */
  @Get()
  @SuccessResponse('200', 'OK')
  public async listCarriers(): Promise<{ carriers: CarrierResponse[] }> {
    const rows = await this.carriers.find({ order: { name: 'ASC' } });
    return { carriers: rows.map(toCarrierResponse) };
  }

  /**
   * Get a single carrier by id.
   */
  @Get('{id}')
  @SuccessResponse('200', 'OK')
  @Response<NotFoundException>(404, 'Carrier not found')
  public async findCarrierById(@Path() id: number): Promise<CarrierResponse> {
    const c = await this.carriers.findOne({ where: { id } });
    if (!c) throw new NotFoundException(`Carrier ${id} not found`);
    return toCarrierResponse(c);
  }

  /**
   * Create a new carrier.
   */
  @Post()
  @SuccessResponse('201', 'Created')
  @Response<BadRequestException>(400, 'Invalid input')
  @Response<ConflictException>(409, 'Carrier name already exists')
  public async createCarrier(@Body() body: CreateCarrierBody): Promise<CarrierResponse> {
    if (!body?.name || !body?.apiKey) {
      throw new BadRequestException('name and apiKey are required');
    }
    const existing = await this.carriers.findOne({ where: { name: body.name } });
    if (existing) {
      throw new ConflictException(`Carrier with name "${body.name}" already exists`);
    }
    const created = await this.carriers.save(
      this.carriers.create({ name: body.name, apiKey: body.apiKey }),
    );
    return toCarrierResponse(created);
  }

  /**
   * Update a carrier by id (partial).
   */
  @Patch('{id}')
  @SuccessResponse('200', 'OK')
  @Response<NotFoundException>(404, 'Carrier not found')
  public async updateCarrier(
    @Path() id: number,
    @Body() body: UpdateCarrierBody,
  ): Promise<CarrierResponse> {
    const c = await this.carriers.findOne({ where: { id } });
    if (!c) throw new NotFoundException(`Carrier ${id} not found`);
    if (body.name !== undefined) c.name = body.name;
    if (body.apiKey !== undefined) c.apiKey = body.apiKey;
    const saved = await this.carriers.save(c);
    return toCarrierResponse(saved);
  }

  /**
   * Delete a carrier by id.
   */
  @Delete('{id}')
  @SuccessResponse('200', 'OK')
  @Response<NotFoundException>(404, 'Carrier not found')
  public async deleteCarrier(
    @Path() id: number,
  ): Promise<{ id: number; ok: true }> {
    const result = await this.carriers.delete({ id });
    if (!result.affected) throw new NotFoundException(`Carrier ${id} not found`);
    return { id, ok: true };
  }
}
