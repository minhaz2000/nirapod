/**
 * Which reminders are due (pure). The app checks every minute while it is open (or in the background on phones that
 * allow it) and shows a notification, or an in-app banner when notifications are off. Reminders never suggest
 * changing, skipping or doubling a dose.
 */
import type { Checkup, Meal, MedicinePlan, ReminderSettings } from '@/lib/store/db';
import { checkupStatus } from './checkups';
import { doseTimes } from './schedule';

export type Reminder =
  | { kind: 'meal'; meal: 'breakfast' | 'lunch' | 'dinner'; at: number }
  | { kind: 'walk'; at: number; mealAt: number }
  | { kind: 'medicine'; at: number; medicineId: number; brand: string; instructions: string }
  | { kind: 'checkup'; at: number; type: string };

/** Minutes after a logged meal for the optional "short walk" reminder. */
export const WALK_AFTER_MEAL_MINUTES = 15;

export const DEFAULT_REMINDERS = (personId: string): ReminderSettings => ({
  id: personId,
  meals: { enabled: false, breakfast: '08:30', lunch: '13:30', dinner: '21:00' },
  walkAfterMeals: false,
  medicines: true,
  checkups: true,
});

function todayAt(now: number, hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(now);
  d.setHours(h ?? 0, m ?? 0, 0, 0);
  return d.getTime();
}

/** Reminders whose time falls in (since, now]. */
export function dueReminders(
  since: number,
  now: number,
  s: ReminderSettings,
  data: { plans: readonly MedicinePlan[]; meals: readonly Meal[]; checkups: readonly Checkup[] },
): Reminder[] {
  const out: Reminder[] = [];
  const inWindow = (t: number) => t > since && t <= now;
  if (s.meals.enabled) {
    for (const meal of ['breakfast', 'lunch', 'dinner'] as const) {
      for (const day of [now - 86_400_000, now]) {
        const t = todayAt(day, s.meals[meal]);
        if (inWindow(t)) out.push({ kind: 'meal', meal, at: t });
      }
    }
  }
  if (s.walkAfterMeals) {
    for (const m of data.meals) {
      const t = m.takenAt + WALK_AFTER_MEAL_MINUTES * 60_000;
      if (inWindow(t)) out.push({ kind: 'walk', at: t, mealAt: m.takenAt });
    }
  }
  if (s.medicines) {
    for (const p of data.plans) {
      for (const t of doseTimes(p, since + 1, now + 1)) out.push({ kind: 'medicine', at: t, medicineId: p.id!, brand: p.brand, instructions: p.instructions });
    }
  }
  if (s.checkups) {
    for (const c of data.checkups) {
      const st = checkupStatus(c, now);
      if (st.nextDue !== null && inWindow(st.nextDue)) out.push({ kind: 'checkup', at: st.nextDue, type: c.type });
    }
  }
  return out.sort((a, b) => a.at - b.at);
}
