/** Check-up due dates (pure). Intervals come from config/checkups.ts and can be edited by the user. */
import { CHECKUPS } from '@/config/checkups';
import type { Checkup } from '@/lib/store/db';

export function addMonths(ms: number, months: number): number {
  const d = new Date(ms);
  const day = d.getDate();
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(day, last));
  return d.getTime();
}

export interface CheckupStatus extends Checkup {
  nextDue: number | null;
  /** Never done, or the due date has passed. */
  due: boolean;
}

export function defaultCheckups(personId: string): Checkup[] {
  return CHECKUPS.map((c) => ({ id: `${personId}:${c.type}`, personId, type: c.type, intervalMonths: c.intervalMonths, lastDone: null }));
}

export function checkupStatus(c: Checkup, now = Date.now()): CheckupStatus {
  const nextDue = c.lastDone ? addMonths(c.lastDone, c.intervalMonths) : null;
  return { ...c, nextDue, due: nextDue === null || nextDue <= now };
}
