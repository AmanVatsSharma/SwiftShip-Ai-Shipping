'use client';

import { useCallback, useRef, useState } from 'react';
import { uploadPhotos, type UploadedPhoto } from '../../../lib/uploads';
import { useReturnsClient } from '../../../lib/returns';

const MAX_PHOTOS = 3;

type Props = {
  /** Currently-attached photos (already on the server). */
  initial?: UploadedPhoto[];
  /**
   * Called with the full list of photos after a successful upload. The
   * parent should then wire each photo to its ReturnItem via
   * `attachReturnPhoto`.
   */
  onUploaded: (photos: UploadedPhoto[]) => void;
  /** Disable input + clear the drop zone (e.g. after submit). */
  disabled?: boolean;
};

/**
 * Drag-and-drop + click-to-upload photo uploader for return items.
 * - Hard cap: 3 photos per item.
 * - Accepts image/* client-side as a first filter (the server re-validates).
 * - Uses `presignPhotoUpload` to PUT directly to S3.
 *
 * The photo <-> ReturnItem wiring (attachReturnPhoto) is the parent's job.
 */
export function PhotoUploader({ initial = [], onUploaded, disabled }: Props) {
  const [photos, setPhotos] = useState<UploadedPhoto[]>(initial);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const client = useReturnsClient();

  const handleFiles = useCallback(
    async (files: File[]) => {
      if (disabled) return;
      const remaining = MAX_PHOTOS - photos.length;
      if (remaining <= 0) {
        setError(`You can upload at most ${MAX_PHOTOS} photos.`);
        return;
      }
      const accepted = files
        .filter((f) => f.type.startsWith('image/'))
        .slice(0, remaining);
      if (accepted.length === 0) {
        setError('Please pick an image file (JPG, PNG, or HEIC).');
        return;
      }
      setError(null);
      setUploading(true);
      try {
        const uploaded = await uploadPhotos(client, accepted, MAX_PHOTOS);
        const next = [...photos, ...uploaded];
        setPhotos(next);
        onUploaded(next);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Upload failed.');
      } finally {
        setUploading(false);
      }
    },
    [client, disabled, onUploaded, photos],
  );

  const removeAt = (idx: number) => {
    if (disabled) return;
    const next = photos.filter((_, i) => i !== idx);
    setPhotos(next);
    onUploaded(next);
  };

  return (
    <div>
      <div
        onDragOver={(e) => {
          if (disabled) return;
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (disabled) return;
          handleFiles(Array.from(e.dataTransfer.files));
        }}
        onClick={() => {
          if (!disabled) inputRef.current?.click();
        }}
        className={[
          'flex cursor-pointer flex-col items-center justify-center rounded-md border-2 border-dashed px-4 py-6 text-center text-sm transition',
          dragOver
            ? 'border-brand-500 bg-brand-50 text-brand-700'
            : 'border-slate-300 bg-slate-50 text-slate-600 hover:border-slate-400',
          disabled ? 'pointer-events-none opacity-60' : '',
        ].join(' ')}
        role="button"
        tabIndex={0}
        aria-label="Upload photos"
      >
        <div className="font-medium text-slate-700">
          {uploading
            ? 'Uploading…'
            : `Drop photos here or click to choose (${photos.length}/${MAX_PHOTOS})`}
        </div>
        <div className="mt-1 text-xs text-slate-500">
          JPG, PNG, or HEIC. Up to {MAX_PHOTOS} photos per item.
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) handleFiles(Array.from(e.target.files));
            // reset so the same file can be re-picked
            e.target.value = '';
          }}
        />
      </div>

      {error && (
        <div className="mt-2 text-sm text-rose-600">{error}</div>
      )}

      {photos.length > 0 && (
        <ul className="mt-3 grid grid-cols-3 gap-2">
          {photos.map((p, i) => (
            <li
              key={p.key}
              className="group relative overflow-hidden rounded-md border border-slate-200"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.publicUrl}
                alt={`Return photo ${i + 1}`}
                className="h-24 w-full object-cover"
              />
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  removeAt(i);
                }}
                disabled={disabled}
                className="absolute right-1 top-1 rounded-full bg-white/90 px-2 py-0.5 text-xs text-slate-700 shadow-sm hover:bg-white disabled:opacity-50"
                aria-label="Remove photo"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
