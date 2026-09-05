import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { TenantApiKeyEntity } from './entities';

export const API_KEY_PREFIX_LIVE = 'ss_live_';

const BCRYPT_ROUNDS = 10;
const PLAINTEXT_RANDOM_BYTES = 24; // 24 bytes = 32 base64url chars (after the prefix)

/**
 * ApiKeyService — full create / verify / rotate / revoke lifecycle for
 * `ss_live_<24 base62 chars>` tenant API keys.
 *
 * The plain-text key is returned ONCE at creation/rotation time; the DB only
 * ever sees a bcrypt hash. The first 8 chars after the prefix form the public
 * lookup prefix and are stored in the clear so the middleware can index by it.
 */
@Injectable()
export class ApiKeyService {
  constructor(
    @InjectRepository(TenantApiKeyEntity)
    private readonly apiKeys: Repository<TenantApiKeyEntity>,
  ) {}

  /**
   * Generate a new API key for a tenant and persist the bcrypt hash + 8-char
   * public prefix. Returns the plain-text key exactly once.
   */
  async create(tenantId: number): Promise<{
    entity: TenantApiKeyEntity;
    plainText: string;
  }> {
    const random = this.randomBase62(PLAINTEXT_RANDOM_BYTES);
    const plainText = `${API_KEY_PREFIX_LIVE}${random}`;
    const publicPrefix = `${API_KEY_PREFIX_LIVE}${random.slice(0, 8)}`;
    const hashedKey = await bcrypt.hash(plainText, BCRYPT_ROUNDS);

    const entity = this.apiKeys.create({
      tenantId,
      prefix: publicPrefix,
      hashedKey,
      isActive: true,
      lastUsedAt: null,
    });
    const saved = await this.apiKeys.save(entity);
    return { entity: saved, plainText };
  }

  /**
   * Verify a presented plain-text API key. Returns the tenantId if the key
   * matches an active record, null otherwise.
   */
  async verify(plainText: string): Promise<number | null> {
    if (!plainText.startsWith(API_KEY_PREFIX_LIVE)) return null;
    const publicPrefix = plainText.slice(0, API_KEY_PREFIX_LIVE.length + 8);
    const candidate = await this.apiKeys.findOne({
      where: { prefix: publicPrefix, isActive: true },
    });
    if (!candidate) return null;
    const ok = await bcrypt.compare(plainText, candidate.hashedKey);
    if (!ok) return null;
    // best-effort lastUsedAt — don't block the request path on this
    candidate.lastUsedAt = new Date();
    await this.apiKeys.save(candidate).catch(() => undefined);
    return candidate.tenantId;
  }

  /**
   * Mark an old key revoked and create a replacement for the same tenant,
   * preserving the public prefix.
   */
  async rotate(oldKeyId: number): Promise<{
    entity: TenantApiKeyEntity;
    plainText: string;
    prefix: string;
  }> {
    const old = await this.apiKeys.findOne({ where: { id: oldKeyId } });
    if (!old) throw new NotFoundException(`ApiKey ${oldKeyId} not found`);

    // Re-generate a random secret but keep the same public prefix so callers
    // that hard-coded the prefix can still discover the key. The secret is
    // prefix + fresh random for the REMAINING chars — deriving it from a
    // wholly-new random would change the first-8 chars and no longer match
    // the stored (kept) prefix on verify() (found by the e2e rotate suite).
    const random = this.randomBase62(PLAINTEXT_RANDOM_BYTES - 8);
    const plainText = `${old.prefix}${random}`;
    const hashedKey = await bcrypt.hash(plainText, BCRYPT_ROUNDS);

    // idx_tenant_api_keys_prefix is UNIQUE across active AND inactive rows,
    // so 'deactivate old + insert new with same prefix' violated it (found
    // by the e2e rotateApiKey suite). Swap atomically instead: delete the
    // old row and insert the replacement in one transaction.
    const saved = await this.apiKeys.manager.transaction(async (em) => {
      await em.remove(TenantApiKeyEntity, old);
      const entity = em.create(TenantApiKeyEntity, {
        tenantId: old.tenantId,
        prefix: old.prefix,
        hashedKey,
        isActive: true,
        lastUsedAt: null,
      });
      return em.save(TenantApiKeyEntity, entity);
    });
    return { entity: saved, plainText, prefix: old.prefix };
  }

  /**
   * Soft-revoke a key (e.g. on logout-from-all-devices or tenant offboarding).
   */
  async revoke(id: number): Promise<void> {
    const key = await this.apiKeys.findOne({ where: { id } });
    if (!key) throw new NotFoundException(`ApiKey ${id} not found`);
    key.isActive = false;
    await this.apiKeys.save(key);
  }

  /**
   * 24 random bytes encoded as base62 (0-9, a-z, A-Z) — easier to copy than
   * base64url and matches the spec's "24 base62 chars" requirement.
   */
  private randomBase62(byteLength: number): string {
    const ALPHABET =
      '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const bytes = randomBytes(byteLength);
    let out = '';
    for (let i = 0; i < bytes.length; i++) {
      out += ALPHABET[bytes[i] % ALPHABET.length];
    }
    return out;
  }
}
