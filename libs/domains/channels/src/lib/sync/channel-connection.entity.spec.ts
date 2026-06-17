import {
  ChannelConnectionEntity,
  ChannelSyncJobEntity,
} from './channel-sync.entities';
import {
  _resetCipherForTests,
  decryptCredentials,
  decryptJson,
  encryptCredentials,
  encryptJson,
} from './credential-cipher';

/**
 * SS-026 — round-trip test for the credential cipher.
 *
 * The migration `1718160000015-AddChannelSyncTables` adds the two
 * tables; this spec asserts that:
 *   1. `ChannelConnectionEntity` columns match the migration.
 *   2. `ChannelSyncJobEntity` columns match the migration.
 *   3. The cipher round-trips correctly.
 *
 * The migration itself is exercised by the api-e2e job (which boots
 * a real Postgres); this spec is the unit-level complement.
 */
describe('SS-026 channel-sync tables + credential cipher', () => {
  beforeAll(() => {
    process.env.CHANNEL_ENCRYPTION_KEY = 'unit-test-encryption-key-32chars-min!!';
  });

  afterAll(() => {
    _resetCipherForTests();
  });

  it('ChannelConnectionEntity declares the expected columns', () => {
    // The column set is a contract — if a new column is added the
    // migration's CREATE TABLE must be updated in lockstep.
    const expected = [
      'id',
      'tenantId',
      'platform',
      'displayName',
      'externalAccountId',
      'credentials',
      'status',
      'productCursor',
      'orderCursor',
      'lastProductSyncAt',
      'lastOrderSyncAt',
      'lastError',
      'settings',
      'createdAt',
      'updatedAt',
    ];
    // Reflectively read the @Column metadata would be heavy — instead
    // we assert against a known list of property names on the class.
    const have = Object.getOwnPropertyNames(new ChannelConnectionEntity());
    for (const col of expected) {
      // The class assigns these as declared fields (TS-only). The
      // runtime values are `undefined` until the row is hydrated.
      expect(have).toContain(col);
    }
  });

  it('ChannelSyncJobEntity declares the expected columns', () => {
    const expected = [
      'id',
      'tenantId',
      'channelId',
      'type',
      'status',
      'idempotencyKey',
      'startedAt',
      'finishedAt',
      'itemsProcessed',
      'itemsCreated',
      'itemsUpdated',
      'itemsSkipped',
      'itemsFailed',
      'errorMessage',
      'processedExternalIds',
      'createdAt',
      'updatedAt',
    ];
    const have = Object.getOwnPropertyNames(new ChannelSyncJobEntity());
    for (const col of expected) {
      expect(have).toContain(col);
    }
  });

  it('round-trips a credentials JSON blob through encrypt/decrypt', () => {
    const original = {
      shop: 'aurora.myshopify.com',
      accessToken: 'shpat_super-secret-token-value',
    };
    const payload = encryptJson(original);
    expect(typeof payload).toBe('string');
    expect(payload).not.toContain('shpat_');
    expect(payload).not.toContain('aurora.myshopify.com');

    const decoded = decryptJson<typeof original>(payload);
    expect(decoded).toEqual(original);
  });

  it('produces a different ciphertext each time (IV is random)', () => {
    const a = encryptCredentials('same plaintext');
    const b = encryptCredentials('same plaintext');
    expect(a).not.toEqual(b);
    expect(decryptCredentials(a)).toEqual('same plaintext');
    expect(decryptCredentials(b)).toEqual('same plaintext');
  });

  it('throws when the ciphertext is tampered with', () => {
    const a = encryptCredentials('hello world');
    // Flip the last char so the GCM auth tag fails verification.
    const tampered = a.slice(0, -1) + (a.endsWith('A') ? 'B' : 'A');
    expect(() => decryptCredentials(tampered)).toThrow();
  });

  it('throws a clear error when CHANNEL_ENCRYPTION_KEY is missing', () => {
    _resetCipherForTests();
    const saved = process.env.CHANNEL_ENCRYPTION_KEY;
    delete process.env.CHANNEL_ENCRYPTION_KEY;
    expect(() => encryptCredentials('x')).toThrow(
      /CHANNEL_ENCRYPTION_KEY env var is missing/,
    );
    process.env.CHANNEL_ENCRYPTION_KEY = saved;
    _resetCipherForTests();
  });
});