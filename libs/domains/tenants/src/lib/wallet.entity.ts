import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { TenantEntity } from './entities';

@Entity('wallets')
@Index('idx_wallets_tenant', ['tenantId'], { unique: true })
export class WalletEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  tenantId!: number;

  // All balances are stored in PAISE (integer minor currency units).
  // 1 INR = 100 paise. Use integer arithmetic everywhere; never persist floats.
  @Column({ type: 'int', default: 0 })
  availableBalance!: number;

  @Column({ type: 'int', default: 0 })
  reservedBalance!: number;

  @Column({ type: 'int', default: 0 })
  lifetimeRecharged!: number;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @OneToOne(() => TenantEntity, (t: TenantEntity) => t.wallet)
  tenant!: TenantEntity;
}
