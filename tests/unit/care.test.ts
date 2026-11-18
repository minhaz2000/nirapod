import { describe, expect, it } from 'vitest';
import { addMonths, checkupStatus, defaultCheckups } from '@/lib/care/checkups';
import { DEFAULT_REMINDERS, dueReminders } from '@/lib/care/reminders';
import { adherence, doseTimes, parseDurationDays, parseFrequency, planFromLine, startOfDay } from '@/lib/care/schedule';
import type { DoseLog, MedicinePlan } from '@/lib/store/db';

const DAY = 86_400_000;
const T0 = new Date(2026, 10, 10, 0, 0, 0).getTime(); // 10 Nov 2026, local midnight

describe('medicine schedule from the instruction as written', () => {
  it.each([
    ['1+0+1', ['08:00', '21:00']],
    ['1+1+1', ['08:00', '14:00', '21:00']],
    ['0+0+1', ['21:00']],
    ['½+0+½', ['08:00', '21:00']],
    ['১+০+১', ['08:00', '21:00']],
    ['1+1+1+1', ['08:00', '14:00', '18:00', '21:00']],
    ['BD', ['08:00', '21:00']],
    ['TDS after meal', ['08:00', '14:00', '21:00']],
    ['once daily', ['08:00']],
    ['at night', ['21:00']],
    ['রাতে', ['21:00']],
  ])('%s → %j', (text, times) => {
    expect(parseFrequency(text)).toMatchObject({ times, asNeeded: false, recognised: true });
  });

  it('SOS / as needed has no reminders; unknown text asks the user', () => {
    expect(parseFrequency('SOS')).toEqual({ times: [], asNeeded: true, recognised: true });
    expect(parseFrequency('প্রয়োজনে')).toMatchObject({ asNeeded: true });
    expect(parseFrequency('as directed')).toEqual({ times: [], asNeeded: false, recognised: false });
  });

  it('durations', () => {
    expect(parseDurationDays('30 days')).toBe(30);
    expect(parseDurationDays('2 weeks')).toBe(14);
    expect(parseDurationDays('1 month')).toBe(30);
    expect(parseDurationDays('৭ দিন')).toBe(7);
    expect(parseDurationDays('continue')).toBeNull();
  });

  it('plan from a confirmed prescription line keeps the instruction text unchanged', () => {
    const p = planFromLine({ brand: 'Comet', generic: 'Metformin Hydrochloride', strength: '500mg', frequency: '1+0+1', duration: '30 days' }, 'me', 'prescription', T0 + 10 * 3_600_000);
    expect(p).toMatchObject({ brand: 'Comet', instructions: '1+0+1 · 30 days', times: ['08:00', '21:00'], startDate: T0, active: true, recognised: true });
    expect(p.endDate).toBe(T0 + 30 * DAY - 1);
  });

  it('dose times in a range respect start and end dates', () => {
    const plan = { times: ['08:00', '21:00'], startDate: T0, endDate: T0 + 2 * DAY - 1, active: true };
    const times = doseTimes(plan, T0 - DAY, T0 + 5 * DAY);
    expect(times).toHaveLength(4); // 2 days × 2
    expect(new Date(times[0]!).getHours()).toBe(8);
    expect(doseTimes({ ...plan, active: false }, T0, T0 + DAY)).toEqual([]);
    expect(startOfDay(T0 + 5 * 3_600_000)).toBe(T0);
  });
});

describe('adherence', () => {
  const plan: MedicinePlan = { id: 1, personId: 'me', brand: 'Comet', generic: 'Metformin', strength: '500mg', instructions: '1+0+1', times: ['08:00', '21:00'], startDate: T0, source: 'manual', active: true };
  const due = doseTimes(plan, T0, T0 + 3 * DAY); // 6 doses
  const log = (dueAt: number, status: DoseLog['status']): DoseLog => ({ personId: 'me', medicineId: 1, dueAt, status, recordedAt: dueAt });

  it('counts taken, missed and not marked; percent = taken / scheduled', () => {
    const logs = [log(due[0]!, 'taken'), log(due[1]!, 'taken'), log(due[2]!, 'missed'), log(due[3]!, 'taken')];
    expect(adherence(plan, logs, T0, T0 + 3 * DAY)).toEqual({ scheduled: 6, taken: 3, missed: 1, unmarked: 2, percent: 50 });
  });
  it('future doses do not count', () => {
    expect(adherence(plan, [], T0, T0 + 12 * 3_600_000).scheduled).toBe(1); // only 08:00 has passed
  });
  it('nothing scheduled → percent null', () => {
    expect(adherence({ ...plan, times: [] }, [], T0, T0 + DAY).percent).toBeNull();
  });
});

describe('check-ups (config/checkups.ts)', () => {
  it('defaults: HbA1c 3 months; eye, foot and kidney yearly', () => {
    expect(defaultCheckups('me').map((c) => [c.type, c.intervalMonths])).toEqual([
      ['hba1c', 3],
      ['eye', 12],
      ['foot', 12],
      ['kidney', 12],
    ]);
  });
  it('next due date and overdue', () => {
    const done = new Date(2026, 0, 31).getTime();
    expect(new Date(addMonths(done, 1)).getDate()).toBe(28); // 31 Jan + 1 month → 28 Feb
    const c = { id: 'me:hba1c', personId: 'me', type: 'hba1c', intervalMonths: 3, lastDone: new Date(2026, 6, 1).getTime() };
    expect(checkupStatus(c, new Date(2026, 8, 1).getTime())).toMatchObject({ due: false });
    expect(checkupStatus(c, new Date(2026, 10, 1).getTime())).toMatchObject({ due: true });
    expect(checkupStatus({ ...c, lastDone: null }).due).toBe(true); // never done
  });
});

describe('reminders', () => {
  const plan: MedicinePlan = { id: 7, personId: 'me', brand: 'Comet', generic: null, strength: '500mg', instructions: '1+0+1', times: ['08:00', '21:00'], startDate: T0, source: 'manual', active: true };
  const at = (h: number, m = 0) => T0 + h * 3_600_000 + m * 60_000;

  it('medicine reminder at each dose time, inside the window only', () => {
    const r = dueReminders(at(7, 59), at(8, 1), DEFAULT_REMINDERS('me'), { plans: [plan], meals: [], checkups: [] });
    expect(r).toEqual([{ kind: 'medicine', at: at(8), medicineId: 7, brand: 'Comet', instructions: '1+0+1' }]);
    expect(dueReminders(at(8, 1), at(9), DEFAULT_REMINDERS('me'), { plans: [plan], meals: [], checkups: [] })).toEqual([]);
  });

  it('meal-time and walk-after-meal reminders when switched on', () => {
    const s = { ...DEFAULT_REMINDERS('me'), meals: { enabled: true, breakfast: '08:30', lunch: '13:30', dinner: '21:00' }, walkAfterMeals: true };
    const meal = { personId: 'me', takenAt: at(13, 40), foods: [], carbs: 60, signal: 'amber' as const, baseSignal: 'amber' as const, adjusted: null, mainFood: 'rice', suggestion: 'riceHalf' };
    const r = dueReminders(at(13), at(14), s, { plans: [], meals: [meal], checkups: [] });
    expect(r.map((x) => x.kind)).toEqual(['meal', 'walk']);
    expect(r[1]).toMatchObject({ at: at(13, 55) });
  });

  it('check-up reminder on its due date', () => {
    const lastDone = new Date(2026, 7, 10, 9).getTime(); // + 3 months = 10 Nov 09:00
    const c = { id: 'me:hba1c', personId: 'me', type: 'hba1c', intervalMonths: 3, lastDone };
    expect(dueReminders(at(8), at(10), DEFAULT_REMINDERS('me'), { plans: [], meals: [], checkups: [c] })).toEqual([{ kind: 'checkup', at: at(9), type: 'hba1c' }]);
  });
});
