/**
 * NEEDS CLINICIAN REVIEW — green / amber / red meal signal and personal learning.
 * A meal's carbs (g) at or below `green` → green; at or below `amber` → amber; above → red, per control level.
 * The signal is guidance about the meal only — never about medicine or insulin (rule 3).
 */
import type { ControlLevel } from './glucose-targets';

export const MEAL_CARB_THRESHOLDS: Record<ControlLevel, { green: number; amber: number }> = {
  good: { green: 60, amber: 90 },
  fair: { green: 50, amber: 75 },
  poor: { green: 45, amber: 60 },
};

export const LEARNING = {
  /** Readings needed (meals where the food was the main carb source) before a food's signal is adjusted. */
  minReadings: 5,
  /** Average 2-hour glucose (mmol/L) at or above this → one step stricter for meals led by this food. */
  stricterAtOrAbove: 10.0,
  /** Average below this AND every reading below `stricterAtOrAbove` → one step more relaxed (amber → green only). */
  relaxedBelow: 7.8,
  /** Ask for the 2-hour reading this many minutes after the meal. */
  twoHourMinutes: 120,
  /** A reading counts as "2-hour" if taken this many minutes either side of the due time. */
  windowMinutes: 45,
} as const;
