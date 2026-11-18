/** Diabetes Companion data on the phone (IndexedDB). Everything is per person (family mode). */
import { LEARNING } from '@/config/meal-signal';
import { foodPatterns, isTwoHourReading, type FoodPattern, type MealOutcome } from '@/lib/rules/meal-signal';
import { getDb, ME, type DiabetesProfile, type GlucoseKind, type GlucoseReading, type Meal } from './db';
import { getSettings, updateSettings } from './settings';

export async function activePersonId(): Promise<string> {
  return (await getSettings()).activePersonId ?? ME;
}

export const getDiabetesProfile = (personId: string) => getDb().diabetes.get(personId);

export async function saveDiabetesProfile(p: DiabetesProfile): Promise<void> {
  await getDb().diabetes.put(p);
  const s = await getSettings();
  if (!s.trialStart) await updateSettings({ trialStart: p.onboardedAt }); // 7-week trial starts at first use
}

export async function addMeal(meal: Omit<Meal, 'id'>): Promise<number> {
  return (await getDb().meals.add(meal as Meal)) as number;
}

export async function addGlucose(r: Omit<GlucoseReading, 'id'>): Promise<number> {
  return (await getDb().glucose.add(r as GlucoseReading)) as number;
}

export function mealsSince(personId: string, since: number): Promise<Meal[]> {
  return getDb().meals.where('[personId+takenAt]').between([personId, since], [personId, Infinity]).toArray();
}

export function glucoseSince(personId: string, since: number): Promise<GlucoseReading[]> {
  return getDb().glucose.where('[personId+takenAt]').between([personId, since], [personId, Infinity]).toArray();
}

/** Pairs meals with their 2-hour reading (linked by mealId, or taken in the 2-hour window). */
export function mealOutcomes(meals: readonly Meal[], readings: readonly GlucoseReading[]): Array<MealOutcome & { mealId: number }> {
  const out: Array<MealOutcome & { mealId: number }> = [];
  for (const m of meals) {
    const r =
      readings.find((g) => g.mealId === m.id && g.kind === 'twoHour') ??
      readings.find((g) => g.kind === 'twoHour' && g.mealId === undefined && isTwoHourReading(m.takenAt, g.takenAt));
    if (r && m.id !== undefined) out.push({ mealId: m.id, mainFood: m.mainFood, twoHourMmol: r.mmol });
  }
  return out;
}

export async function patternsFor(personId: string, fastingBaseline?: number | null): Promise<FoodPattern[]> {
  const [meals, readings] = await Promise.all([mealsSince(personId, 0), glucoseSince(personId, 0)]);
  return foodPatterns(mealOutcomes(meals, readings), fastingBaseline);
}

/** Meals whose 2-hour reading is due (or overdue by up to 3 hours) and not yet entered. */
export async function pendingTwoHour(personId: string, now = Date.now()): Promise<Meal[]> {
  const since = now - (LEARNING.twoHourMinutes + 180) * 60_000;
  const [meals, readings] = await Promise.all([mealsSince(personId, since), glucoseSince(personId, since)]);
  const done = new Set(mealOutcomes(meals, readings).map((o) => o.mealId));
  return meals.filter((m) => m.id !== undefined && !done.has(m.id) && now - m.takenAt >= (LEARNING.twoHourMinutes - LEARNING.windowMinutes) * 60_000);
}

export const GLUCOSE_KINDS: readonly GlucoseKind[] = ['fasting', 'beforeMeal', 'twoHour', 'random'];
