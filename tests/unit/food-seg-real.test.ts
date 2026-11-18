/**
 * Regression test with REAL food_seg.onnx output (v0.1.0) for public/samples/plate-1.jpg and plate-2.jpg.
 * The fixture holds the output0 columns of every anchor with a class score ≥ 0.2 (all others score below the app's
 * 0.25 candidate cut-off) and Ultralytics' own predictions on the same model. The app's decode + class-wise NMS must
 * reproduce Ultralytics within small tolerances. Masks are checked end to end in tests/e2e/plates.spec.ts.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { boxToOriginal, decodeOutput, iou, letterbox, nms } from '@/lib/ai/yolo-seg';

interface Ref {
  label: string;
  score: number;
  area: number;
  box: [number, number, number, number];
}
interface Plate {
  width: number;
  height: number;
  anchors: number[];
  columns: number[][];
  ultralytics: Ref[];
}
const fixture = JSON.parse(readFileSync('tests/fixtures/food-seg-plates.json', 'utf8')) as { classes: string[]; plates: Record<string, Plate> };
const META = JSON.parse(readFileSync('public/models/food_seg.json', 'utf8')) as { min_confidence: number };
const A = 8400;
const C = 4 + fixture.classes.length + 32;

function appDetections(p: Plate) {
  const out0 = new Float32Array(C * A);
  p.anchors.forEach((a, i) => p.columns[i]!.forEach((v, c) => (out0[c * A + a] = v)));
  const lb = letterbox(p.width, p.height, 640);
  return nms(decodeOutput(out0, fixture.classes.length, A, 0.25), 0.7).map((c) => ({
    label: fixture.classes[c.classIndex]!,
    score: c.score,
    box: boxToOriginal(c.box, lb),
  }));
}

function matchesReference(app: ReturnType<typeof appDetections>, ref: Ref[]) {
  expect(app.map((d) => d.label).sort()).toEqual(ref.map((d) => d.label).sort());
  for (const r of ref) {
    const best = app.filter((d) => d.label === r.label).sort((a, b) => iou(b.box, r.box) - iou(a.box, r.box))[0]!;
    expect(iou(best.box, r.box), `${r.label} box`).toBeGreaterThan(0.95);
    expect(Math.abs(best.score - r.score), `${r.label} score`).toBeLessThan(0.01);
  }
}

describe('real model output — plate-1.jpg (rice, dal, cucumber, two curries, a milk drink)', () => {
  const p = fixture.plates['plate-1.jpg']!;
  const app = appDetections(p);

  it('decode + NMS reproduce Ultralytics on the same output', () => {
    matchesReference(app, p.ultralytics);
  });

  it('known behaviour of model v0.1.0 (update this test when the model is retrained)', () => {
    const confident = app.filter((d) => d.score >= META.min_confidence);
    expect(confident.filter((d) => d.label === 'vegetable')).toHaveLength(3); // dal bowl is MISLABELLED as vegetable
    expect(confident.filter((d) => d.label === 'salad').length).toBeGreaterThanOrEqual(2); // cucumber slices
    expect(confident.some((d) => d.label === 'rice')).toBe(false); // rice is MISSED (at most a weak "not sure")
    expect(confident.some((d) => d.label === 'daal')).toBe(false);
  });
});

describe('real model output — plate-2.jpg (rice, cucumber, prawn curry, greens)', () => {
  const p = fixture.plates['plate-2.jpg']!;
  const app = appDetections(p);

  it('decode + NMS reproduce Ultralytics on the same output', () => {
    matchesReference(app, p.ultralytics);
  });

  it('known behaviour of model v0.1.0', () => {
    const confident = app.filter((d) => d.score >= META.min_confidence);
    expect(confident.map((d) => d.label)).toEqual(['salad', 'salad']); // cucumber only
    expect(app.some((d) => d.label === 'rice')).toBe(false); // rice is MISSED
    const unsure = app.filter((d) => d.score < META.min_confidence);
    expect(unsure.map((d) => d.label)).toEqual(['chola']); // prawn curry + greens as one weak "chola" → shown as "Not sure"
  });
});
