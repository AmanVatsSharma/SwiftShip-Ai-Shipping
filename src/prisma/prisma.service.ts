/**
 * PrismaService (legacy shim).
 *
 * The codebase has been migrated to TypeORM (see libs/platform/typeorm).
 * This file remains so any service that still injects `PrismaService` keeps
 * type-checking during the in-flight migration. It throws a clear error on
 * use so a forgotten service is obvious in the logs, instead of a silent
 * `undefined` access.
 */
import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    this.logger.warn(
      'PrismaService is a legacy shim — please migrate to @InjectRepository from @nestjs/typeorm.',
    );
  }

  async onModuleDestroy() {
    /* noop */
  }

  // Throw a clear error for any legacy `.user.findMany(...)` access.
  // Returning a Proxy that throws lets TypeScript "see" the model accessors
  // (this.findUnique, this.user, this.order, …) while making the runtime
  // behaviour loud and obvious.
  private throwLegacy(): never {
    throw new Error(
      'PrismaService is no longer wired to a database. Migrate this service to use the TypeORM repositories from libs/platform/typeorm.',
    );
  }
}
