/**
 * SS-033 — CodRemittanceModule.
 *
 * Wires the COD remittance + bank reconciliation + dispute queue
 * subsystems. No GraphQL resolver for now (SS-033 is the engine; the
 * admin portal mutations come in a follow-up bead).
 *
 * Dependency surface:
 *  - TypeOrmModule.forFeature -> BankCodRemittanceEntity, BankCodDisputeEntity
 *  - AuthLibModule (standard)
 *  - TenantModule (needed for TenantContext)
 *
 * The cron service is registered as a provider but is NOT imported
 * from this module; it is bootstrapped in `AppModule` so that
 * NestJS's `@Cron` decorator activates at the app level. Importing
 * it here would double-register it if another lib also registered
 * the same scheduler.
 */
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthLibModule } from '@swiftship/platform-auth';
import { TenantModule } from '@swiftship/domains-tenants';
import {
  BankCodRemittanceEntity,
  BankCodDisputeEntity,
} from '@swiftship/platform-typeorm';
import { CodRemittanceService } from './cod-remittance.service';
import { CodDisputeService } from './cod-dispute.service';
import { CodRemittanceCronService } from './cron/cod-remittance-cron.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([BankCodRemittanceEntity, BankCodDisputeEntity]),
    AuthLibModule,
    TenantModule,
  ],
  providers: [
    CodRemittanceService,
    CodDisputeService,
    CodRemittanceCronService,
  ],
  exports: [
    CodRemittanceService,
    CodDisputeService,
    CodRemittanceCronService,
  ],
})
export class CodRemittanceModule {}
