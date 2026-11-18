/**
 * Food recognition on the phone (Diabetes Companion): runs food_seg.onnx with onnxruntime-web, then YOLO-seg
 * post-processing (lib/ai/yolo-seg.ts), and draws coloured masks with labels and confidence.
 * Below the model's min_confidence a food is labelled "not sure" (rule 5) and the user picks what it is.
 */
import type { ModelMeta } from './session';
import { letterbox, postprocess, rgbaToChw, type Detection } from './yolo-seg';

export type { Detection };

/** Longest side of the image the masks are computed for (enough for portion areas, fast on phones). */
const WORK_SIDE = 480;

export interface PlateAnalysis {
  detections: Detection[];
  /** Size of the mask images (original aspect ratio). */
  width: number;
  height: number;
  /** Original photo size. */
  srcW: number;
  srcH: number;
  ms: number;
}

interface OrtSessionLike {
  inputNames: readonly string[];
  outputNames: readonly string[];
  run(feeds: Record<string, unknown>): Promise<Record<string, { data: unknown; dims: readonly number[] }>>;
}

export async function analysePlate(bitmap: ImageBitmap, session: unknown, meta: ModelMeta): Promise<PlateAnalysis> {
  const t0 = performance.now();
  const s = session as OrtSessionLike;
  const size = meta.inputSize[0];
  const lb = letterbox(bitmap.width, bitmap.height, size);

  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.fillStyle = 'rgb(114,114,114)';
  ctx.fillRect(0, 0, size, size);
  ctx.drawImage(bitmap, lb.padX, lb.padY, Math.round(bitmap.width * lb.scale), Math.round(bitmap.height * lb.scale));
  const input = rgbaToChw(ctx.getImageData(0, 0, size, size).data, size, meta.mean, meta.std);

  const ort = await import('onnxruntime-web/wasm');
  const feeds = { [s.inputNames[0]!]: new ort.Tensor('float32', input, [1, 3, size, size]) };
  const out = await s.run(feeds);
  const out0 = out[s.outputNames[0]!]!;
  const out1 = out[s.outputNames[1]!]!;

  const k = Math.min(1, WORK_SIDE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * k));
  const height = Math.max(1, Math.round(bitmap.height * k));
  const detections = postprocess(out0.data as Float32Array, out1.data as Float32Array, lb, {
    classes: meta.classes,
    minConfidence: meta.min_confidence,
    candidateScore: 0.25,
    iouThreshold: 0.7,
    inputSize: size,
    numAnchors: out0.dims[2],
    maskDim: out1.dims[1],
    maskH: out1.dims[2],
    maskW: out1.dims[3],
    outW: width,
    outH: height,
  });
  return { detections, width, height, srcW: bitmap.width, srcH: bitmap.height, ms: Math.round(performance.now() - t0) };
}

/** 16 distinct, high-contrast colours (one per class). */
export const CLASS_COLOURS = [
  '#e6194b', '#3cb44b', '#ffe119', '#4363d8', '#f58231', '#911eb4', '#42d4f4', '#f032e6',
  '#bfef45', '#fabed4', '#469990', '#dcbeff', '#9a6324', '#800000', '#aaffc3', '#000075',
] as const;

export const colourFor = (classIndex: number) => CLASS_COLOURS[classIndex % CLASS_COLOURS.length]!;

/** Draws the photo with coloured masks and "label 87%" tags. `labelFor` gives the (translated) label text. */
export function drawDetections(
  canvas: HTMLCanvasElement,
  bitmap: ImageBitmap,
  analysis: PlateAnalysis,
  labelFor: (d: Detection) => string,
): void {
  const { width, height, detections } = analysis;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0, width, height);
  const img = ctx.getImageData(0, 0, width, height);
  for (const d of detections) {
    const hex = colourFor(d.classIndex);
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const a = d.confident ? 0.45 : 0.3;
    for (let i = 0; i < d.mask.data.length; i++) {
      if (!d.mask.data[i]) continue;
      const p = i * 4;
      img.data[p] = img.data[p]! * (1 - a) + r * a;
      img.data[p + 1] = img.data[p + 1]! * (1 - a) + g * a;
      img.data[p + 2] = img.data[p + 2]! * (1 - a) + b * a;
    }
  }
  ctx.putImageData(img, 0, 0);
  const sx = width / analysis.srcW;
  const sy = height / analysis.srcH;
  ctx.font = `bold ${Math.max(12, Math.round(width / 28))}px system-ui, sans-serif`;
  ctx.textBaseline = 'top';
  for (const d of detections) {
    const [x1, y1] = [d.box[0] * sx, d.box[1] * sy];
    const text = `${labelFor(d)} ${Math.round(d.score * 100)}%`;
    const w = ctx.measureText(text).width + 8;
    const h = Math.max(16, Math.round(width / 22));
    ctx.fillStyle = colourFor(d.classIndex);
    ctx.fillRect(x1, Math.max(0, y1 - h), w, h);
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 3;
    ctx.strokeText(text, x1 + 4, Math.max(0, y1 - h) + 2);
    ctx.fillText(text, x1 + 4, Math.max(0, y1 - h) + 2);
  }
}
