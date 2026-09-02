import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type WalletLedgerEntryType = 'CREDIT' | 'DEBIT' | 'LOCK' | 'RELEASE';

/**
 * Append-only, idempotency-keyed ledger of every wallet movement.
 *
 * Direction is encoded in `entryType`; `amount` is always a positive
 * integer in paise. The wallet row is the running balance; the ledger
 * row is the immutable audit trail that *justifies* the balance change.
 *
 * Concurrency rule: a single DataSource.transaction() must (1) check
 * idempotency, (2) INSERT the ledger row, (3) UPDATE the wallet row.
 * If the ledger INSERT fails on the unique idempotency-key index, the
 * call is a duplicate and the prior result is returned.
 */
@Entity('wallet_ledger')
@Index('idx_wallet_ledger_tenant', ['tenantId', 'createdAt'])
@Index('idx_wallet_ledger_idempotency', ['idempotencyKey'], { unique: true })
export class WalletLedgerEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  tenantId!: number;

  @Column()
  walletId!: number;

  @Column({ type: 'varchar', length: 32 })
  entryType!: WalletLedgerEntryType;

  /** Paise; always positive. Direction lives in `entryType`. */
  @Column({ type: 'int' })
  amount!: number;

  /**
   * High-level reason code, e.g. WALLET_TOPUP, COURIER_LABEL,
   * NDR_REATTEMPT, ADMIN_ADJUSTMENT, REFUND, INTERNAL_TRANSFER.
   */
  @Column({ type: 'varchar', length: 80 })
  reason!: string;

  /**
   * Caller-supplied unique key (e.g. Razorpay payment_id, shipment_id,
   * "lock:<shipmentId>"). On duplicate, the prior result is returned
   * and the wallet is *not* double-debited.
   */
  @Column({ type: 'varchar', length: 80, nullable: true })
  idempotencyKey!: string | null;

  @Column({ type: 'jsonb', default: {} })
  metadata!: Record<string, unknown>;

  @CreateDateColumn()
  createdAt!: Date;
}
