import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { UserEntity } from './identity.entities';

@Entity('webhook_subscriptions')
@Index('webhook_subscriptions_user_event_idx', ['userId', 'event'])
export class WebhookSubscriptionEntity {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int' })
  userId!: number;
  @ManyToOne(() => UserEntity, (u) => u.webhookSubscriptions)
  user?: UserEntity;

  @Column({ type: 'varchar', length: 64 })
  event!: string;

  @Column({ type: 'text' })
  targetUrl!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  secret?: string | null;

  @Column({ type: 'boolean', default: true })
  active!: boolean;

  @CreateDateColumn()
  createdAt!: Date;
}

@Entity('shopify_stores')
@Index('shopify_stores_shopDomain_key', ['shopDomain'], { unique: true })
export class ShopifyStoreEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 255 })
  shopDomain!: string;

  @Column({ type: 'text' })
  accessToken!: string;

  @CreateDateColumn()
  connectedAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @OneToMany(() => ShopifyOrderEntity, (o) => o.store)
  orders?: ShopifyOrderEntity[];
}

@Entity('shopify_orders')
@Index('shopify_orders_orderNumber_key', ['orderNumber'], { unique: true })
export class ShopifyOrderEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 64 })
  orderNumber!: string;

  @Column({ type: 'double precision' })
  total!: number;

  @Column({ type: 'varchar', length: 32 })
  status!: string;

  @Column({ type: 'varchar', length: 64 })
  storeId!: string;
  @ManyToOne(() => ShopifyStoreEntity, (s) => s.orders)
  store?: ShopifyStoreEntity;

  @Column({ type: 'timestamp', nullable: true })
  shopifyCreatedAt?: Date | null;
  @Column({ type: 'timestamp', nullable: true })
  processedAt?: Date | null;
  @Column({ type: 'varchar', length: 8, nullable: true })
  currency?: string | null;
  @Column({ type: 'varchar', length: 255, nullable: true })
  customerEmail?: string | null;
  @Column({ type: 'varchar', length: 255, nullable: true })
  customerName?: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}

@Entity('shopify_webhook_events')
export class ShopifyWebhookEventEntity {
  @PrimaryColumn({ type: 'varchar', length: 128 })
  id!: string;

  @Column({ type: 'varchar', length: 64 })
  topic!: string;

  @Column({ type: 'varchar', length: 255 })
  shopDomain!: string;

  @CreateDateColumn()
  receivedAt!: Date;
}

@Entity('woocommerce_stores')
@Index('woocommerce_stores_storeUrl_key', ['storeUrl'], { unique: true })
@Index('woocommerce_stores_userId_idx', ['userId'])
export class WooCommerceStoreEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'int' })
  userId!: number;
  @ManyToOne(() => UserEntity, (u) => u.wooCommerceStores)
  user?: UserEntity;

  @Column({ type: 'text' })
  storeUrl!: string;

  @Column({ type: 'text' })
  consumerKey!: string;

  @Column({ type: 'text' })
  consumerSecret!: string;

  @CreateDateColumn()
  connectedAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  @OneToMany(() => WooCommerceOrderEntity, (o) => o.store)
  orders?: WooCommerceOrderEntity[];
}

@Entity('woocommerce_orders')
@Index('woocommerce_orders_orderNumber_key', ['orderNumber'], { unique: true })
@Index('woocommerce_orders_storeId_idx', ['storeId'])
export class WooCommerceOrderEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 64 })
  orderNumber!: string;

  @Column({ type: 'double precision' })
  total!: number;

  @Column({ type: 'varchar', length: 32 })
  status!: string;

  @Column({ type: 'varchar', length: 64 })
  storeId!: string;
  @ManyToOne(() => WooCommerceStoreEntity, (s) => s.orders)
  store?: WooCommerceStoreEntity;

  @Column({ type: 'timestamp', nullable: true })
  woocommerceCreatedAt?: Date | null;
  @Column({ type: 'timestamp', nullable: true })
  processedAt?: Date | null;
  @Column({ type: 'varchar', length: 8, nullable: true })
  currency?: string | null;
  @Column({ type: 'varchar', length: 255, nullable: true })
  customerEmail?: string | null;
  @Column({ type: 'varchar', length: 255, nullable: true })
  customerName?: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
