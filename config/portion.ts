/**
 * NEEDS NUTRITIONIST REVIEW — portion estimation settings (not clinical thresholds, but they change carb estimates).
 *
 * Assumption: the plate photo is taken from above with the plate filling the shorter side of the frame, so the
 * shorter side of the photo ≈ the plate diameter the user set once (default 26 cm, a common dinner plate in Bangladesh).
 * Per-food density and typical height are in config/food-class-map.csv.
 */
export const PORTION = {
  defaultPlateDiameterCm: 26,
  minPlateDiameterCm: 16,
  maxPlateDiameterCm: 40,
  /** One-tap correction of a food's estimated amount. */
  correction: { less: 0.7, right: 1, more: 1.4 },
  /** "Add a food the app missed": share of the plate area for each size. */
  addedFoodShare: { small: 0.08, medium: 0.15, large: 0.25 },
} as const;

export type PortionCorrection = keyof typeof PORTION.correction;
export type AddedFoodSize = keyof typeof PORTION.addedFoodShare;
