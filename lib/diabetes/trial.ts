/**
 * Business rule (CLAUDE.md): Diabetes Companion is free for 7 weeks from first use, then Premium (not available yet).
 * After the trial the plate signal, blood sugar entry and low-sugar help stay free for now; Emergency is never gated.
 */
export const TRIAL_DAYS = 7 * 7;

export type DiabetesTab = 'meal' | 'glucose' | 'patterns' | 'medicines' | 'care' | 'more';

/** Tabs that stay open after the trial: plate signal (meal) and blood sugar entry with low-sugar help (glucose). */
export const FREE_AFTER_TRIAL: readonly DiabetesTab[] = ['meal', 'glucose'];

/** Days left in the trial (0 when ended), or null if the trial has not started. */
export function trialDaysLeft(trialStart: number | undefined, now = Date.now()): number | null {
  if (!trialStart) return null;
  const used = Math.floor((now - trialStart) / 86_400_000);
  return Math.max(0, TRIAL_DAYS - used);
}

export const trialEnded = (trialStart: number | undefined, now = Date.now()) => trialDaysLeft(trialStart, now) === 0;

/** True when a tab shows the Premium screen instead of its content. */
export function tabLocked(tab: DiabetesTab, trialStart: number | undefined, now = Date.now()): boolean {
  return trialEnded(trialStart, now) && !FREE_AFTER_TRIAL.includes(tab);
}
