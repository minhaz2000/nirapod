import { describe, expect, it } from 'vitest';
import { assessQuality } from '@/lib/ai/quality';
import { estimateSkewAngle, laplacianVariance, meanBrightness, otsuThreshold, stretchContrast, toGrayscale } from '@/lib/ocr/image';

/** White page with dark "text lines" (dashed bars) rotated by `deg` about the centre. */
function syntheticPage(deg: number, w = 400, h = 300, opts: { ink?: number; paper?: number; invert?: boolean } = {}) {
  const { ink = 20, paper = 235, invert = false } = opts;
  const g = new Uint8Array(w * h).fill(invert ? ink : paper);
  const a = (deg * Math.PI) / 180;
  const cx = w / 2;
  const cy = h / 2;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // un-rotate the pixel back into page coordinates
      const px = (x - cx) * Math.cos(-a) - (y - cy) * Math.sin(-a) + cx;
      const py = (x - cx) * Math.sin(-a) + (y - cy) * Math.cos(-a) + cy;
      const inLine = py > 40 && py < 260 && Math.floor(py) % 24 < 7;
      const inWord = px > 40 && px < 360 && Math.floor(px / 9) % 6 !== 5;
      if (inLine && inWord) g[y * w + x] = invert ? paper : ink;
    }
  }
  return { g, w, h };
}

function boxBlur(g: Uint8Array, w: number, h: number, r: number) {
  const out = new Uint8Array(g.length);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let s = 0;
      let n = 0;
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          const yy = Math.min(h - 1, Math.max(0, y + dy));
          const xx = Math.min(w - 1, Math.max(0, x + dx));
          s += g[yy * w + xx]!;
          n++;
        }
      out[y * w + x] = Math.round(s / n);
    }
  return out;
}

describe('grey + contrast', () => {
  it('converts RGBA to luma', () => {
    expect([...toGrayscale(new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 255, 255, 0, 0, 255]), 3, 1)]).toEqual([255, 0, 76]);
  });

  it('stretches a washed-out photo to the full range', () => {
    const flat = new Uint8Array(1000).map((_, i) => 100 + (i % 50)); // 100..149
    const out = stretchContrast(flat);
    expect(Math.min(...out)).toBe(0);
    expect(Math.max(...out)).toBe(255);
  });

  it('leaves a flat image alone', () => {
    expect([...stretchContrast(new Uint8Array(10).fill(128))]).toEqual(new Array(10).fill(128));
  });

  it('Otsu splits ink from paper', () => {
    const t = otsuThreshold(syntheticPage(0).g);
    expect(t).toBeGreaterThanOrEqual(20);
    expect(t).toBeLessThan(235);
  });
});

describe('estimateSkewAngle (straightening)', () => {
  it.each([0, 4, -6, 10])('finds a %d° tilt within 1°', (deg) => {
    const { g, w, h } = syntheticPage(deg);
    expect(Math.abs(estimateSkewAngle(g, w, h) - deg)).toBeLessThanOrEqual(1);
  });

  it('works for light text on a dark pack', () => {
    const { g, w, h } = syntheticPage(5, 400, 300, { invert: true });
    expect(Math.abs(estimateSkewAngle(g, w, h) - 5)).toBeLessThanOrEqual(1);
  });

  it('returns 0 for a blank image', () => {
    expect(estimateSkewAngle(new Uint8Array(100 * 100).fill(240), 100, 100)).toBe(0);
  });
});

describe('assessQuality', () => {
  const big = { width: 1200, height: 1600 };

  it('a sharp, well-lit page passes', () => {
    const { g, w, h } = syntheticPage(0);
    expect(assessQuality(g, w, h, big)).toMatchObject({ ok: true, issues: [] });
  });

  it('flags a blurred photo', () => {
    const { g, w, h } = syntheticPage(0);
    const blurred = boxBlur(g, w, h, 4);
    expect(laplacianVariance(blurred, w, h)).toBeLessThan(laplacianVariance(g, w, h));
    expect(assessQuality(blurred, w, h, big).issues).toContain('blurry');
  });

  it('flags a dark photo and an over-exposed photo', () => {
    const { g, w, h } = syntheticPage(0, 400, 300, { ink: 5, paper: 40 });
    expect(meanBrightness(g)).toBeLessThan(55);
    expect(assessQuality(g, w, h, big).issues).toContain('tooDark');
    const bright = syntheticPage(0, 400, 300, { ink: 200, paper: 252 });
    expect(assessQuality(bright.g, bright.w, bright.h, big).issues).toContain('tooBright');
  });

  it('flags a photo that is too small', () => {
    const { g, w, h } = syntheticPage(0);
    expect(assessQuality(g, w, h, { width: 320, height: 240 }).issues).toContain('tooSmall');
  });
});
