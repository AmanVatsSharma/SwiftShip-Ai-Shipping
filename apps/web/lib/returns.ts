'use client';

import { gql, useApolloClient, useMutation, useQuery } from '@apollo/client';

/**
 * Typed Apollo helpers + GraphQL operations for the customer-facing return
 * portal. Mirrors the same shape as the merchant-side returns lib where it
 * exists, and adds the customer-only entry points (token resolution,
 * presign + photo upload, reverse pickup).
 *
 * The mutations and types below are split into two groups:
 *
 *   1. THINGS THAT EXIST IN THE BACKEND TODAY
 *      - createReturn (libs/domains/returns via src/returns/returns.resolver.ts)
 *      - returnsByOrder, filterReturns, return
 *      - The `Return` + `ReturnStatus` types
 *      - `RequestReturnToken` (issue a magic link for a given order+contact)
 *        — NOTE: also TODO(SS-021-backend), see below
 *
 *   2. THINGS THAT NEED A BACKEND MUTATION (TODOs left inline)
 *      - resolveReturnToken
 *      - presignPhotoUpload
 *      - addReturnItem
 *      - attachReturnPhoto
 *      - requestReturnPickup
 *      - chooseRefundMethod
 *      - The ReturnItem, ReturnPhoto, PresignedUpload, RefundMethod,
 *        OrderForReturn types
 *
 * The UI in apps/web/app/return/ calls these by name; if the backend
 * mutation is missing, the request fails loudly in the browser. This is
 * intentional — it keeps the front-end honest about what is and isn't
 * implemented without papering over the gap.
 */

// ---- Types that exist in the backend today ---------------------------------

export type ReturnStatus =
  | 'REQUESTED'
  | 'APPROVED'
  | 'REJECTED'
  | 'COMPLETED'
  | 'CANCELLED';

export type Return = {
  id: number;
  returnNumber: string;
  status: ReturnStatus;
  reason: string;
  pickupScheduledAt: string | null;
  orderId: number;
  createdAt: string;
  updatedAt: string;
};

// ---- Types that are pending on the backend --------------------------------

// TODO(SS-021-backend): `ReturnItem` is a 1:N child of Return (one per
// order-line the customer is returning). It needs to land in
// libs/domains/returns/ alongside the entity migration.
export type ReturnItem = {
  id: number;
  returnId: number;
  orderItemId: number;
  quantity: number;
  reason: string;
  photos: ReturnPhoto[];
};

// TODO(SS-021-backend): `ReturnPhoto` is the record of a photo key bound
// to a ReturnItem. Stored in S3 (see apps/web/lib/uploads.ts).
export type ReturnPhoto = {
  id: number;
  returnItemId: number;
  key: string;
  publicUrl: string;
  contentType: string;
  sizeBytes: number;
};

// TODO(SS-021-backend): 1:1 with the underlying Order, denormalized for
// the customer portal so we can render the order summary without giving
// the customer (no auth) access to the full order endpoint.
export type OrderForReturn = {
  id: number;
  orderNumber: string;
  placedAt: string;
  destinationName: string;
  destinationCity: string;
  destinationPincode: string;
  total: number;
  currency: string;
  items: {
    id: number;
    name: string;
    sku: string | null;
    imageUrl: string | null;
    quantity: number;
    unitPrice: number;
  }[];
};

// TODO(SS-021-backend): enum on the backend. Wallet credit is the
// pre-paid store balance; bank transfer is the offline NEFT/IMPS path
// for cash-on-delivery refunds.
export type RefundMethod = 'ORIGINAL' | 'WALLET' | 'BANK';

// ---- Mutations that exist in the backend today ---------------------------

const CREATE_RETURN = gql`
  mutation CustomerCreateReturn($input: CreateReturnInput!) {
    createReturn(createReturnInput: $input) {
      id
      returnNumber
      status
      orderId
    }
  }
`;

// ---- Queries that exist (returnsByOrder is what we use to confirm the
// magic link really resolves to something the customer owns) ---------------

const RETURNS_BY_ORDER = gql`
  query CustomerReturnsByOrder($orderId: Int!) {
    returnsByOrder(orderId: $orderId) {
      id
      returnNumber
      status
      orderId
    }
  }
`;

// ---- TODO(SS-021-backend): magic-link issuance. The customer enters an
// order ID + email/phone, and the backend mints a token, emails/SMSes it
// to the contact, and we 200-OK to the customer. The token is then used
// to resolve the order on the next page load.
const REQUEST_RETURN_TOKEN = gql`
  mutation CustomerRequestReturnToken(
    $orderNumber: String!
    $contact: String!
  ) {
    requestReturnToken(orderNumber: $orderNumber, contact: $contact) {
      delivered
    }
  }
`;

// ---- TODO(SS-021-backend): resolves a magic-link token to a hydrated
// order + the customer's existing return (if any). Returns null if the
// token is invalid or expired.
const RESOLVE_RETURN_TOKEN = gql`
  query CustomerResolveReturnToken($token: String!) {
    resolveReturnToken(token: $token) {
      token
      expiresAt
      order {
        id
        orderNumber
        placedAt
        destinationName
        destinationCity
        destinationPincode
        total
        currency
        items {
          id
          name
          sku
          imageUrl
          quantity
          unitPrice
        }
      }
      existingReturn {
        id
        returnNumber
        status
        reason
        pickupScheduledAt
        items {
          id
          orderItemId
          quantity
          reason
          photos {
            id
            key
            publicUrl
            contentType
            sizeBytes
          }
        }
      }
    }
  }
`;

// ---- TODO(SS-021-backend): add a ReturnItem row.
const ADD_RETURN_ITEM = gql`
  mutation CustomerAddReturnItem(
    $returnId: Int!
    $orderItemId: Int!
    $quantity: Int!
    $reason: String!
  ) {
    addReturnItem(
      returnId: $returnId
      orderItemId: $orderItemId
      quantity: $quantity
      reason: $reason
    ) {
      id
      orderItemId
      quantity
      reason
    }
  }
`;

// ---- TODO(SS-021-backend): bind an uploaded S3 photo key to a ReturnItem.
const ATTACH_RETURN_PHOTO = gql`
  mutation CustomerAttachReturnPhoto(
    $returnItemId: Int!
    $key: String!
    $contentType: String!
    $sizeBytes: Int!
  ) {
    attachReturnPhoto(
      returnItemId: $returnItemId
      key: $key
      contentType: $contentType
      sizeBytes: $sizeBytes
    ) {
      id
      key
      publicUrl
      contentType
      sizeBytes
    }
  }
`;

// ---- TODO(SS-021-backend): customer picks how they want their money
// back. Persisted on the Return row.
const CHOOSE_REFUND_METHOD = gql`
  mutation CustomerChooseRefundMethod(
    $returnId: Int!
    $method: String!
  ) {
    chooseRefundMethod(returnId: $returnId, method: $method) {
      id
      refundMethod
    }
  }
`;

// ---- TODO(SS-021-backend): optional reverse pickup. Backend creates the
// RTO shipment + schedules the pickup slot.
const REQUEST_RETURN_PICKUP = gql`
  mutation CustomerRequestReturnPickup(
    $returnId: Int!
    $scheduledAt: DateTime!
  ) {
    requestReturnPickup(returnId: $returnId, scheduledAt: $scheduledAt) {
      id
      pickupScheduledAt
    }
  }
`;

// ---- React hooks ---------------------------------------------------------

export function useRequestReturnToken() {
  return useMutation<{ requestReturnToken: { delivered: boolean } }>(
    REQUEST_RETURN_TOKEN,
  );
}

export function useResolveReturnToken(token: string) {
  type ResolveData = {
    resolveReturnToken: {
      token: string;
      expiresAt: string;
      order: OrderForReturn;
      existingReturn: (Return & { items: ReturnItem[] }) | null;
    } | null;
  };
  return useQuery<ResolveData>(RESOLVE_RETURN_TOKEN, {
    variables: { token },
    skip: !token,
    fetchPolicy: 'network-only',
  });
}

export function useCreateReturn() {
  return useMutation<{ createReturn: Return }>(CREATE_RETURN);
}

export function useReturnsByOrder(orderId: number | null) {
  return useQuery<{ returnsByOrder: Return[] }>(RETURNS_BY_ORDER, {
    variables: { orderId },
    skip: !orderId,
  });
}

export function useAddReturnItem() {
  return useMutation<{ addReturnItem: ReturnItem }>(ADD_RETURN_ITEM);
}

export function useAttachReturnPhoto() {
  return useMutation<{ attachReturnPhoto: ReturnPhoto }>(ATTACH_RETURN_PHOTO);
}

export function useChooseRefundMethod() {
  return useMutation<{ chooseRefundMethod: Return }>(CHOOSE_REFUND_METHOD);
}

export function useRequestReturnPickup() {
  return useMutation<{ requestReturnPickup: Return }>(REQUEST_RETURN_PICKUP);
}

/**
 * Convenience: callers that want a one-shot client (e.g. inside non-React
 * utility code) can call this. The rest of the portal uses hooks.
 */
export function useReturnsClient() {
  return useApolloClient();
}
