import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { generateDemoData } from '@/lib/demo/diabetes';
import { buildDoctorReport } from '@/lib/care/report';
import { checkupStatus } from '@/lib/care/checkups';
import { foodPatterns } from '@/lib/rules/meal-signal';
import { mealOutcomes } from '@/lib/store/diabetes';
import { getDb } from '@/lib/store/db';
import { loadDemoData } from '@/lib/store/demo';

const NOW = new Date(2026, 11, 26, 10, 0).getTime(); // Congress Day
const data = generateDemoData('me', NOW);

describe('demo data (two weeks)', () => {
  it('is deterministic and marked as demo', () => {
    expect(generateDemoData('me', NOW)).toEqual(data);
    for (const rec of [...data.readings, ...data.meals, ...data.plans, ...data.doses]) expect(rec.demo).toBe(true);
  });

  it('covers 14 days with fasting and 2-hour readings, including one low', () => {
    const days = new Set(data.readings.map((r) => new Date(r.takenAt).toDateString()));
    expect(days.size).toBe(14);
    expect(data.readings.filter((r) => r.mmol < 3.9)).toHaveLength(1);
    expect(data.meals).toHaveLength(28);
    expect(data.readings.every((r) => r.takenAt < NOW)).toBe(true);
  });

  it('tells the learning story: rice stricter, ruti softer', () => {
    const outcomes = mealOutcomes(
      data.meals.map((m, i) => ({ ...m, id: i + 1 })),
      data.readings,
    );
    const p = foodPatterns(outcomes, 7.2);
    expect(p.find((x) => x.food === 'rice')).toMatchObject({ adjustment: 'stricter' });
    expect(p.find((x) => x.food === 'ruti')).toMatchObject({ adjustment: 'relaxed' });
    expect(p.find((x) => x.food === 'rice')!.readings).toBeGreaterThanOrEqual(5);
  });

  it('makes a doctor report that looks real', () => {
    const plans = data.plans.map((p, i) => ({ ...p, id: i + 1 }));
    const doses = data.doses.map(({ planIndex, ...d }) => ({ ...d, medicineId: planIndex + 1 }));
    const r = buildDoctorReport({ now: NOW, profile: null, readings: data.readings, meals: data.meals, plans, doses, checkups: data.checkups });
    expect(r.glucose.count).toBe(data.readings.length);
    expect(r.glucose.lows).toBe(1);
    expect(r.glucose.highs).toBeGreaterThan(3);
    for (const m of r.medicines) {
      expect(m.adherence.percent).toBeGreaterThan(70);
      expect(m.adherence.percent).toBeLessThan(100);
      expect(m.adherence.missed).toBeGreaterThan(0);
    }
    expect(data.checkups.map((c) => checkupStatus(c, NOW).due)).toEqual([false, false, true, true]);
  });

  it('is stored on the phone with dose logs linked to the stored medicines', async () => {
    await loadDemoData('me', NOW);
    const db = getDb();
    expect(await db.glucose.count()).toBe(data.readings.length);
    const plans = await db.medicines.toArray();
    const doses = await db.doses.toArray();
    expect(plans).toHaveLength(2);
    expect(new Set(doses.map((d) => d.medicineId))).toEqual(new Set(plans.map((p) => p.id)));
  });
});
