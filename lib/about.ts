/** Figures shown in "How Nirapod's AI works". Model numbers come from the model's own metadata file. */
import foodSeg from '@/public/models/food_seg.json';

export const AI_FACTS = {
  foodClasses: foodSeg.classes.length,
  /** Mask mAP50 on the PUST test split (notebooks/food_seg.ipynb). */
  foodMaskMap50: Math.round(foodSeg.metrics.mask_map50 * 1000) / 1000,
  /** Measured in the browser on the sample plates (tests/e2e/plates.spec.ts reports it). */
  foodSecondsOnPhone: 0.6,
  /** Products in data/build/medicines.sqlite (medicinedb, see scripts/build-data.ts). */
  medicineProducts: 17_589,
} as const;
