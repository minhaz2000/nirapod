/**
 * Rule-based danger signs for Emergency Support. Deterministic, no AI.
 * Any danger sign → "call 999 now". The list itself lives in config/danger-signs.ts (needs clinician review).
 */
import {
  DANGER_SIGN_IDS,
  LOW_GLUCOSE_DANGER_BELOW_MMOL,
  STROKE_FAST_SIGNS,
  type DangerSignId,
} from '@/config/danger-signs';

export { DANGER_SIGN_IDS, type DangerSignId };

/** Extra guidance shown with the alert. Wording in messages under emergency.advice.<key>. */
export type DangerAdvice =
  /** Stroke (FAST "T"): note the time the signs started. */
  | 'noteTime'
  /** Low glucose and awake: take something sweet now (safety rule 6). */
  | 'sweetIfAwake'
  /** Low glucose and unconscious: nothing by mouth. */
  | 'nothingByMouth';

export interface DangerInput {
  /** Sign ids the user tapped. Unknown ids are ignored. */
  selected?: readonly string[];
  /** Latest glucose reading in mmol/L, if known. */
  glucoseMmol?: number;
}

export interface DangerAssessment {
  emergency: boolean;
  /** Triggered signs, de-duplicated, in checklist order. */
  triggered: DangerSignId[];
  advice: DangerAdvice[];
}

export function isDangerSignId(value: unknown): value is DangerSignId {
  return typeof value === 'string' && (DANGER_SIGN_IDS as readonly string[]).includes(value);
}

/** Keeps valid ids only, de-duplicated, in checklist order. */
export function normaliseSelection(selected: readonly string[]): DangerSignId[] {
  const set = new Set(selected);
  return DANGER_SIGN_IDS.filter((id) => set.has(id));
}

// --- individual rules ---

export const hasChestPain = (s: readonly DangerSignId[]) => s.includes('chestPain');

/** FAST: face drooping, arm weakness or speech difficulty — any one is enough. */
export const hasStrokeSigns = (s: readonly DangerSignId[]) => STROKE_FAST_SIGNS.some((id) => s.includes(id));

export const hasSevereBreathingDifficulty = (s: readonly DangerSignId[]) => s.includes('breathing');

export const isUnconscious = (s: readonly DangerSignId[]) => s.includes('unconscious');

export const hasHeavyBleeding = (s: readonly DangerSignId[]) => s.includes('bleeding');

/** Glucose strictly below 3.9 mmol/L (70 mg/dL). Missing or invalid readings are not a danger sign by themselves. */
export function isGlucoseDanger(mmol: number | undefined): boolean {
  return typeof mmol === 'number' && Number.isFinite(mmol) && mmol >= 0 && mmol < LOW_GLUCOSE_DANGER_BELOW_MMOL;
}

export const hasLowGlucose = (s: readonly DangerSignId[], glucoseMmol?: number) =>
  s.includes('lowGlucose') || isGlucoseDanger(glucoseMmol);

// --- combined ---

export function assessDangerSigns({ selected = [], glucoseMmol }: DangerInput = {}): DangerAssessment {
  const base = normaliseSelection(selected);
  const lowGlucose = hasLowGlucose(base, glucoseMmol);
  const triggered = normaliseSelection(lowGlucose ? [...base, 'lowGlucose'] : base);

  const advice: DangerAdvice[] = [];
  if (hasStrokeSigns(triggered)) advice.push('noteTime');
  if (lowGlucose) advice.push(isUnconscious(triggered) ? 'nothingByMouth' : 'sweetIfAwake');

  return { emergency: triggered.length > 0, triggered, advice };
}
