/**
 * Demo mode only: two weeks of sample Diabetes Companion data, so the charts, patterns and doctor report look real on
 * stage. Deterministic (fixed pseudo-random seed). Every record is marked `demo: true`. The story it tells:
 *  - rice-heavy lunches are often followed by a high 2-hour reading → the rice pattern becomes "stricter";
 *  - ruti dinners stay in range → the ruti pattern becomes "softer";
 *  - one low fasting reading (3.6 mmol/L) on day 4 → shows the low-sugar handling;
 *  - Comet (metformin, 1+0+1) and Rosuva (rosuvastatin, 0+0+1) with mostly taken, a few missed and unmarked doses;
 *  - HbA1c done 80 days ago, eye check 200 days ago, foot check never, kidney test 400 days ago (due).
 */
import { doseTimes, startOfDay } from '@/lib/care/schedule';
import type { Checkup, DoseLog, GlucoseReading, Meal, MealFood, MedicinePlan } from '@/lib/store/db';

const DAY = 86_400_000;

/** Small deterministic PRNG (mulberry32). */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const food = (modelClass: string, grams: number, carbsPer100g: number): MealFood => ({
  modelClass,
  grams,
  carbs: Math.round(grams * carbsPer100g) / 100,
  source: 'model',
  confidence: 0.86,
  correction: 'right',
});

export interface DemoData {
  readings: GlucoseReading[];
  meals: Meal[];
  plans: MedicinePlan[];
  /** Dose logs refer to plans by index (ids are assigned when stored). */
  doses: Array<Omit<DoseLog, 'medicineId'> & { planIndex: number }>;
  checkups: Checkup[];
}

export function generateDemoData(personId: string, now = Date.now(), days = 14): DemoData {
  const r = rng(20261218);
  const today = startOfDay(now);
  const at = (dayOffset: number, h: number, m = 0) => today - dayOffset * DAY + h * 3_600_000 + m * 60_000;
  const readings: GlucoseReading[] = [];
  const meals: Meal[] = [];

  for (let d = days; d >= 1; d--) {
    const fasting = d === 10 ? 3.6 : Math.round((6.6 + r() * 1.6) * 10) / 10;
    readings.push({ personId, takenAt: at(d, 7, 10), mmol: fasting, kind: 'fasting', demo: true });

    // Lunch: rice-led, often large.
    const riceGrams = 260 + Math.round(r() * 120);
    const lunchFoods = [food('rice', riceGrams, 24.3), food('daal', 120, 21.2), food(r() < 0.5 ? 'fish' : 'meat', 90, 3)];
    const lunchCarbs = Math.round(lunchFoods.reduce((s, f) => s + f.carbs, 0));
    const lunchSignal = lunchCarbs > 75 ? 'red' : lunchCarbs > 50 ? 'amber' : 'green';
    meals.push({
      personId,
      takenAt: at(d, 13, 30),
      foods: lunchFoods,
      carbs: lunchCarbs,
      signal: lunchSignal,
      baseSignal: lunchSignal,
      adjusted: null,
      mainFood: 'rice',
      suggestion: lunchSignal === 'green' ? 'walkAfter' : 'riceHalf',
      demo: true,
    });
    if (d % 7 !== 0) {
      readings.push({ personId, takenAt: at(d, 15, 35), mmol: Math.round((9.6 + r() * 2.6) * 10) / 10, kind: 'twoHour', demo: true });
    }

    // Dinner: ruti-led, moderate.
    const dinnerFoods = [food('ruti', 90 + Math.round(r() * 30), 49.7), food('vegetable', 150, 9.5), food('egg', 50, 1.12)];
    const dinnerCarbs = Math.round(dinnerFoods.reduce((s, f) => s + f.carbs, 0));
    const dinnerSignal = dinnerCarbs > 75 ? 'red' : dinnerCarbs > 50 ? 'amber' : 'green';
    meals.push({
      personId,
      takenAt: at(d, 20, 45),
      foods: dinnerFoods,
      carbs: dinnerCarbs,
      signal: dinnerSignal,
      baseSignal: dinnerSignal,
      adjusted: null,
      mainFood: 'ruti',
      suggestion: dinnerSignal === 'green' ? 'walkAfter' : 'breadFewer',
      demo: true,
    });
    if (d % 3 !== 0) {
      readings.push({ personId, takenAt: at(d, 22, 50), mmol: Math.round((6.4 + r() * 1.2) * 10) / 10, kind: 'twoHour', demo: true });
    }
  }

  const start = today - days * DAY;
  const plans: MedicinePlan[] = [
    { personId, brand: 'Comet', generic: 'Metformin Hydrochloride', strength: '500mg', instructions: '1+0+1 · 3 months', times: ['08:00', '21:00'], startDate: start, endDate: null, source: 'prescription', active: true, demo: true },
    { personId, brand: 'Rosuva', generic: 'Rosuvastatin', strength: '10mg', instructions: '0+0+1 · 3 months', times: ['21:00'], startDate: start, endDate: null, source: 'prescription', active: true, demo: true },
  ];
  const doses: DemoData['doses'] = [];
  plans.forEach((p, planIndex) => {
    for (const dueAt of doseTimes(p, start, today)) {
      const x = r();
      if (x < 0.06) continue; // not marked
      doses.push({ personId, planIndex, dueAt, status: x < 0.14 ? 'missed' : 'taken', recordedAt: dueAt + 10 * 60_000, demo: true });
    }
  });

  const checkups: Checkup[] = [
    { id: `${personId}:hba1c`, personId, type: 'hba1c', intervalMonths: 3, lastDone: today - 80 * DAY },
    { id: `${personId}:eye`, personId, type: 'eye', intervalMonths: 12, lastDone: today - 200 * DAY },
    { id: `${personId}:foot`, personId, type: 'foot', intervalMonths: 12, lastDone: null },
    { id: `${personId}:kidney`, personId, type: 'kidney', intervalMonths: 12, lastDone: today - 400 * DAY },
  ];
  return { readings, meals, plans, doses, checkups };
}
