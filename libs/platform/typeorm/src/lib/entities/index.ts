/**
 * Barrel for all TypeORM entities used by the SwiftShip API.
 *
 * Organized by domain aggregate (identity, commerce, shipping, warehouse,
 * billing, ecom) so consumers can import either a single file or the whole
 * barrel. The DataSource picks up everything from `Object.values(entities)`.
 */
export * from './identity.entities';
export * from './commerce.entities';
export * from './shipping.entities';
export * from './warehouse.entities';
export * from './billing.entities';
export * from './ecom.entities';
