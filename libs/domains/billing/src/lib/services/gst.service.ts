import { Injectable, Logger } from '@nestjs/common';

/**
 * GST Service
 * 
 * Handles GST (Goods and Services Tax) calculations for India.
 * 
 * GST Types:
 * - CGST (Central GST): Applied on intra-state transactions
 * - SGST (State GST): Applied on intra-state transactions
 * - IGST (Integrated GST): Applied on inter-state transactions
 * 
 * Rules:
 * - Intra-state (same state): CGST + SGST (each half of tax rate)
 * - Inter-state (different states): IGST (full tax rate)
 * 
 * Common GST Rates:
 * - 0%: Essential goods
 * - 5%: Common items
 * - 12%: Standard items
 * - 18%: Standard rate (most common)
 * - 28%: Luxury items
 */
@Injectable()
export class GstService {
  private readonly logger = new Logger(GstService.name);

  /**
   * Calculate GST for an amount
   * 
   * @param baseAmount - Base amount before tax
   * @param taxRate - GST rate percentage (e.g., 18 for 18%)
   * @param isInterState - Whether transaction is inter-state
   * @returns GST calculation breakdown
   */
  calculateGst(
    baseAmount: number,
    taxRate: number,
    isInterState: boolean = false,
  ): {
    baseAmount: number;
    cgst: number;
    sgst: number;
    igst: number;
    totalTax: number;
    totalAmount: number;
    gstType: string;
  } {
    console.log('[GstService] calculateGst', { baseAmount, taxRate, isInterState });

    // Validate inputs
    if (baseAmount < 0) {
      throw new Error('Base amount cannot be negative');
    }
    if (taxRate < 0 || taxRate > 100) {
      throw new Error('Tax rate must be between 0 and 100');
    }

    const taxRateDecimal = taxRate / 100;
    let cgst = 0;
    let sgst = 0;
    let igst = 0;
    let gstType: string;

    if (isInterState) {
      // Inter-state: Apply IGST (full rate)
      igst = baseAmount * taxRateDecimal;
      gstType = 'IGST';
    } else {
      // Intra-state: Apply CGST + SGST (each half of rate)
      const halfRate = taxRateDecimal / 2;
      cgst = baseAmount * halfRate;
      sgst = baseAmount * halfRate;
      gstType = 'CGST+SGST';
    }

    const totalTax = cgst + sgst + igst;
    const totalAmount = baseAmount + totalTax;

    this.logger.log(`GST calculated: ${gstType} ${taxRate}%`, {
      baseAmount,
      totalTax,
      totalAmount,
    });

    return {
      baseAmount,
      cgst: Math.round(cgst * 100) / 100, // Round to 2 decimal places
      sgst: Math.round(sgst * 100) / 100,
      igst: Math.round(igst * 100) / 100,
      totalTax: Math.round(totalTax * 100) / 100,
      totalAmount: Math.round(totalAmount * 100) / 100,
      gstType,
    };
  }

  /**
   * Calculate GST for multiple items
   * 
   * @param items - Array of items with base amount and tax rate
   * @param isInterState - Whether transaction is inter-state
   * @returns Aggregated GST calculation
   */
  calculateGstForItems(
    items: Array<{ baseAmount: number; taxRate: number }>,
    isInterState: boolean = false,
  ): {
    baseAmount: number;
    cgst: number;
    sgst: number;
    igst: number;
    totalTax: number;
    totalAmount: number;
    gstType: string;
  } {
    console.log('[GstService] calculateGstForItems', { itemCount: items.length, isInterState });

    let totalBaseAmount = 0;
    let totalCgst = 0;
    let totalSgst = 0;
    let totalIgst = 0;

    for (const item of items) {
      const calculation = this.calculateGst(item.baseAmount, item.taxRate, isInterState);
      totalBaseAmount += calculation.baseAmount;
      totalCgst += calculation.cgst;
      totalSgst += calculation.sgst;
      totalIgst += calculation.igst;
    }

    const totalTax = totalCgst + totalSgst + totalIgst;
    const totalAmount = totalBaseAmount + totalTax;
    const gstType = isInterState ? 'IGST' : 'CGST+SGST';

    return {
      baseAmount: Math.round(totalBaseAmount * 100) / 100,
      cgst: Math.round(totalCgst * 100) / 100,
      sgst: Math.round(totalSgst * 100) / 100,
      igst: Math.round(totalIgst * 100) / 100,
      totalTax: Math.round(totalTax * 100) / 100,
      totalAmount: Math.round(totalAmount * 100) / 100,
      gstType,
    };
  }

  /**
   * Determine if transaction is inter-state based on GSTINs
   * 
   * @param consignorGstin - GSTIN of seller (first 2 digits are state code)
   * @param consigneeGstin - GSTIN of buyer (first 2 digits are state code)
   * @returns true if inter-state, false if intra-state
   */
  isInterState(consignorGstin: string, consigneeGstin: string): boolean {
    if (!consignorGstin || !consigneeGstin) {
      return false; // Default to intra-state if GSTINs not provided
    }

    const consignorStateCode = consignorGstin.substring(0, 2);
    const consigneeStateCode = consigneeGstin.substring(0, 2);

    return consignorStateCode !== consigneeStateCode;
  }

  /**
   * Validate GSTIN format
   * 
   * GSTIN format: 15 characters
   * - First 2 digits: State code
   * - Next 10 digits: PAN number
   * - 13th character: Entity number
   * - 14th character: 'Z' by default
   * - 15th character: Check digit
   */
  validateGstin(gstin: string): boolean {
    if (!gstin || gstin.length !== 15) {
      return false;
    }

    // Check if first 2 digits are valid state code (01-38)
    const stateCode = parseInt(gstin.substring(0, 2));
    if (isNaN(stateCode) || stateCode < 1 || stateCode > 38) {
      return false;
    }

    // Check if 14th character is 'Z'
    if (gstin[13] !== 'Z') {
      return false;
    }

    // TODO: Add check digit validation
    return true;
  }
}
