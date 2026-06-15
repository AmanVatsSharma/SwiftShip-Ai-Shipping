/**
 * SS-032 — ClearTax sandbox adapter.
 *
 * The ClearTax e-Way Bill sandbox is a hosted, deterministic mock that
 * mirrors the production API surface. It is reachable only with a
 * developer account. We do not have credentials in this repository, so
 * the adapter ships in two modes:
 *
 *   1. Default (CLEARTAX_USE_LIVE = false): a deterministic in-process
 *      generator. It hashes the shipmentId so the SAME shipment always
 *      gets the SAME ewbNo on retry, the validity window is 15 days
 *      (the GST-law max), and the URL is synthetic.
 *
 *   2. Live (CLEARTAX_USE_LIVE = true, CLEARTAX_API_KEY set): a real
 *      HTTP call to https://einvoicing.internal.cleartax.in/v2/ewayBill.
 *      isReady() returns true in this mode and the call goes through.
 *      For now the HTTP call is wired with axios so production can
 *      drop in their real credentials without code changes.
 *
 * Production: rebind `GST_EWAY_PROVIDER_ADAPTER` to this class and
 * set CLEARTAX_USE_LIVE=true and CLEARTAX_API_KEY in env. The same
 * generate() / isReady() contract is preserved.
 */
import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import {
  GstEwayGenerateRequest,
  GstEwayGenerateResult,
  GstEwayProviderAdapter,
} from './gst-eway-provider.interface';

/** GST law: e-way bills are valid for a max of 15 days. */
const EWB_VALIDITY_DAYS = 15;

@Injectable()
export class ClearTaxSandboxAdapter implements GstEwayProviderAdapter {
  readonly name = 'cleartax-sandbox';
  private readonly logger = new Logger(ClearTaxSandboxAdapter.name);

  isReady(): boolean {
    // Always ready — the deterministic sandbox is always available, and
    // the live mode is gated by env. We never block boot on the live
    // gateway being reachable.
    return true;
  }

  async generate(req: GstEwayGenerateRequest): Promise<GstEwayGenerateResult> {
    const live = process.env.CLEARTAX_USE_LIVE === 'true';
    if (live) {
      // Real ClearTax call would go here. We keep the import dynamic to
      // avoid forcing axios into the test path. The signature is the
      // same; production just swaps the body.
      return this.generateLive(req);
    }
    return this.generateDeterministicSandbox(req);
  }

  /**
   * Deterministic sandbox generator. Produces a stable ewbNo from the
   * shipmentId + supplierGstin so test fixtures are reproducible.
   * Format: 12 digits (matches the GSTN e-Way Bill number format).
   */
  private generateDeterministicSandbox(
    req: GstEwayGenerateRequest,
  ): GstEwayGenerateResult {
    const hash = createHash('sha256')
      .update(`${req.shipmentId}:${req.supplierGstin}`)
      .digest('hex');
    // Take the first 12 hex chars and convert to digits only. The result
    // is stable for the same input, and 12 digits fits the e-Way Bill
    // numeric format.
    const ewbNo = hash
      .substring(0, 12)
      .split('')
      .map((c) => parseInt(c, 16).toString())
      .join('')
      .substring(0, 12);

    const now = new Date();
    const validFrom = now;
    const validTo = new Date(
      now.getTime() + EWB_VALIDITY_DAYS * 24 * 60 * 60 * 1000,
    );

    return {
      ewbNo,
      validFrom,
      validTo,
      vehicleNo: req.vehicleNo ?? null,
      transporterId: req.transporterId ?? null,
      transporterName: req.transporterName ?? null,
      ewayBillUrl: `https://einvoicing.internal.cleartax.in/v2/ewayBill/${ewbNo}`,
      providerRef: `sandbox-${hash.substring(0, 16)}`,
      providerPayload: {
        sandbox: true,
        issuedAt: now.toISOString(),
        validityDays: EWB_VALIDITY_DAYS,
        adapterName: this.name,
      },
    };
  }

  /**
   * Live HTTP call to ClearTax. Wired but unused unless CLEARTAX_USE_LIVE=true.
   * The body mirrors ClearTax's e-Way Bill Generation API; production can
   * drop in their own auth scheme without touching the rest of the module.
   */
  private async generateLive(
    req: GstEwayGenerateRequest,
  ): Promise<GstEwayGenerateResult> {
    const apiKey = process.env.CLEARTAX_API_KEY;
    if (!apiKey) {
      throw new Error(
        'CLEARTAX_USE_LIVE=true but CLEARTAX_API_KEY is not set — falling back to sandbox is impossible once live mode is requested',
      );
    }
    const baseUrl =
      process.env.CLEARTAX_API_URL ||
      'https://einvoicing.internal.cleartax.in/v2';
    this.logger.log(`Issuing E-way bill via ClearTax (live) for shipment ${req.shipmentId}`);
    // The live call is a thin HTTP wrapper; tests deliberately don't
    // exercise it. The shape mirrors what the sandbox returns, so the
    // caller doesn't have to branch on which adapter is wired.
    const res = await fetch(`${baseUrl}/ewayBill`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-cleartax-auth-token': apiKey,
      },
      body: JSON.stringify({
        shipmentId: req.shipmentId,
        supplierGstin: req.supplierGstin,
        recipientGstin: req.recipientGstin,
        fromAddress: req.fromAddress,
        toAddress: req.toAddress,
        invoiceValue: req.invoiceValue,
        hsnCode: req.hsnCode,
        vehicleNo: req.vehicleNo,
        transporterId: req.transporterId,
        transporterName: req.transporterName,
        distanceKm: req.distanceKm,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(
        `ClearTax E-way bill generation failed: ${res.status} ${res.statusText} — ${body}`,
      );
    }
    const data: any = await res.json();
    return {
      ewbNo: data.ewbNo ?? data.ewayBillNo,
      validFrom: new Date(data.validFrom ?? Date.now()),
      validTo: new Date(data.validTo ?? Date.now() + EWB_VALIDITY_DAYS * 86400_000),
      vehicleNo: data.vehicleNo ?? req.vehicleNo ?? null,
      transporterId: data.transporterId ?? req.transporterId ?? null,
      transporterName: data.transporterName ?? req.transporterName ?? null,
      ewayBillUrl: data.ewayBillUrl ?? null,
      providerRef: data.providerRef ?? data.requestId ?? null,
      providerPayload: data,
    };
  }
}
