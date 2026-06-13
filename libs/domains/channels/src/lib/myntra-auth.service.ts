import { Injectable } from '@nestjs/common';

/**
 * MyntraAuthService
 *
 * Handles authentication for the Myntra Partner API.
 *
 * STUBBED IMPLEMENTATION:
 * Myntra issues a long-lived bearer token per partner ID. In production this
 * service would:
 *   1. Resolve the partner's token from a per-tenant secret store
 *   2. Refresh on expiry
 *   3. Return it as `Authorization: Bearer <token>`
 *
 * For now we return whatever is in MYNTRA_API_KEY.
 */
@Injectable()
export class MyntraAuthService {
  /**
   * Get authentication headers for a Myntra API request
   *
   * @param tenantId - The tenant ID (for multi-tenancy)
   * @returns Headers object with Bearer authorization
   */
  async getAuthHeaders(tenantId: string): Promise<Record<string, string>> {
    const apiKey = process.env.MYNTRA_API_KEY;

    if (!apiKey) {
      throw new Error(
        'Myntra credentials not configured. Set MYNTRA_API_KEY.',
      );
    }

    return {
      Authorization: `Bearer ${apiKey}`,
      'X-Tenant-Id': tenantId,
      'Content-Type': 'application/json',
    };
  }
}
