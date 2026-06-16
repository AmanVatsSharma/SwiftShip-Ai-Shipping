/**
 * SS-027a — tsoa ReturnsController.
 *
 * Mirrors `src/returns/returns.resolver.ts` via direct TypeORM access
 * on `ReturnEntity`. The legacy service in `src/returns/` still uses
 * `PrismaService`; this controller bypasses it to keep the public
 * REST surface free of any Prisma dependency (SS-044 ban).
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
import { IsString, IsNotEmpty, IsInt, IsPositive, IsOptional, IsIn } from 'class-validator';
import { ReturnResponse } from './returns.model';
import { toReturnResponse, shapeReturnResponse, ShapedReturnResponse } from './shapers';

const RETURN_REPO_TOKEN = getRepositoryToken('ReturnEntity' as any);

type ReturnStatus = ReturnResponse['status'];

export { shapeReturnResponse };
export type { ShapedReturnResponse };

export class CreateReturnBody {
  @IsString()
  @IsNotEmpty()
  returnNumber!: string;

  @IsString()
  @IsNotEmpty()
  reason!: string;

  @IsInt()
  @IsPositive()
  orderId!: number;

  @IsOptional()
  pickupScheduledAt?: Date;
}

export class UpdateReturnBody {
  @IsString()
  @IsOptional()
  reason?: string;

  @IsIn(['REQUESTED', 'APPROVED', 'REJECTED', 'COMPLETED', 'CANCELLED'])
  @IsOptional()
  status?: ReturnStatus;

  @IsOptional()
  pickupScheduledAt?: Date;
}

@Injectable()
@Route('v1/returns')
@Tags('Returns')
@Security('api_key')
export class ReturnsController extends Controller {
  constructor(
    @Inject(RETURN_REPO_TOKEN)
    private readonly returns: Repository<any>,
  ) {
    super();
  }

  /** List returns, most recent first (matches legacy `getReturns()`). */
  @Get()
  @SuccessResponse('200', 'OK')
  public async listReturns(): Promise<{ returns: ReturnResponse[] }> {
    const rows = await this.returns.find({ order: { createdAt: 'DESC' } });
    return { returns: rows.map(toReturnResponse) };
  }

  /** Get a single return by id. */
  @Get('{id}')
  @SuccessResponse('200', 'OK')
  @Response<NotFoundException>(404, 'Return not found')
  public async findReturnById(@Path() id: number): Promise<ReturnResponse> {
    const r = await this.returns.findOne({ where: { id } });
    if (!r) throw new NotFoundException(`Return ${id} not found`);
    return toReturnResponse(r);
  }

  /**
   * Create a new return. New returns must start in REQUESTED status
   * (matches the legacy `createReturn` guard).
   */
  @Post()
  @SuccessResponse('201', 'Created')
  @Response<BadRequestException>(400, 'Invalid input')
  public async createReturn(@Body() body: CreateReturnBody): Promise<ReturnResponse> {
    if (!body?.returnNumber || !body?.reason || !body?.orderId) {
      throw new BadRequestException(
        'returnNumber, reason, and orderId are required',
      );
    }
    const created = await this.returns.save(
      this.returns.create({
        returnNumber: body.returnNumber,
        reason: body.reason,
        orderId: body.orderId,
        status: 'REQUESTED' as ReturnStatus,
        pickupScheduledAt: body.pickupScheduledAt ?? null,
      }),
    );
    return toReturnResponse(created);
  }

  /** Update a return (partial). */
  @Patch('{id}')
  @SuccessResponse('200', 'OK')
  @Response<NotFoundException>(404, 'Return not found')
  public async updateReturn(
    @Path() id: number,
    @Body() body: UpdateReturnBody,
  ): Promise<ReturnResponse> {
    const r = await this.returns.findOne({ where: { id } });
    if (!r) throw new NotFoundException(`Return ${id} not found`);
    if (body.reason !== undefined) r.reason = body.reason;
    if (body.status !== undefined) r.status = body.status;
    if (body.pickupScheduledAt !== undefined) {
      r.pickupScheduledAt = body.pickupScheduledAt;
    }
    const saved = await this.returns.save(r);
    return toReturnResponse(saved);
  }

  /** Delete a return. */
  @Delete('{id}')
  @SuccessResponse('200', 'OK')
  @Response<NotFoundException>(404, 'Return not found')
  public async deleteReturn(
    @Path() id: number,
  ): Promise<{ id: number; ok: true }> {
    const result = await this.returns.delete({ id });
    if (!result.affected) throw new NotFoundException(`Return ${id} not found`);
    return { id, ok: true };
  }
}
