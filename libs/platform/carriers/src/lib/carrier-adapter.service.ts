import { Injectable } from '@nestjs/common';
import { CarrierAdapter } from './adapter.interface';
import { SandboxCarrierAdapter } from './adapters/sandbox.adapter';
import { DelhiveryAdapter } from './adapters/delhivery.adapter';
import { ConfigService } from '@nestjs/config';
import { XpressbeesAdapter } from './adapters/xpressbees.adapter';
import { BlueDartAdapter } from './adapters/bluedart.adapter';
import { DtdcAdapter } from './adapters/dtdc.adapter';
import { EcomExpressAdapter } from './adapters/ecom-express.adapter';
import { ShadowfaxAdapter } from './adapters/shadowfax.adapter';
import { FedExIndiaAdapter } from './adapters/fedex-india.adapter';
import { GatiAdapter } from './adapters/gati.adapter';

/**
 * Carrier Adapter Service
 * 
 * Manages all carrier adapters and provides access to them by carrier code.
 * 
 * Flow:
 * 1. Initializes all carrier adapters on service construction
 * 2. Registers adapters in a Map for O(1) lookup
 * 3. Provides getAdapter() method to retrieve adapters by code
 * 
 * Supported Carriers:
 * - SANDBOX: Mock carrier for testing
 * - DELHIVERY: Delhivery Express
 * - XPRESSBEES: Xpressbees Logistics
 * - BLUEDART: BlueDart Express
 * - DTDC: DTDC Express & Logistics
 * - ECOM_EXPRESS: Ecom Express
 * - SHADOWFAX: Shadowfax Logistics
 * - FEDEX_INDIA: FedEx India
 * - GATI: Gati Limited
 * 
 * Configuration:
 * Each carrier requires specific environment variables for authentication.
 * See individual adapter files for required configuration keys.
 */
@Injectable()
export class CarrierAdapterService {
  private readonly adapters: Map<string, CarrierAdapter> = new Map();

  constructor(private readonly config: ConfigService) {
    console.log('[CarrierAdapterService] Initializing carrier adapters...');

    // Sandbox adapter (always available for testing)
    const sandbox = new SandboxCarrierAdapter();
    this.adapters.set(sandbox.code, sandbox);
    console.log('[CarrierAdapterService] Registered SANDBOX adapter');

    // Delhivery adapter
    const delhiveryToken = this.config.get<string>('DELHIVERY_TOKEN');
    if (delhiveryToken) {
      try {
        const delhivery = new DelhiveryAdapter(delhiveryToken);
        this.adapters.set(delhivery.code, delhivery);
        console.log('[CarrierAdapterService] Registered DELHIVERY adapter');
      } catch (error) {
        console.error('[CarrierAdapterService] Failed to initialize Delhivery adapter', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    } else {
      console.warn('[CarrierAdapterService] DELHIVERY_TOKEN not configured, skipping Delhivery adapter');
    }

    // Xpressbees adapter (works without token, uses fallback)
    const xpressbeesToken = this.config.get<string>('XPRESSBEES_TOKEN');
    try {
      const xpressbees = new XpressbeesAdapter(xpressbeesToken);
      this.adapters.set(xpressbees.code, xpressbees);
      console.log('[CarrierAdapterService] Registered XPRESSBEES adapter');
    } catch (error) {
      console.error('[CarrierAdapterService] Failed to initialize Xpressbees adapter', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    // BlueDart adapter
    const bluedartApiKey = this.config.get<string>('BLUEDART_API_KEY');
    const bluedartLoginId = this.config.get<string>('BLUEDART_LOGIN_ID');
    if (bluedartApiKey && bluedartLoginId) {
      try {
        const bluedart = new BlueDartAdapter(bluedartApiKey, bluedartLoginId);
        this.adapters.set(bluedart.code, bluedart);
        console.log('[CarrierAdapterService] Registered BLUEDART adapter');
      } catch (error) {
        console.error('[CarrierAdapterService] Failed to initialize BlueDart adapter', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    } else {
      console.warn('[CarrierAdapterService] BLUEDART_API_KEY or BLUEDART_LOGIN_ID not configured, skipping BlueDart adapter');
    }

    // DTDC adapter
    const dtdcClientId = this.config.get<string>('DTDC_CLIENT_ID');
    const dtdcApiKey = this.config.get<string>('DTDC_API_KEY');
    if (dtdcClientId && dtdcApiKey) {
      try {
        const dtdc = new DtdcAdapter(dtdcClientId, dtdcApiKey);
        this.adapters.set(dtdc.code, dtdc);
        console.log('[CarrierAdapterService] Registered DTDC adapter');
      } catch (error) {
        console.error('[CarrierAdapterService] Failed to initialize DTDC adapter', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    } else {
      console.warn('[CarrierAdapterService] DTDC_CLIENT_ID or DTDC_API_KEY not configured, skipping DTDC adapter');
    }

    // Ecom Express adapter
    const ecomUsername = this.config.get<string>('ECOM_EXPRESS_USERNAME');
    const ecomPassword = this.config.get<string>('ECOM_EXPRESS_PASSWORD');
    if (ecomUsername && ecomPassword) {
      try {
        const ecom = new EcomExpressAdapter(ecomUsername, ecomPassword);
        this.adapters.set(ecom.code, ecom);
        console.log('[CarrierAdapterService] Registered ECOM_EXPRESS adapter');
      } catch (error) {
        console.error('[CarrierAdapterService] Failed to initialize Ecom Express adapter', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    } else {
      console.warn('[CarrierAdapterService] ECOM_EXPRESS_USERNAME or ECOM_EXPRESS_PASSWORD not configured, skipping Ecom Express adapter');
    }

    // Shadowfax adapter
    const shadowfaxApiKey = this.config.get<string>('SHADOWFAX_API_KEY');
    const shadowfaxSecretKey = this.config.get<string>('SHADOWFAX_SECRET_KEY');
    if (shadowfaxApiKey && shadowfaxSecretKey) {
      try {
        const shadowfax = new ShadowfaxAdapter(shadowfaxApiKey, shadowfaxSecretKey);
        this.adapters.set(shadowfax.code, shadowfax);
        console.log('[CarrierAdapterService] Registered SHADOWFAX adapter');
      } catch (error) {
        console.error('[CarrierAdapterService] Failed to initialize Shadowfax adapter', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    } else {
      console.warn('[CarrierAdapterService] SHADOWFAX_API_KEY or SHADOWFAX_SECRET_KEY not configured, skipping Shadowfax adapter');
    }

    // FedEx India adapter
    const fedexClientId = this.config.get<string>('FEDEX_INDIA_CLIENT_ID');
    const fedexClientSecret = this.config.get<string>('FEDEX_INDIA_CLIENT_SECRET');
    const fedexAccountNumber = this.config.get<string>('FEDEX_INDIA_ACCOUNT_NUMBER');
    if (fedexClientId && fedexClientSecret && fedexAccountNumber) {
      try {
        const fedex = new FedExIndiaAdapter(fedexClientId, fedexClientSecret, fedexAccountNumber);
        this.adapters.set(fedex.code, fedex);
        console.log('[CarrierAdapterService] Registered FEDEX_INDIA adapter');
      } catch (error) {
        console.error('[CarrierAdapterService] Failed to initialize FedEx India adapter', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    } else {
      console.warn('[CarrierAdapterService] FEDEX_INDIA_CLIENT_ID, FEDEX_INDIA_CLIENT_SECRET, or FEDEX_INDIA_ACCOUNT_NUMBER not configured, skipping FedEx India adapter');
    }

    // Gati adapter
    const gatiClientId = this.config.get<string>('GATI_CLIENT_ID');
    const gatiApiKey = this.config.get<string>('GATI_API_KEY');
    if (gatiClientId && gatiApiKey) {
      try {
        const gati = new GatiAdapter(gatiClientId, gatiApiKey);
        this.adapters.set(gati.code, gati);
        console.log('[CarrierAdapterService] Registered GATI adapter');
      } catch (error) {
        console.error('[CarrierAdapterService] Failed to initialize Gati adapter', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    } else {
      console.warn('[CarrierAdapterService] GATI_CLIENT_ID or GATI_API_KEY not configured, skipping Gati adapter');
    }

    console.log(`[CarrierAdapterService] Initialization complete. Registered ${this.adapters.size} carrier adapter(s)`, {
      carriers: Array.from(this.adapters.keys()),
    });
  }

  /**
   * Get a carrier adapter by its code
   * @param code - The carrier code (e.g., 'DELHIVERY', 'BLUEDART')
   * @returns The carrier adapter instance or undefined if not found
   */
  getAdapter(code: string): CarrierAdapter | undefined {
    return this.adapters.get(code);
  }

  /**
   * Get all registered carrier codes
   * @returns Array of carrier codes
   */
  getAvailableCarriers(): string[] {
    return Array.from(this.adapters.keys());
  }
}
