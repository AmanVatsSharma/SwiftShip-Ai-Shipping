import { Injectable } from '@nestjs/common';

/**
 * MeeshoAuthService
 *
 * Handles authentication for the Meesho Supplier API.
 *
 * STUBBED IMPLEMENTATION:
 * Meesho uses a static bearer token issued at supplier onboarding time. In
 * production this service would:
 *   1. Pull the token from a secret manager (or per-tenant vault)
 *   2. Refresh it on expiry (Meesho rotates tokens ~quarterly)
 *   3. Return it as `Authorization: Bearer <token>`
 *
 * For now we return whatever is in MEESHO_API_KEY.
 */
@Injectable()
export class MeeshoAuthService {
  /**
   * Get authentication headers for a Meesho API request
   *
   * @param tenantId - The tenant ID (for multi-tenancy)
   * @returns Headers object with Bearer authorization
   */
  async getAuthHeaders(tenantId: string): Promise<Record<string, string>> {
    const apiKey = process.env.MEESHO_API_KEY;

    if (!apiKey) {
      throw new Error(
        'Meesho credentials not configured. Set MEESHO_API_KEY.',
      );
    }

    return {
      Authorization: `Bearer ${apiKey}`,
      'X-Tenant-Id': tenantId,
      'Content-Type': 'application/json',
    };
  }
}
