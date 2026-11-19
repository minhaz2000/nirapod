import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { fitWithin, orientationTransform, orientedSize, PHOTO_MAX_SIDE, readHeader, sniffFormat, swapsAxes } from '@/lib/image/exif';

const fixture = (name: string) => new Uint8Array(readFileSync(path.join(__dirname, '..', 'fixtures', name)));
const sample = (name: string) => new Uint8Array(readFileSync(path.join(__dirname, '..', '..', 'public', 'samples', name)));

/** Minimal JPEG: SOI, APP1 Exif with one Orientation entry, SOF0 with the given size. */
function jpeg(width: number, height: number, orientation: number | null, little = true) {
  const u16 = (v: number) => (little ? [v & 0xff, v >> 8] : [v >> 8, v & 0xff]);
  const u32 = (v: number) => (little ? [v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, v >>> 24] : [v >>> 24, (v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff]);
  const bytes = [0xff, 0xd8];
  if (orientation !== null) {
    const tiff = [...(little ? [0x49, 0x49] : [0x4d, 0x4d]), ...u16(42), ...u32(8), ...u16(1), ...u16(0x0112), ...u16(3), ...u32(1), ...u16(orientation), 0, 0, ...u32(0)];
    const seg = [0x45, 0x78, 0x69, 0x66, 0, 0, ...tiff];
    bytes.push(0xff, 0xe1, (seg.length + 2) >> 8, (seg.length + 2) & 0xff, ...seg);
  }
  bytes.push(0xff, 0xc0, 0, 17, 8, height >> 8, height & 0xff, width >> 8, width & 0xff, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1);
  bytes.push(0xff, 0xda, 0, 2, 0xff, 0xd9);
  return new Uint8Array(bytes);
}

/** Applies a canvas transform to a point. */
const apply = ([a, b, c, d, e, f]: number[], x: number, y: number) => [a! * x + c! * y + e!, b! * x + d! * y + f!];

describe('fitWithin (downscale before processing)', () => {
  it('shrinks a 4000 × 3000 phone photo to 1600 on the longest side', () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: 1600, height: 1200, scale: 0.4 });
    expect(fitWithin(3000, 4000)).toMatchObject({ width: 1200, height: 1600 });
    expect(PHOTO_MAX_SIDE).toBe(1600);
  });
  it('never enlarges small photos', () => {
    expect(fitWithin(640, 480)).toEqual({ width: 640, height: 480, scale: 1 });
  });
  it('keeps at least one pixel for extreme panoramas', () => {
    expect(fitWithin(20000, 5, 1600)).toMatchObject({ width: 1600, height: 1 });
  });
});

describe('orientation helpers', () => {
  it('swaps axes only for orientations 5–8', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8].map(swapsAxes)).toEqual([false, false, false, false, true, true, true, true]);
    expect(orientedSize(488, 409, 6)).toEqual({ width: 409, height: 488 });
    expect(orientedSize(488, 409, 3)).toEqual({ width: 488, height: 409 });
  });

  it('maps the stored image corners onto the upright canvas for every orientation', () => {
    const w = 4;
    const h = 2;
    // Where the stored top-left pixel corner (0,0) ends up after the transform.
    const topLeftTo: Record<number, [number, number]> = { 1: [0, 0], 2: [w, 0], 3: [w, h], 4: [0, h], 5: [0, 0], 6: [h, 0], 7: [h, w], 8: [0, w] };
    for (let o = 1; o <= 8; o++) {
      const m = orientationTransform(o, w, h);
      expect(apply(m, 0, 0)).toEqual(topLeftTo[o]);
      const up = orientedSize(w, h, o);
      // All four corners stay inside the upright canvas.
      for (const [x, y] of [[0, 0], [w, 0], [0, h], [w, h]] as const) {
        const [px, py] = apply(m, x, y);
        expect(px).toBeGreaterThanOrEqual(0);
        expect(py).toBeGreaterThanOrEqual(0);
        expect(px).toBeLessThanOrEqual(up.width);
        expect(py).toBeLessThanOrEqual(up.height);
      }
    }
  });

  it('orientation 6 (phone held upright, rotated 90° clockwise) puts the stored top row on the right', () => {
    const m = orientationTransform(6, 488, 409);
    expect(apply(m, 0, 0)).toEqual([409, 0]);
    expect(apply(m, 488, 0)).toEqual([409, 488]);
  });
});

describe('readHeader / sniffFormat', () => {
  it('reads EXIF orientation in both byte orders', () => {
    for (const little of [true, false]) {
      for (let o = 1; o <= 8; o++) expect(readHeader(jpeg(300, 200, o, little))).toEqual({ width: 300, height: 200, orientation: o });
    }
  });
  it('treats a missing or invalid orientation as upright', () => {
    expect(readHeader(jpeg(300, 200, null))?.orientation).toBe(1);
    expect(readHeader(jpeg(300, 200, 9))?.orientation).toBe(1);
  });
  it('reads the real EXIF-rotated plate fixture', () => {
    expect(readHeader(fixture('plate-1-exif6.jpg'))).toEqual({ width: 488, height: 409, orientation: 6 });
    expect(sniffFormat(fixture('plate-1-exif6.jpg'))).toBe('jpeg');
  });
  it('reads PNG sizes', () => {
    const png = sample('lab-report.png');
    expect(sniffFormat(png)).toBe('png');
    const h = readHeader(png)!;
    expect(h.orientation).toBe(1);
    expect(h.width).toBeGreaterThan(0);
  });
  it('recognises HEIC so the app can ask for JPG / PNG', () => {
    expect(sniffFormat(fixture('photo.heic'))).toBe('heic');
    expect(readHeader(fixture('photo.heic'))).toBeNull();
  });
  it('returns unknown / null for non-images', () => {
    const text = new TextEncoder().encode('Napa 500 mg paracetamol');
    expect(sniffFormat(text)).toBe('unknown');
    expect(readHeader(text)).toBeNull();
    expect(readHeader(new Uint8Array([0xff, 0xd8, 0xff]))).toBeNull(); // truncated JPEG
  });
});
