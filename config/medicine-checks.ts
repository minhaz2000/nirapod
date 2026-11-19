/**
 * NEEDS CLINICIAN / PHARMACIST REVIEW — thresholds for medicine-pack "suspicious signs".
 * These produce signs to check, never a verdict (safety rule 2). Placeholder values.
 */
export const MEDICINE_CHECKS = {
  /**
   * A printed unit price below this fraction of the database unit price is a sign.
   * The database prices are from 2021 or earlier and prices have mostly risen since, so a much LOWER printed
   * price is the unusual case. Higher printed prices are not flagged.
   */
  priceFarBelowRatio: 0.5,
  // The "expires soon" window moved to config/expiry.ts (EXPIRY.soonMonths).
} as const;
