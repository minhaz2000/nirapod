/**
 * Image-quality thresholds used before running OCR or a model. Not clinical, but tuned values live here.
 * Values are for an 8-bit grey image downscaled to at most QUALITY_MAX_SIDE px on its longest side.
 */
export const IMAGE_QUALITY = {
  maxSide: 512,
  /** Shorter side of the ORIGINAL photo must be at least this. */
  minShortSidePx: 480,
  /** Mean brightness (0–255). */
  minBrightness: 55,
  maxBrightness: 225,
  /** Variance of the Laplacian; below this the photo is probably blurred. */
  minSharpness: 60,
} as const;
