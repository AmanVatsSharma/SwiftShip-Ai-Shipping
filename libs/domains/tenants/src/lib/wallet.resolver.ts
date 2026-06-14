import { Args, ID, Int, Mutation, Query, Resolver } from '@nestjs/graphql';
import {
  LockFundsInput,
  ReleaseFundsInput,
  TopUpWalletInput,
  WalletStatementFilterInput,
} from './wallet.input';
import { WalletLedgerEntry, Wallet } from './wallet.model';
import { WalletService } from './wallet.service';
import { WalletEntity } from './wallet.entity';
import { WalletLedgerEntity } from './wallet-ledger.entity';

@Resolver(() => Wallet)
export class WalletResolver {
  constructor(private readonly wallets: WalletService) {}

  @Query(() => Wallet, { nullable: true, name: 'wallet' })
  async getWallet(
    @Args('tenantId', { type: () => ID }) tenantId: number,
  ): Promise<WalletEntity | null> {
    return this.wallets.findByTenant(tenantId);
  }

  @Mutation(() => Wallet, { name: 'topUpWallet' })
  async topUpWallet(
    @Args('input') input: TopUpWalletInput,
  ): Promise<WalletEntity> {
    return this.wallets.topUp(input);
  }

  @Mutation(() => Boolean, { name: 'transferBetweenWallets' })
  async transferBetweenWallets(
    @Args('fromTenantId', { type: () => ID }) fromTenantId: number,
    @Args('toTenantId', { type: () => ID }) toTenantId: number,
    @Args('amount', { type: () => Int }) amount: number,
    @Args('reason') reason: string,
    @Args('idempotencyKey') idempotencyKey: string,
  ): Promise<boolean> {
    await this.wallets.transferBetweenWallets(
      fromTenantId,
      toTenantId,
      amount,
      reason,
      idempotencyKey,
    );
    return true;
  }

  @Mutation(() => Wallet, { name: 'lockFunds' })
  async lockFunds(
    @Args('input') input: LockFundsInput,
  ): Promise<WalletEntity> {
    return this.wallets.lockFunds(input);
  }

  @Mutation(() => Wallet, { name: 'releaseFunds' })
  async releaseFunds(
    @Args('input') input: ReleaseFundsInput,
  ): Promise<WalletEntity> {
    return this.wallets.releaseFunds(input);
  }

  @Query(() => [WalletLedgerEntry], { name: 'walletStatement' })
  async walletStatement(
    @Args('filter') filter: WalletStatementFilterInput,
  ): Promise<WalletLedgerEntity[]> {
    return this.wallets.walletStatement(filter);
  }
}
