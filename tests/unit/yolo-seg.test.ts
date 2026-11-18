import { describe, expect, it } from 'vitest';
import { boxToOriginal, decodeOutput, iou, letterbox, maskProbabilities, nms, postprocess, rgbaToChw, upscaleMask, type Candidate } from '@/lib/ai/yolo-seg';

/**
 * Fixture output in the exact food_seg layout but small: input 64×64, A anchors, 3 classes, 2 mask channels,
 * prototypes 16×16. Anchor values are written channel-major like the real output0.
 */
function fixture() {
  const nc = 3;
  const nm = 2;
  const A = 5;
  const C = 4 + nc + nm;
  const out0 = new Float32Array(C * A);
  const set = (a: number, v: number[]) => v.forEach((x, c) => (out0[c * A + a] = x));
  // cx, cy, w, h, s0, s1, s2, k0, k1
  set(0, [16, 16, 16, 16, 0.9, 0.05, 0.0, 6, 0]); // class 0 ("rice"), confident, uses prototype 0
  set(1, [17, 16, 16, 16, 0.8, 0.0, 0.0, 6, 0]); // duplicate of anchor 0 (IoU high) → removed by NMS
  set(2, [17, 16, 16, 16, 0.0, 0.7, 0.0, 6, 0]); // same place, different class → kept (class-wise NMS)
  set(3, [48, 48, 16, 16, 0.0, 0.0, 0.4, 0, 6]); // class 2, below min_confidence → "not sure", uses prototype 1
  set(4, [40, 10, 8, 8, 0.1, 0.1, 0.1, 6, 6]); // below candidate score → dropped
  const mh = 16;
  const mw = 16;
  const protos = new Float32Array(nm * mh * mw).fill(-6); // sigmoid(-36) ≈ 0 everywhere…
  for (let y = 0; y < mh; y++)
    for (let x = 0; x < mw; x++) {
      if (x < 8 && y < 8) protos[0 * mh * mw + y * mw + x] = 1; // …except the top-left quarter for prototype 0
      if (x >= 8 && y >= 8) protos[1 * mh * mw + y * mw + x] = 1; // and bottom-right for prototype 1
    }
  return { out0, protos, nc, nm, A, mh, mw };
}

describe('letterbox and preprocessing', () => {
  it('letterboxes a landscape photo with vertical padding', () => {
    expect(letterbox(1280, 960, 640)).toEqual({ size: 640, srcW: 1280, srcH: 960, scale: 0.5, padX: 0, padY: 80 });
    expect(letterbox(960, 1280, 640)).toMatchObject({ scale: 0.5, padX: 80, padY: 0 });
  });

  it('RGBA → CHW float /255', () => {
    const rgba = new Uint8ClampedArray([255, 0, 114, 255, 0, 255, 0, 255, 0, 0, 0, 255, 255, 255, 255, 255]);
    const chw = rgbaToChw(rgba, 2);
    expect([...chw.slice(0, 4)]).toEqual([1, 0, 0, 1]); // R plane
    expect(chw[8]).toBeCloseTo(114 / 255); // B plane, first pixel
  });

  it('maps boxes back to the original photo', () => {
    const lb = letterbox(1280, 960, 640);
    expect(boxToOriginal([0, 80, 320, 400], lb)).toEqual([0, 0, 640, 640]);
    expect(boxToOriginal([-10, 0, 700, 700], lb)).toEqual([0, 0, 1280, 960]); // clamped
  });
});

describe('decode + class-wise NMS', () => {
  const { out0, nc, nm, A } = fixture();

  it('decodes centre-format boxes and best class, dropping low scores', () => {
    const c = decodeOutput(out0, nc, A, 0.25, nm);
    expect(c.map((x) => [x.classIndex, Number(x.score.toFixed(4))])).toEqual([
      [0, 0.9],
      [0, 0.8],
      [1, 0.7],
      [2, 0.4],
    ]);
    expect(c[0]!.box).toEqual([8, 8, 24, 24]);
    expect([...c[0]!.coeffs]).toEqual([6, 0]);
  });

  it('rejects an output with the wrong shape', () => {
    expect(() => decodeOutput(new Float32Array(10), nc, A, 0.25, nm)).toThrow(/expected/);
  });

  it('IoU', () => {
    expect(iou([0, 0, 10, 10], [0, 0, 10, 10])).toBe(1);
    expect(iou([0, 0, 10, 10], [5, 0, 15, 10])).toBeCloseTo(1 / 3);
    expect(iou([0, 0, 10, 10], [20, 20, 30, 30])).toBe(0);
  });

  it('NMS at IoU 0.7 removes same-class duplicates only', () => {
    const kept = nms(decodeOutput(out0, nc, A, 0.25, nm), 0.7);
    expect(kept.map((k) => [k.classIndex, Number(k.score.toFixed(4))])).toEqual([
      [0, 0.9],
      [1, 0.7],
      [2, 0.4],
    ]);
  });

  it('keeps both boxes when overlap is below the threshold', () => {
    const mk = (x: number, s: number): Candidate => ({ box: [x, 0, x + 10, 10], classIndex: 0, score: s, coeffs: new Float32Array() });
    expect(nms([mk(0, 0.9), mk(5, 0.8)], 0.7)).toHaveLength(2); // IoU 1/3
  });
});

describe('masks', () => {
  const { out0, protos, nc, nm, A, mh, mw } = fixture();
  const cands = nms(decodeOutput(out0, nc, A, 0.25, nm), 0.7);

  it('sigmoid(coefficients · prototypes), cropped to the box', () => {
    const p = maskProbabilities(cands[0]!, protos, nm, mh, mw, 64); // box 8..24 px → grid 2..6
    expect(p[3 * mw + 3]).toBeCloseTo(1 / (1 + Math.exp(-6))); // inside box, prototype 0 = 1
    expect(p[3 * mw + 12]).toBe(0); // outside the box
    expect(p[0]).toBe(0); // outside the box, although prototype 0 is 1 there
  });

  it('upscales to the original image, thresholded and inside the box', () => {
    const lb = letterbox(64, 64, 64);
    const probs = maskProbabilities(cands[0]!, protos, nm, mh, mw, 64);
    const m = upscaleMask(probs, mh, mw, lb, cands[0]!.box, 64, 64);
    expect(m.data[16 * 64 + 16]).toBe(1); // centre of the box
    expect(m.data[40 * 64 + 40]).toBe(0);
    expect(m.area).toBeGreaterThan(150); // ~16×16 box
    expect(m.area).toBeLessThanOrEqual(17 * 17);
  });

  it('postprocess: labels, confidence flag (rule 5), area share', () => {
    const lb = letterbox(64, 64, 64);
    const dets = postprocess(out0, protos, lb, {
      classes: ['rice', 'daal', 'fish'],
      minConfidence: 0.614,
      inputSize: 64,
      numAnchors: A,
      maskDim: nm,
      maskH: mh,
      maskW: mw,
      outW: 64,
      outH: 64,
    });
    expect(dets.map((d) => [d.label, d.confident])).toEqual([
      ['rice', true],
      ['daal', true],
      ['fish', false],
    ]);
    expect(dets[0]!.areaFraction).toBeGreaterThan(0.04);
    expect(dets[0]!.areaFraction).toBeLessThan(0.08);
    expect(dets[2]!.box).toEqual([40, 40, 56, 56]);
  });
});
