/** Business rule (CLAUDE.md): Diabetes Companion is free for 7 weeks from first use, then Premium (stub). */
export const TRIAL_DAYS = 7 * 7;

/** Days left in the trial (0 when ended), or null if the trial has not started. */
export function trialDaysLeft(trialStart: number | undefined, now = Date.now()): number | null {
  if (!trialStart) return null;
  const used = Math.floor((now - trialStart) / 86_400_000);
  return Math.max(0, TRIAL_DAYS - used);
}

export const trialEnded = (trialStart: number | undefined, now = Date.now()) => trialDaysLeft(trialStart, now) === 0;
