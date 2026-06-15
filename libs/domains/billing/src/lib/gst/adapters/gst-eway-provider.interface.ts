/**
 * SS-032 — E-way bill provider adapter interface.
 *
 * Each adapter wraps a real (or sandbox) E-way bill API — ClearTax in
 * production, IRIS GST, Cygnet, or the e-Way Bill 1 API itself.
 *
 * The interface is deliberately narrow: one synchronous `generate` call
 * that returns a result, plus an `isReady` check so the GstModule can
 * log a clear warning at boot if the provider is not configured.
 *
 * To swap the provider, override the `GST_EWAY_PROVIDER_ADAPTER`
 * injection token in a top-level module (mirroring how SS-031 swaps
 * the bank verifier with `BANK_VERIFIER_ADAPTER`).
 */
export interface GstEwayGenerateRequest {
  /** Provider-agnostic unique key for idempotency. e.g. shipmentId. */
  shipmentId: number;
  /** GSTIN of the supplier (consignor). */
  supplierGstin: string;
  /** GSTIN of the recipient (consignee). Optional for unregistered buyers. */
  recipientGstin?: string | null;
  /** Free-text place of dispatch (e.g. "Mumbai, Maharashtra"). */
  fromAddress: string;
  /** Free-text place of delivery. */
  toAddress: string;
  /** Invoice / shipment value, in INR. */
  invoiceValue: number;
  /** HSN/SAC code (defaults to 996811). */
  hsnCode: string;
  /** Vehicle number (optional — Part A can be filed later). */
  vehicleNo?: string | null;
  /** Transporter GSTIN (optional). */
  transporterId?: string | null;
  /** Transporter trade name (optional). */
  transporterName?: string | null;
  /** Distance in km (used to compute validity window). */
  distanceKm?: number | null;
  /** Tenant id — kept in the request so the adapter can attach it to audit rows. */
  tenantId: number;
}

export interface GstEwayGenerateResult {
  ewbNo: string;
  validFrom: Date;
  validTo: Date;
  vehicleNo?: string | null;
  transporterId?: string | null;
  transporterName?: string | null;
  ewayBillUrl?: string | null;
  providerRef?: string | null;
  /** Provider's full response payload (audit / dispute). */
  providerPayload?: Record<string, any>;
}

export interface GstEwayProviderAdapter {
  /** Display name of the provider (cleartax-sandbox, iris, etc.). */
  readonly name: string;
  /** True if the adapter is wired with credentials and ready to issue. */
  isReady(): boolean;
  /** Issue a new E-way bill. Throws on error. */
  generate(req: GstEwayGenerateRequest): Promise<GstEwayGenerateResult>;
}

/**
 * DI token. The default binding is the ClearTax sandbox adapter; tests
 * can rebind it to a mock.
 */
export const GST_EWAY_PROVIDER_ADAPTER = 'GST_EWAY_PROVIDER_ADAPTER';
