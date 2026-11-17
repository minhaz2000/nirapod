/** Browser-only image plumbing: decode the photo, check quality, straighten and boost contrast for OCR. */
import { IMAGE_QUALITY } from '@/config/image-quality';
import { assessQuality, type QualityReport } from '@/lib/ai/quality';
import { estimateSkewAngle, stretchContrast, toGrayscale } from './image';

const OCR_MAX_SIDE = 2000;

export async function decodeImage(file: Blob): Promise<ImageBitmap> {
  return createImageBitmap(file, { imageOrientation: 'from-image' });
}

function drawScaled(bitmap: ImageBitmap, maxSide: number) {
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(bitmap, 0, 0, w, h);
  return { canvas, ctx, w, h };
}

function grayOf(bitmap: ImageBitmap, maxSide: number) {
  const { ctx, w, h } = drawScaled(bitmap, maxSide);
  return { gray: toGrayscale(ctx.getImageData(0, 0, w, h).data, w, h), w, h };
}

export function checkQuality(bitmap: ImageBitmap): QualityReport {
  const { gray, w, h } = grayOf(bitmap, IMAGE_QUALITY.maxSide);
  return assessQuality(gray, w, h, { width: bitmap.width, height: bitmap.height });
}

/** Returns a straightened, contrast-boosted grey canvas ready for tesseract, plus the skew that was removed. */
export function prepareForOcr(bitmap: ImageBitmap): { canvas: HTMLCanvasElement; skewDegrees: number } {
  const small = grayOf(bitmap, 600);
  const skewDegrees = estimateSkewAngle(small.gray, small.w, small.h);

  const { canvas: src, w, h } = drawScaled(bitmap, OCR_MAX_SIDE);
  const a = (-skewDegrees * Math.PI) / 180;
  const cw = Math.ceil(Math.abs(w * Math.cos(a)) + Math.abs(h * Math.sin(a)));
  const ch = Math.ceil(Math.abs(w * Math.sin(a)) + Math.abs(h * Math.cos(a)));
  const out = document.createElement('canvas');
  out.width = cw;
  out.height = ch;
  const ctx = out.getContext('2d', { willReadFrequently: true })!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, cw, ch);
  ctx.translate(cw / 2, ch / 2);
  ctx.rotate(a);
  ctx.drawImage(src, -w / 2, -h / 2);
  ctx.setTransform(1, 0, 0, 1, 0, 0);

  const img = ctx.getImageData(0, 0, cw, ch);
  const boosted = stretchContrast(toGrayscale(img.data, cw, ch));
  for (let i = 0, p = 0; i < boosted.length; i++, p += 4) {
    img.data[p] = img.data[p + 1] = img.data[p + 2] = boosted[i]!;
    img.data[p + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return { canvas: out, skewDegrees };
}
