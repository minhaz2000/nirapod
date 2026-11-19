/**
 * Browser-only photo loader used by every photo flow (plate, medicine pack, lab report, prescription, skin):
 * respects EXIF orientation, downscales very large photos while decoding (longest side PHOTO_MAX_SIDE), and turns
 * files the browser cannot open (e.g. HEIC on some Android browsers) into a clear PhotoError — never a crash.
 * Everything happens on the phone; nothing here sends the photo anywhere.
 */
import { fitWithin, orientationTransform, orientedSize, PHOTO_MAX_SIDE, readHeader, sniffFormat, swapsAxes, type PhotoFormat } from './exif';

export type PhotoErrorKind = 'unsupported' | 'notImage' | 'tooLarge' | 'empty';

export class PhotoError extends Error {
  constructor(public readonly kind: PhotoErrorKind) {
    super(kind);
  }
}

/** Larger files are refused before decoding (a phone photo is rarely above 20 MB). */
export const MAX_PHOTO_BYTES = 40 * 1024 * 1024;

export interface LoadedPhoto {
  bitmap: ImageBitmap;
  width: number;
  height: number;
  /** Upright size of the original photo. */
  originalWidth: number;
  originalHeight: number;
  format: PhotoFormat;
}

async function head(file: Blob, bytes = 128 * 1024) {
  return new Uint8Array(await file.slice(0, bytes).arrayBuffer());
}

/** Quick check without decoding: known image formats pass, HEIC and unknown files are tried later. */
export async function sniffPhoto(file: Blob): Promise<PhotoFormat> {
  if (!file.size) throw new PhotoError('empty');
  if (file.size > MAX_PHOTO_BYTES) throw new PhotoError('tooLarge');
  const format = sniffFormat(await head(file, 64));
  if (format === 'unknown' && file.type && !file.type.startsWith('image/')) throw new PhotoError('notImage');
  return format;
}

async function viaImageElement(file: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function toCanvas(width: number, height: number) {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  return c;
}

/** Decodes, orients and downscales a photo. Throws PhotoError when the file cannot be used. */
export async function loadPhoto(file: Blob, maxSide = PHOTO_MAX_SIDE): Promise<LoadedPhoto> {
  const format = await sniffPhoto(file);
  const header = readHeader(await head(file));
  const orientation = header?.orientation ?? 1;
  const upright = header ? orientedSize(header.width, header.height, orientation) : null;
  const target = upright ? fitWithin(upright.width, upright.height, maxSide) : null;

  let bitmap: ImageBitmap | null = null;
  try {
    // Decode straight to the reduced size where possible (no full-size copy in memory). In Chromium the resize
    // size refers to the upright output (checked with an EXIF-rotated photo in tests/e2e/photos.spec.ts).
    bitmap =
      target && target.scale < 1
        ? await createImageBitmap(file, { imageOrientation: 'from-image', resizeWidth: target.width, resizeHeight: target.height, resizeQuality: 'high' })
        : await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    bitmap = null;
  }

  if (bitmap && header && swapsAxes(orientation) && header.width !== header.height && bitmap.width === Math.round(header.width * (target?.scale ?? 1))) {
    // This browser ignored the EXIF orientation: fall through to the manual path.
    bitmap.close();
    bitmap = null;
  }

  if (!bitmap) {
    let img: HTMLImageElement;
    try {
      img = await viaImageElement(file);
    } catch {
      throw new PhotoError('unsupported');
    }
    // Browsers that support CSS image-orientation already return the upright image; others need the EXIF transform.
    const browserOrients = typeof CSS !== 'undefined' && CSS.supports?.('image-orientation', 'from-image');
    const o = browserOrients ? 1 : orientation;
    const up = orientedSize(img.naturalWidth, img.naturalHeight, o);
    const fit = fitWithin(up.width, up.height, maxSide);
    const canvas = toCanvas(fit.width, fit.height);
    const ctx = canvas.getContext('2d')!;
    ctx.scale(fit.scale, fit.scale);
    const m = orientationTransform(o, img.naturalWidth, img.naturalHeight);
    ctx.transform(...m);
    ctx.drawImage(img, 0, 0);
    bitmap = await createImageBitmap(canvas);
  }

  if (Math.max(bitmap.width, bitmap.height) > maxSide) {
    // Header size was unknown: downscale after decoding.
    const fit = fitWithin(bitmap.width, bitmap.height, maxSide);
    const canvas = toCanvas(fit.width, fit.height);
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, fit.width, fit.height);
    bitmap.close();
    bitmap = await createImageBitmap(canvas);
  }

  return {
    bitmap,
    width: bitmap.width,
    height: bitmap.height,
    originalWidth: upright?.width ?? bitmap.width,
    originalHeight: upright?.height ?? bitmap.height,
    format,
  };
}

/** Re-encodes a loaded photo as JPEG (e.g. to store a downscaled copy on the phone). */
export async function photoToJpeg(photo: LoadedPhoto, quality = 0.85): Promise<Blob> {
  const canvas = toCanvas(photo.width, photo.height);
  canvas.getContext('2d')!.drawImage(photo.bitmap, 0, 0);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new PhotoError('unsupported'))), 'image/jpeg', quality));
}
