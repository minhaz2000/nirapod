/**
 * NEEDS CLINICIAN REVIEW — emergency danger-sign checklist.
 *
 * Any one of these signs means "call 999 now". The list, grouping and advice mapping are placeholders based on
 * common first-aid guidance (e.g. FAST for stroke) and must be reviewed by a clinician before use with real patients.
 * User-facing wording lives in messages/{bn,en}.json under emergency.signs.<id>.
 */
import { GLUCOSE_CONFIG } from './glucose';

export const DANGER_SIGN_IDS = [
  'chestPain',
  // Stroke — FAST: Face, Arm, Speech, Time
  'strokeFace',
  'strokeArm',
  'strokeSpeech',
  'breathing',
  'unconscious',
  'bleeding',
  'lowGlucose',
] as const;

export type DangerSignId = (typeof DANGER_SIGN_IDS)[number];

/** UI groups, in display order. */
export const DANGER_SIGN_GROUPS: ReadonlyArray<{ id: string; signs: readonly DangerSignId[] }> = [
  { id: 'heart', signs: ['chestPain'] },
  { id: 'stroke', signs: ['strokeFace', 'strokeArm', 'strokeSpeech'] },
  { id: 'breathing', signs: ['breathing'] },
  { id: 'consciousness', signs: ['unconscious'] },
  { id: 'bleeding', signs: ['bleeding'] },
  { id: 'glucose', signs: ['lowGlucose'] },
];

/** FAST stroke signs: any one of them is a stroke danger sign. */
export const STROKE_FAST_SIGNS: readonly DangerSignId[] = ['strokeFace', 'strokeArm', 'strokeSpeech'];

/** A glucose reading strictly below this (mmol/L) is a danger sign. 3.9 mmol/L = 70 mg/dL. */
export const LOW_GLUCOSE_DANGER_BELOW_MMOL = GLUCOSE_CONFIG.hypoglycaemiaBelowMmol;
