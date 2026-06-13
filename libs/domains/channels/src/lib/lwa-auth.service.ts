import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { StructuredLogger } from '@swiftship/observability';

/**
 * LWA (Login with Amazon) auth service for the Amazon SP-API.
 *
 * The Selling Partner API uses two layers of auth:
 *   1. LWA — short-lived access token (~1h) obtained by exchanging a
 *      refresh token for client credentials. Sent in
 *      `x-amz-access-token` header on every SP-API call.
 *   2. AWS Signature V4 — signs the HTTP request with the seller's AWS
 *      IAM credentials. The IAM user is associated with the SP-API
 *      developer profile.
 *
 * This service handles (1) only. The AmazonAdapter handles (2).
 *
 * Token cache is per-(tenantId) so multi-tenant deployments can hold
 * different Amazon seller accounts. For the single-tenant default we
 * read from process.env.
 */
interface CachedToken {
  accessToken: string;
  /** Epoch ms when the token expires. We refresh ~60s before expiry. */
  expiresAt: number;
}

interface LwaCredentials {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

const LWA_TOKEN_URL = 'https://api.amazon.com/auth/o2/token';

@Injectable()
export class LwaAuthService implements OnModuleDestroy {
  private readonly log = new StructuredLogger();
  private readonly nestLog = new Logger(LwaAuthService.name);
  private readonly cache = new Map<string, CachedToken>();
  private readonly inFlight = new Map<string, Promise<string>>();

  /** Refresh the cached token a minute before it actually expires. */
  private static readonly SKEW_MS = 60_000;

  /**
   * Returns a valid LWA access token for the given tenant. Caches the
   * token and re-uses it until it expires. Concurrent callers share the
   * same in-flight refresh.
   *
   * `tenantId` is currently a logical key — credentials are read from
   * env vars. When the per-tenant secret store is wired, swap the
   * `resolveCredentials()` call for a SecretStore lookup.
   */
  async getAccessToken(tenantId: string): Promise<string> {
    const now = Date.now();
    const cached = this.cache.get(tenantId);
    if (cached && cached.expiresAt - LwaAuthService.SKEW_MS > now) {
      return cached.accessToken;
    }

    const pending = this.inFlight.get(tenantId);
    if (pending) return pending;

    const refresh = this.refresh(tenantId).finally(() => {
      this.inFlight.delete(tenantId);
    });
    this.inFlight.set(tenantId, refresh);
    return refresh;
  }

  /** Force the next call to re-fetch. Useful when a 401 comes back. */
  invalidate(tenantId: string): void {
    this.cache.delete(tenantId);
  }

  onModuleDestroy(): void {
    this.cache.clear();
    this.inFlight.clear();
  }

  // ---------- internals

  private async refresh(tenantId: string): Promise<string> {
    const creds = this.resolveCredentials(tenantId);
    if (!creds) {
      throw new Error(
        `[LwaAuthService] Missing LWA credentials for tenant=${tenantId}. ` +
          `Set AMAZON_CLIENT_ID, AMAZON_CLIENT_SECRET, AMAZON_REFRESH_TOKEN.`,
      );
    }

    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: creds.refreshToken,
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
    });

    const res = await fetch(LWA_TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      this.nestLog.error(
        `LWA refresh failed: status=${res.status} body=${text.slice(0, 200)}`,
      );
      throw new Error(
        `LWA token refresh failed (status ${res.status}): ${text.slice(0, 200)}`,
      );
    }

    const json = (await res.json()) as {
      access_token: string;
      expires_in: number;
      token_type: string;
    };

    const ttl = (json.expires_in ?? 3600) * 1000;
    this.cache.set(tenantId, {
      accessToken: json.access_token,
      expiresAt: Date.now() + ttl,
    });

    this.log.info('amazon.lwa.token.refreshed', {
      tenantId,
      expiresIn: json.expires_in,
    });

    return json.access_token;
  }

  /**
   * Resolve LWA credentials. Single-tenant deployments read from env.
   * For per-tenant, this should call a SecretStore (Vault / SSM / DB)
   * — see `libs/platform/auth` for the encryption-at-rest pattern.
   */
  private resolveCredentials(tenantId: string): LwaCredentials | null {
    const clientId = process.env.AMAZON_CLIENT_ID;
    const clientSecret = process.env.AMAZON_CLIENT_SECRET;
    const refreshToken = process.env.AMAZON_REFRESH_TOKEN;
    if (!clientId || !clientSecret || !refreshToken) return null;
    // tenantId is currently ignored — env-driven single-tenant default.
    void tenantId;
    return { clientId, clientSecret, refreshToken };
  }
}
