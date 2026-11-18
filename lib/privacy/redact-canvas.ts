/** Browser-only: crops the prescription header and downscales before the photo leaves the phone (rule 9). */
import { cropRows, headerCropRow } from './redact';

const MAX_SIDE = 1600;

export interface RedactedImage {
  /** Base64 JPEG without the data: prefix. */
  base64: string;
  mediaType: 'image/jpeg';
  /** Object URL for showing the user exactly what will be sent. */
  previewUrl: string;
  width: number;
  height: number;
}

export async function redactPrescriptionImage(bitmap: ImageBitmap, headerFraction: number): Promise<RedactedImage> {
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const src = document.createElement('canvas');
  src.width = w;
  src.height = h;
  const sctx = src.getContext('2d', { willReadFrequently: true })!;
  sctx.drawImage(bitmap, 0, 0, w, h);
  const cropped = cropRows(sctx.getImageData(0, 0, w, h).data, w, h, headerCropRow(h, headerFraction));

  const out = document.createElement('canvas');
  out.width = cropped.width;
  out.height = cropped.height;
  out.getContext('2d')!.putImageData(new ImageData(cropped.data, cropped.width, cropped.height), 0, 0);
  const blob: Blob = await new Promise((resolve, reject) =>
    out.toBlob((b) => (b ? resolve(b) : reject(new Error('encode failed'))), 'image/jpeg', 0.85),
  );
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return { base64: btoa(binary), mediaType: 'image/jpeg', previewUrl: URL.createObjectURL(blob), width: out.width, height: out.height };
}
