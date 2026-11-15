/**
 * Rule-based danger signs for Emergency Support (placeholder).
 * Every danger sign maps to "call 999 now". The list itself should move to config/ once
 * reviewed by a clinician.
 */
export const DANGER_SIGN_KEYS = [
  'breathing',
  'chestPain',
  'unconscious',
  'bleeding',
  'lowSugar',
  'stroke',
] as const;

export type DangerSignKey = (typeof DANGER_SIGN_KEYS)[number];

export function needsEmergency(selected: readonly DangerSignKey[]): boolean {
  return selected.length > 0;
}
