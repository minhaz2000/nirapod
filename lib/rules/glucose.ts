import { GLUCOSE_CONFIG } from '@/config/glucose';

export type GlucoseUnit = 'mmol' | 'mgdl';

/** Convert a value in the given unit to mmol/L (storage unit). */
export function toMmol(value: number, unit: GlucoseUnit): number {
  return unit === 'mmol' ? value : value / GLUCOSE_CONFIG.mgdlPerMmol;
}

/** Convert a stored mmol/L value to the user's display unit. */
export function fromMmol(mmol: number, unit: GlucoseUnit): number {
  return unit === 'mmol' ? mmol : mmol * GLUCOSE_CONFIG.mgdlPerMmol;
}

/** Format a stored mmol/L value for display (1 decimal for mmol/L, integer for mg/dL). */
export function formatGlucose(mmol: number, unit: GlucoseUnit): string {
  const v = fromMmol(mmol, unit);
  return unit === 'mmol' ? v.toFixed(1) : Math.round(v).toString();
}

/** Safety rule 6: low blood sugar first. */
export function isLowGlucose(mmol: number): boolean {
  return mmol < GLUCOSE_CONFIG.hypoglycaemiaBelowMmol;
}
