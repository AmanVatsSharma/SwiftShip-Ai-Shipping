'use client';

/**
 * S3 photo upload helper used by the customer return portal.
 *
 * Flow:
 *   1. Front-end calls presignPhotoUpload(filename, contentType) to get
 *      { uploadUrl, publicUrl, key, headers }.
 *   2. Front-end PUTs the file directly to `uploadUrl` with the returned
 *      headers. S3 returns 200 + an ETag.
 *   3. The front-end then calls the GraphQL mutation that accepts
 *      `photoKey` (e.g. attachReturnPhoto) — the backend stores `key` and
 *      serves `publicUrl` to the merchant UI.
 *
 * The presign step must happen client-side because the response carries a
 * short-lived signed URL we don't want caching.
 */

// TODO(SS-021-backend): the `presignPhotoUpload` mutation does not exist in
// `libs/domains/returns/` yet. Today the returns GraphQL module only exposes
// createReturn / updateReturn / deleteReturn / returns queries. Adding the
// presign + addReturnItem + attachReturnPhoto + requestReturnPickup mutations
// (and the matching `PresignedUpload`, `ReturnItem`, `ReturnPhoto` types) is
// tracked under a separate backend bead. Until then `presignPhotoUpload`
// throws so the UI does not silently upload to nothing.
export type PresignedUpload = {
  uploadUrl: string;
  publicUrl: string;
  key: string;
  headers: Record<string, string>;
};

export type UploadedPhoto = {
  key: string;
  publicUrl: string;
  contentType: string;
  sizeBytes: number;
};

const PRESIGN_MUTATION = /* GraphQL */ `
  mutation PresignReturnPhoto(
    $filename: String!
    $contentType: String!
  ) {
    presignPhotoUpload(filename: $filename, contentType: $contentType) {
      uploadUrl
      publicUrl
      key
      headers
    }
  }
`;

/**
 * Ask the API for a signed S3 PUT URL. Throws on missing mutation so that
 * a half-shipped backend surfaces as a clear error in the UI.
 */
export async function presignPhotoUpload(
  apollo: { mutate: (opts: { mutation: string; variables: Record<string, unknown> }) => Promise<{ data?: { presignPhotoUpload?: PresignedUpload }; errors?: unknown }> },
  filename: string,
  contentType: string,
): Promise<PresignedUpload> {
  const res = await apollo.mutate({
    mutation: PRESIGN_MUTATION,
    variables: { filename, contentType },
  });
  const presigned = res.data?.presignPhotoUpload;
  if (!presigned) {
    const msg =
      'presignPhotoUpload mutation is not available on the backend yet. ' +
      'See TODO in apps/web/lib/uploads.ts.';
    throw new Error(msg);
  }
  return presigned;
}

/**
 * Upload a single file to S3 via the presigned URL.
 * Returns the metadata that needs to be sent back to the backend.
 */
export async function uploadPhoto(
  apollo: { mutate: (opts: { mutation: string; variables: Record<string, unknown> }) => Promise<{ data?: { presignPhotoUpload?: PresignedUpload }; errors?: unknown }> },
  file: File,
): Promise<UploadedPhoto> {
  const presigned = await presignPhotoUpload(apollo, file.name, file.type || 'application/octet-stream');

  const putRes = await fetch(presigned.uploadUrl, {
    method: 'PUT',
    headers: presigned.headers,
    body: file,
  });
  if (!putRes.ok) {
    throw new Error(
      `S3 upload failed: ${putRes.status} ${putRes.statusText}`,
    );
  }

  return {
    key: presigned.key,
    publicUrl: presigned.publicUrl,
    contentType: file.type || 'application/octet-stream',
    sizeBytes: file.size,
  };
}

/**
 * Upload up to `max` files in parallel. Stops on first failure.
 * Resolves with the array of uploaded-photo metadata in input order.
 */
export async function uploadPhotos(
  apollo: { mutate: (opts: { mutation: string; variables: Record<string, unknown> }) => Promise<{ data?: { presignPhotoUpload?: PresignedUpload }; errors?: unknown }> },
  files: File[],
  max: number,
): Promise<UploadedPhoto[]> {
  if (files.length > max) {
    throw new Error(`At most ${max} photos are allowed per item.`);
  }
  // Sequential to keep presign + PUT ordering deterministic and to make
  // partial-failure UX easier to reason about.
  const out: UploadedPhoto[] = [];
  for (const f of files) {
    out.push(await uploadPhoto(apollo, f));
  }
  return out;
}
