/**
 * NEEDS CLINICIAN REVIEW — glucose control levels and post-meal targets (adults with type 2 diabetes).
 * Placeholder values based on common guidance (e.g. HbA1c < 7 %, 2-hour post-meal < 10.0 mmol/L / 180 mg/dL);
 * they ignore age, pregnancy and other conditions, which change targets. All glucose values in mmol/L.
 */
export type ControlLevel = 'good' | 'fair' | 'poor';

export const GLUCOSE_TARGETS = {
  /** HbA1c (%): below goodBelow → good; below fairBelow → fair; otherwise poor. */
  hba1c: { goodBelow: 7.0, fairBelow: 8.0 },
  /** Fasting glucose (mmol/L): below goodBelow → good; below fairBelow → fair; otherwise poor. */
  fasting: { goodBelow: 7.2, fairBelow: 10.0 },
  /** 2-hour post-meal glucose (mmol/L). */
  twoHour: { target: 10.0, good: 7.8 },
  /** Accepted input ranges (outside → "please check the number"). */
  plausible: { mmolMin: 1.0, mmolMax: 35.0, hba1cMin: 3.0, hba1cMax: 20.0 },
} as const;
