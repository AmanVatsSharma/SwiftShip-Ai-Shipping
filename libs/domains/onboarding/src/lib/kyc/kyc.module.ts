import { Module, OnModuleInit } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TenantContext, TenantModule } from '@swiftship/domains-tenants';
import { QueuesModule, QueuesService } from '@swiftship/platform-queues';
import { KycRecordEntity, KycDocumentEntity } from './kyc.entity';
import { PanValidatorService } from './pan-validator';
import { GstinValidatorService } from './gstin-validator';
import {
  BankVerifierAdapter,
  BankVerifierService,
  SetuSandboxBankVerifier,
} from './bank-verifier.service';
import { KycService } from './kyc.service';
import { KycResolver } from './kyc.resolver';

/**
 * SS-031 — KYC module.
 *
 * Re-uses the existing `TenantContext` (SS-001) and `QueuesService`
 * (platform/queues) — we do not roll our own ALS or BullMQ. The bank
 * provider is selected by env: in dev/CI the Setu sandbox is wired
 * automatically; in production a real Setu/CKYC adapter would be
 * registered by env override.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([KycRecordEntity, KycDocumentEntity]),
    // This module's own constructor injects QueuesService + TenantContext,
    // so their host modules must be imported here (found by the live boot
    // test — Nest resolves a module's constructor deps in its own context).
    QueuesModule,
    TenantModule,
  ],
  providers: [
    PanValidatorService,
    GstinValidatorService,
    KycService,
    KycResolver,
    // Default adapter. Override at the AppModule level by providing a
    // different `BankVerifierAdapter` token binding when KYC_BANK_PROVIDER
    // is set to a real implementation.
    {
      provide: 'BANK_VERIFIER_ADAPTER',
      useFactory: (): BankVerifierAdapter => {
        // Heuristic: if a real provider env is set, we'd resolve that
        // class here. For now we always return the sandbox.
        return new SetuSandboxBankVerifier();
      },
    },
    {
      provide: BankVerifierService,
      useFactory: (adapter: BankVerifierAdapter) =>
        new BankVerifierService(adapter),
      inject: ['BANK_VERIFIER_ADAPTER'],
    },
  ],
  exports: [
    KycService,
    PanValidatorService,
    GstinValidatorService,
    BankVerifierService,
  ],
})
export class KycModule implements OnModuleInit {
  constructor(
    private readonly kyc: KycService,
    private readonly queues: QueuesService,
    private readonly tenantContext: TenantContext,
  ) {}

  /**
   * Register the BullMQ worker once at boot. The worker is keyed on the
   * `kyc-verification` queue and calls {@link KycService.processVerifyJob}.
   * If the queue can't be reached (e.g. local dev with no Redis), the
   * boot does not fail — submissions still succeed synchronously, the
   * worker just won't be live until the next restart.
   */
  onModuleInit(): void {
    if (!this.tenantContext) return; // safety guard
    try {
      this.kyc.registerWorker();
    } catch (err) {
      console.warn(
        '[KycModule] failed to register worker:',
        (err as Error).message,
      );
    }
  }
}
