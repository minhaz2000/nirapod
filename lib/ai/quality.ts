/** Image quality check before OCR or a model: too small, too dark, too bright, blurred. Pure; see lib/ocr/canvas.ts. */
import { IMAGE_QUALITY } from '@/config/image-quality';
import { laplacianVariance, meanBrightness } from '@/lib/ocr/image';

export type QualityIssue = 'tooSmall' | 'tooDark' | 'tooBright' | 'blurry';

export interface QualityReport {
  ok: boolean;
  issues: QualityIssue[];
  brightness: number;
  sharpness: number;
}

/**
 * @param gray grey image downscaled to at most IMAGE_QUALITY.maxSide on its longest side
 * @param original size of the original photo
 */
export function assessQuality(
  gray: Uint8Array,
  width: number,
  height: number,
  original: { width: number; height: number },
): QualityReport {
  const brightness = meanBrightness(gray);
  const sharpness = laplacianVariance(gray, width, height);
  const issues: QualityIssue[] = [];
  if (Math.min(original.width, original.height) < IMAGE_QUALITY.minShortSidePx) issues.push('tooSmall');
  if (brightness < IMAGE_QUALITY.minBrightness) issues.push('tooDark');
  if (brightness > IMAGE_QUALITY.maxBrightness) issues.push('tooBright');
  if (sharpness < IMAGE_QUALITY.minSharpness) issues.push('blurry');
  return { ok: issues.length === 0, issues, brightness, sharpness };
}
