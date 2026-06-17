import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';

/**
 * SS-026 — credential cipher
 *
 * Each `ChannelConnectionEntity` row stores per-platform credentials
 * (Shopify access tokens, WooCommerce consumer secrets, …). We
 * encrypt them at rest with AES-256-GCM, keyed from
 * `process.env.CHANNEL_ENCRYPTION_KEY`.
 *
 *   - 32-byte key derived from the env var with scrypt (salt is
 *     static — the env var IS the secret, scrypt is only used to
 *     stretch weak keys to 32 bytes).
 *   - 12-byte random IV per ciphertext.
 *   - 16-byte auth tag (GCM default).
 *
 * Wire format: base64( IV (12) || TAG (16) || CIPHERTEXT )
 *
 * Failure modes: a missing key throws at first use so a misconfigured
 * deployment fails fast; bad ciphertext throws on decrypt (no silent
 * "all credentials = null" fallbacks).
 */
const ALGO = 'aes-256-gcm' as const;
const IV_LEN = 12;
const TAG_LEN = 16;
const KEY_LEN = 32;

/**
 * Static salt for the scrypt KDF. The salt is NOT a secret — the secret
 * is `CHANNEL_ENCRYPTION_KEY` itself. We pick a fixed salt so the
 * derived key is deterministic across restarts (the same env var
 * produces the same key).
 */
const STATIC_SALT = Buffer.from('swiftship/channel-credentials/v1', 'utf8');

let cachedKey: Buffer | null = null;

function resolveKey(): Buffer {
  if (cachedKey) return cachedKey;
  const raw = process.env.CHANNEL_ENCRYPTION_KEY;
  if (!raw || raw.length < 16) {
    throw new Error(
      'CHANNEL_ENCRYPTION_KEY env var is missing or too short (min 16 chars). ' +
        'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"',
    );
  }
  cachedKey = scryptSync(raw, STATIC_SALT, KEY_LEN);
  return cachedKey;
}

export function encryptCredentials(plaintext: string): string {
  const key = resolveKey();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

export function decryptCredentials(payload: string): string {
  const key = resolveKey();
  const buf = Buffer.from(payload, 'base64');
  if (buf.length < IV_LEN + TAG_LEN + 1) {
    throw new Error('Encrypted credentials: payload too short');
  }
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const enc = buf.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString(
    'utf8',
  );
}

/**
 * Convenience: encrypt an object as JSON.
 */
export function encryptJson(value: unknown): string {
  return encryptCredentials(JSON.stringify(value));
}

export function decryptJson<T = unknown>(payload: string): T {
  return JSON.parse(decryptCredentials(payload)) as T;
}

/** Test-only — clears the cached key. */
export function _resetCipherForTests(): void {
  cachedKey = null;
}
