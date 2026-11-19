/**
 * Pure helpers for photos chosen from the camera or gallery (no DOM, unit-tested):
 * file-type sniffing, header dimensions (JPEG / PNG / WebP), EXIF orientation, the canvas transform for each
 * orientation, and the size to downscale to.
 */

export type PhotoFormat = 'jpeg' | 'png' | 'webp' | 'gif' | 'bmp' | 'heic' | 'avif' | 'unknown';

const ascii = (b: Uint8Array, from: number, len: number) => String.fromCharCode(...b.subarray(from, from + len));

/** Identifies the format from the first bytes (file names and MIME types from galleries are not reliable). */
export function sniffFormat(head: Uint8Array): PhotoFormat {
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'jpeg';
  if (head[0] === 0x89 && ascii(head, 1, 3) === 'PNG') return 'png';
  if (ascii(head, 0, 4) === 'RIFF' && ascii(head, 8, 4) === 'WEBP') return 'webp';
  if (ascii(head, 0, 3) === 'GIF') return 'gif';
  if (ascii(head, 0, 2) === 'BM') return 'bmp';
  if (ascii(head, 4, 4) === 'ftyp') {
    const brand = ascii(head, 8, 4);
    if (/^(avif|avis)$/.test(brand)) return 'avif';
    if (/^(heic|heix|hevc|hevx|heim|heis|mif1|msf1)$/.test(brand)) return 'heic';
  }
  return 'unknown';
}

export interface HeaderInfo {
  width: number;
  height: number;
  /** EXIF orientation 1–8 (1 = upright). */
  orientation: number;
}

function readU16(b: Uint8Array, at: number, little: boolean) {
  return little ? b[at]! | (b[at + 1]! << 8) : (b[at]! << 8) | b[at + 1]!;
}
function readU32(b: Uint8Array, at: number, little: boolean) {
  return little
    ? (b[at]! | (b[at + 1]! << 8) | (b[at + 2]! << 16) | (b[at + 3]! << 24)) >>> 0
    : ((b[at]! << 24) | (b[at + 1]! << 16) | (b[at + 2]! << 8) | b[at + 3]!) >>> 0;
}

/** EXIF orientation from a JPEG APP1 segment (TIFF header at `tiff`); 1 if absent or invalid. */
function exifOrientation(b: Uint8Array, tiff: number, end: number): number {
  if (tiff + 8 > end) return 1;
  const order = ascii(b, tiff, 2);
  if (order !== 'II' && order !== 'MM') return 1;
  const little = order === 'II';
  const ifd = tiff + readU32(b, tiff + 4, little);
  if (ifd + 2 > end) return 1;
  const count = readU16(b, ifd, little);
  for (let i = 0; i < count; i++) {
    const entry = ifd + 2 + i * 12;
    if (entry + 12 > end) break;
    if (readU16(b, entry, little) === 0x0112) {
      const v = readU16(b, entry + 8, little);
      return v >= 1 && v <= 8 ? v : 1;
    }
  }
  return 1;
}

/** Width, height and EXIF orientation from the file header, or null if they cannot be read. */
export function readHeader(b: Uint8Array): HeaderInfo | null {
  const format = sniffFormat(b);
  if (format === 'png' && b.length >= 24) {
    return { width: readU32(b, 16, false), height: readU32(b, 20, false), orientation: 1 };
  }
  if (format === 'webp' && b.length >= 30) {
    const chunk = ascii(b, 12, 4);
    if (chunk === 'VP8X') return { width: 1 + (b[24]! | (b[25]! << 8) | (b[26]! << 16)), height: 1 + (b[27]! | (b[28]! << 8) | (b[29]! << 16)), orientation: 1 };
    if (chunk === 'VP8 ') return { width: readU16(b, 26, true) & 0x3fff, height: readU16(b, 28, true) & 0x3fff, orientation: 1 };
    if (chunk === 'VP8L') {
      const bits = readU32(b, 21, true);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1, orientation: 1 };
    }
    return null;
  }
  if (format !== 'jpeg') return null;
  let orientation = 1;
  let i = 2;
  while (i + 4 <= b.length) {
    if (b[i] !== 0xff) {
      i++;
      continue;
    }
    const marker = b[i + 1]!;
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    const len = readU16(b, i + 2, false);
    if (len < 2) return null;
    const seg = i + 4;
    if (marker === 0xe1 && ascii(b, seg, 4) === 'Exif') orientation = exifOrientation(b, seg + 6, Math.min(b.length, seg + len - 2));
    // SOF0–SOF15 except DHT (C4), JPG (C8) and DAC (CC)
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      if (seg + 5 > b.length) return null;
      return { height: readU16(b, seg + 1, false), width: readU16(b, seg + 3, false), orientation };
    }
    if (marker === 0xda) return null; // start of scan before a frame header: give up
    i = seg + len - 2;
  }
  return null;
}

/** Orientations 5–8 swap width and height. */
export const swapsAxes = (orientation: number) => orientation >= 5 && orientation <= 8;

export function orientedSize(width: number, height: number, orientation: number) {
  return swapsAxes(orientation) ? { width: height, height: width } : { width, height };
}

/**
 * Canvas transform [a, b, c, d, e, f] that draws a stored image of `width` × `height` upright, for EXIF orientation
 * 1–8 (use with ctx.setTransform on a canvas of orientedSize).
 */
export function orientationTransform(orientation: number, width: number, height: number): [number, number, number, number, number, number] {
  switch (orientation) {
    case 2:
      return [-1, 0, 0, 1, width, 0];
    case 3:
      return [-1, 0, 0, -1, width, height];
    case 4:
      return [1, 0, 0, -1, 0, height];
    case 5:
      return [0, 1, 1, 0, 0, 0];
    case 6:
      return [0, 1, -1, 0, height, 0];
    case 7:
      return [0, -1, -1, 0, height, width];
    case 8:
      return [0, -1, 1, 0, 0, width];
    default:
      return [1, 0, 0, 1, 0, 0];
  }
}

/** Default longest side for photos before any processing (memory-safe on low-cost phones). */
export const PHOTO_MAX_SIDE = 1600;

/** Size that fits within maxSide on the longest side, keeping the aspect ratio; never enlarges. */
export function fitWithin(width: number, height: number, maxSide = PHOTO_MAX_SIDE) {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)), scale };
}
