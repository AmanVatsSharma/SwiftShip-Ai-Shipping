/**
 * SS-027a — tsoa DTOs for the Returns REST surface.
 *
 * Mirrors `src/returns/return.model.ts`. Public surface only.
 */
export interface ReturnResponse {
  id: number;
  returnNumber: string;
  status: 'REQUESTED' | 'APPROVED' | 'REJECTED' | 'COMPLETED' | 'CANCELLED';
  reason: string;
  pickupScheduledAt?: Date;
  orderId: number;
  createdAt: Date;
  updatedAt: Date;
}
