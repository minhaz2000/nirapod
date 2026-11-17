/**
 * NEEDS CLINICIAN REVIEW — clinical thresholds for blood glucose.
 * Values are placeholders based on common guidance and must be confirmed by a clinician
 * before use with real patients. All values are in mmol/L (the storage unit).
 */
export const GLUCOSE_CONFIG = {
  /** Below this, show low-blood-sugar emergency guidance (safety rule 6). 3.9 mmol/L = 70 mg/dL. */
  hypoglycaemiaBelowMmol: 3.9,
  /** Conversion factor between mmol/L and mg/dL for glucose. */
  mgdlPerMmol: 18.0182,
} as const;
