/**
 * YOLO-seg (YOLOv8 / YOLO11) post-processing in TypeScript — pure functions on plain arrays, no DOM, unit-tested.
 *
 * Model I/O (food_seg.onnx): input [1,3,640,640] RGB/255, letterboxed with pad 114.
 *   output0 [1, 4 + nc + 32, A]  channel-major: cx, cy, w, h (input pixels), nc class scores, 32 mask coefficients
 *   output1 [1, 32, 160, 160]    mask prototypes
 * No NMS in the graph: decode → class-wise NMS (IoU 0.7) → mask = sigmoid(coefficients · prototypes),
 * cropped to the box → upscaled to the original image.
 */

export interface Letterbox {
  /** Model input size (square). */
  size: number;
  /** Original image size. */
  srcW: number;
  srcH: number;
  /** Scale from original to letterboxed pixels. */
  scale: number;
  /** Padding added on the left / top (letterboxed pixels). */
  padX: number;
  padY: number;
}

export function letterbox(srcW: number, srcH: number, size = 640): Letterbox {
  const scale = Math.min(size / srcW, size / srcH);
  const newW = Math.round(srcW * scale);
  const newH = Math.round(srcH * scale);
  return { size, srcW, srcH, scale, padX: Math.floor((size - newW) / 2), padY: Math.floor((size - newH) / 2) };
}

/** RGBA pixels of the letterboxed size×size image → Float32 CHW tensor data, (x/255 − mean) / std. */
export function rgbaToChw(rgba: Uint8ClampedArray | Uint8Array, size: number, mean = [0, 0, 0], std = [1, 1, 1]): Float32Array {
  const plane = size * size;
  const out = new Float32Array(3 * plane);
  for (let i = 0, p = 0; i < plane; i++, p += 4) {
    out[i] = (rgba[p]! / 255 - mean[0]!) / std[0]!;
    out[plane + i] = (rgba[p + 1]! / 255 - mean[1]!) / std[1]!;
    out[2 * plane + i] = (rgba[p + 2]! / 255 - mean[2]!) / std[2]!;
  }
  return out;
}

export interface Candidate {
  /** x1, y1, x2, y2 in letterboxed input pixels. */
  box: [number, number, number, number];
  classIndex: number;
  score: number;
  coeffs: Float32Array;
}

/** Decodes output0 into candidates whose best class score ≥ minScore. */
export function decodeOutput(out0: Float32Array, numClasses: number, numAnchors: number, minScore: number, maskDim = 32): Candidate[] {
  const channels = 4 + numClasses + maskDim;
  if (out0.length !== channels * numAnchors) throw new Error(`output0 has ${out0.length} values, expected ${channels}×${numAnchors}`);
  const at = (c: number, a: number) => out0[c * numAnchors + a]!;
  const out: Candidate[] = [];
  for (let a = 0; a < numAnchors; a++) {
    let best = -1;
    let score = -Infinity;
    for (let c = 0; c < numClasses; c++) {
      const s = at(4 + c, a);
      if (s > score) {
        score = s;
        best = c;
      }
    }
    if (score < minScore) continue;
    const cx = at(0, a);
    const cy = at(1, a);
    const w = at(2, a);
    const h = at(3, a);
    const coeffs = new Float32Array(maskDim);
    for (let k = 0; k < maskDim; k++) coeffs[k] = at(4 + numClasses + k, a);
    out.push({ box: [cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2], classIndex: best, score, coeffs });
  }
  return out;
}

export function iou(a: Candidate['box'], b: Candidate['box']): number {
  const x1 = Math.max(a[0], b[0]);
  const y1 = Math.max(a[1], b[1]);
  const x2 = Math.min(a[2], b[2]);
  const y2 = Math.min(a[3], b[3]);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const areaA = Math.max(0, a[2] - a[0]) * Math.max(0, a[3] - a[1]);
  const areaB = Math.max(0, b[2] - b[0]) * Math.max(0, b[3] - b[1]);
  const union = areaA + areaB - inter;
  return union > 0 ? inter / union : 0;
}

/** Class-wise non-maximum suppression: keeps the best box and drops same-class boxes overlapping it by > iouThreshold. */
export function nms(cands: readonly Candidate[], iouThreshold = 0.7, maxDetections = 100): Candidate[] {
  const sorted = [...cands].sort((a, b) => b.score - a.score);
  const kept: Candidate[] = [];
  for (const c of sorted) {
    if (kept.some((k) => k.classIndex === c.classIndex && iou(k.box, c.box) > iouThreshold)) continue;
    kept.push(c);
    if (kept.length >= maxDetections) break;
  }
  return kept;
}

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

/**
 * Mask probabilities on the prototype grid (maskH × maskW): sigmoid(coeffs · protos), set to 0 outside the box.
 * The box is in letterboxed input pixels; the grid covers the same area at maskW / inputSize scale.
 */
export function maskProbabilities(c: Candidate, protos: Float32Array, maskDim: number, maskH: number, maskW: number, inputSize: number): Float32Array {
  const plane = maskH * maskW;
  const out = new Float32Array(plane);
  const sx = maskW / inputSize;
  const sy = maskH / inputSize;
  const x1 = Math.max(0, Math.floor(c.box[0] * sx));
  const y1 = Math.max(0, Math.floor(c.box[1] * sy));
  const x2 = Math.min(maskW, Math.ceil(c.box[2] * sx));
  const y2 = Math.min(maskH, Math.ceil(c.box[3] * sy));
  for (let y = y1; y < y2; y++) {
    for (let x = x1; x < x2; x++) {
      const i = y * maskW + x;
      let v = 0;
      for (let k = 0; k < maskDim; k++) v += c.coeffs[k]! * protos[k * plane + i]!;
      out[i] = sigmoid(v);
    }
  }
  return out;
}

export interface UpscaledMask {
  width: number;
  height: number;
  /** 1 = food pixel. */
  data: Uint8Array;
  /** Number of food pixels. */
  area: number;
}

/**
 * Upscales a prototype-grid mask to an output image of outW × outH that shows the ORIGINAL photo (no padding):
 * bilinear sampling, threshold 0.5, and only inside the box.
 */
export function upscaleMask(
  probs: Float32Array,
  maskH: number,
  maskW: number,
  lb: Letterbox,
  box: Candidate['box'],
  outW: number,
  outH: number,
  threshold = 0.5,
): UpscaledMask {
  const data = new Uint8Array(outW * outH);
  const gx = maskW / lb.size;
  const gy = maskH / lb.size;
  let area = 0;
  for (let y = 0; y < outH; y++) {
    // output pixel centre → original → letterboxed input pixels
    const iy = ((y + 0.5) * (lb.srcH / outH)) * lb.scale + lb.padY;
    if (iy < box[1] || iy > box[3]) continue;
    const my = iy * gy - 0.5;
    const y0 = Math.max(0, Math.min(maskH - 1, Math.floor(my)));
    const y1 = Math.min(maskH - 1, y0 + 1);
    const fy = Math.min(1, Math.max(0, my - y0));
    for (let x = 0; x < outW; x++) {
      const ix = ((x + 0.5) * (lb.srcW / outW)) * lb.scale + lb.padX;
      if (ix < box[0] || ix > box[2]) continue;
      const mx = ix * gx - 0.5;
      const x0 = Math.max(0, Math.min(maskW - 1, Math.floor(mx)));
      const x1 = Math.min(maskW - 1, x0 + 1);
      const fx = Math.min(1, Math.max(0, mx - x0));
      const v =
        probs[y0 * maskW + x0]! * (1 - fx) * (1 - fy) +
        probs[y0 * maskW + x1]! * fx * (1 - fy) +
        probs[y1 * maskW + x0]! * (1 - fx) * fy +
        probs[y1 * maskW + x1]! * fx * fy;
      if (v > threshold) {
        data[y * outW + x] = 1;
        area++;
      }
    }
  }
  return { width: outW, height: outH, data, area };
}

/** Box from letterboxed input pixels back to original image pixels, clamped to the image. */
export function boxToOriginal(box: Candidate['box'], lb: Letterbox): Candidate['box'] {
  const f = (v: number, pad: number, max: number) => Math.min(max, Math.max(0, (v - pad) / lb.scale));
  return [f(box[0], lb.padX, lb.srcW), f(box[1], lb.padY, lb.srcH), f(box[2], lb.padX, lb.srcW), f(box[3], lb.padY, lb.srcH)];
}

export interface Detection {
  classIndex: number;
  label: string;
  score: number;
  /** Rule 5: true when score ≥ the model's min_confidence; otherwise the UI shows "Not sure" instead of the label. */
  confident: boolean;
  /** Box in original image pixels. */
  box: Candidate['box'];
  mask: UpscaledMask;
  /** Share of the photo covered by this food (0–1). */
  areaFraction: number;
}

export interface PostprocessOptions {
  classes: readonly string[];
  /** Model's min_confidence (food_seg.json): below it, a detection is kept but labelled "not sure". */
  minConfidence: number;
  /** Lowest score kept at all (so the user can confirm or correct low-confidence foods). */
  candidateScore?: number;
  iouThreshold?: number;
  inputSize?: number;
  numAnchors?: number;
  maskDim?: number;
  maskH?: number;
  maskW?: number;
  /** Size of the mask image to produce (the original aspect ratio). */
  outW: number;
  outH: number;
}

export function postprocess(out0: Float32Array, out1: Float32Array, lb: Letterbox, o: PostprocessOptions): Detection[] {
  const maskDim = o.maskDim ?? 32;
  const maskH = o.maskH ?? 160;
  const maskW = o.maskW ?? 160;
  const inputSize = o.inputSize ?? lb.size;
  const numAnchors = o.numAnchors ?? out0.length / (4 + o.classes.length + maskDim);
  const cands = nms(decodeOutput(out0, o.classes.length, numAnchors, o.candidateScore ?? 0.25, maskDim), o.iouThreshold ?? 0.7);
  const total = o.outW * o.outH;
  return cands
    .map((c) => {
      const probs = maskProbabilities(c, out1, maskDim, maskH, maskW, inputSize);
      const mask = upscaleMask(probs, maskH, maskW, lb, c.box, o.outW, o.outH);
      return {
        classIndex: c.classIndex,
        label: o.classes[c.classIndex] ?? `class_${c.classIndex}`,
        score: c.score,
        confident: c.score >= o.minConfidence,
        box: boxToOriginal(c.box, lb),
        mask,
        areaFraction: total ? mask.area / total : 0,
      };
    })
    .filter((d) => d.mask.area > 0);
}
