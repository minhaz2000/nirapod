/**
 * Diabetes Companion rules (pure, deterministic):
 *  - control level from the latest fasting glucose and optional HbA1c (config/glucose-targets.ts),
 *  - green / amber / red meal signal from meal carbs and control level (config/meal-signal.ts),
 *  - personal learning from 2-hour readings (5+ readings per food → that food's signal is adjusted),
 *  - one practical suggestion about the MEAL — never about medicine or insulin (rule 3).
 * Low glucose (< 3.9 mmol/L) is handled first everywhere (rule 6, lib/rules/glucose.ts).
 */
import { GLUCOSE_TARGETS, type ControlLevel } from '@/config/glucose-targets';
import { LEARNING, MEAL_CARB_THRESHOLDS } from '@/config/meal-signal';

export type Signal = 'green' | 'amber' | 'red';
const ORDER: Signal[] = ['green', 'amber', 'red'];
const LEVELS: ControlLevel[] = ['good', 'fair', 'poor'];

function level(value: number, t: { goodBelow: number; fairBelow: number }): ControlLevel {
  return value < t.goodBelow ? 'good' : value < t.fairBelow ? 'fair' : 'poor';
}

/** Worse of the fasting and HbA1c levels (HbA1c is optional). */
export function controlLevel(input: { fastingMmol: number; hba1c?: number | null }): ControlLevel {
  const levels = [level(input.fastingMmol, GLUCOSE_TARGETS.fasting)];
  if (typeof input.hba1c === 'number' && Number.isFinite(input.hba1c)) levels.push(level(input.hba1c, GLUCOSE_TARGETS.hba1c));
  return levels.reduce((a, b) => (LEVELS.indexOf(b) > LEVELS.indexOf(a) ? b : a));
}

export function baseSignal(carbs: number, control: ControlLevel): Signal {
  const t = MEAL_CARB_THRESHOLDS[control];
  return carbs <= t.green ? 'green' : carbs <= t.amber ? 'amber' : 'red';
}

// --- personal learning --------------------------------------------------------------------------------------------

export interface MealOutcome {
  /** Food that gave the most carbs in the meal. */
  mainFood: string | null;
  /** 2-hour glucose after the meal (mmol/L). */
  twoHourMmol: number;
}

export interface FoodPattern {
  food: string;
  readings: number;
  average2h: number;
  highest2h: number;
  /** Average rise over the user's fasting baseline, if known. */
  averageRise: number | null;
  adjustment: 'stricter' | 'relaxed' | null;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Per-food patterns from meals that have a 2-hour reading. Adjusts only foods with ≥ LEARNING.minReadings. */
export function foodPatterns(outcomes: readonly MealOutcome[], fastingBaselineMmol?: number | null): FoodPattern[] {
  const byFood = new Map<string, number[]>();
  for (const o of outcomes) {
    if (!o.mainFood || !Number.isFinite(o.twoHourMmol)) continue;
    const list = byFood.get(o.mainFood) ?? [];
    list.push(o.twoHourMmol);
    byFood.set(o.mainFood, list);
  }
  return [...byFood.entries()]
    .map(([food, values]) => {
      const average2h = values.reduce((s, v) => s + v, 0) / values.length;
      const highest2h = Math.max(...values);
      const enough = values.length >= LEARNING.minReadings;
      const adjustment: FoodPattern['adjustment'] = !enough
        ? null
        : average2h >= LEARNING.stricterAtOrAbove
          ? 'stricter'
          : average2h < LEARNING.relaxedBelow && highest2h < LEARNING.stricterAtOrAbove
            ? 'relaxed'
            : null;
      return {
        food,
        readings: values.length,
        average2h: round1(average2h),
        highest2h: round1(highest2h),
        averageRise: typeof fastingBaselineMmol === 'number' ? round1(average2h - fastingBaselineMmol) : null,
        adjustment,
      };
    })
    .sort((a, b) => b.readings - a.readings || a.food.localeCompare(b.food));
}

/** Applies the user's pattern for the meal's main food: stricter = one step up; relaxed = amber → green only. */
export function personalSignal(base: Signal, pattern: FoodPattern | undefined): { signal: Signal; adjusted: FoodPattern['adjustment'] } {
  if (!pattern?.adjustment) return { signal: base, adjusted: null };
  const i = ORDER.indexOf(base);
  if (pattern.adjustment === 'stricter' && i < 2) return { signal: ORDER[i + 1]!, adjusted: 'stricter' };
  if (pattern.adjustment === 'relaxed' && base === 'amber') return { signal: 'green', adjusted: 'relaxed' };
  return { signal: base, adjusted: null };
}

// --- one practical suggestion ------------------------------------------------------------------------------------

export type Suggestion = 'walkAfter' | 'riceHalf' | 'breadFewer' | 'friedSnack' | 'drinkLessSugar' | 'smallerStarch' | 'addVegetables';

const GROUPS: Record<Exclude<Suggestion, 'walkAfter' | 'addVegetables'>, readonly string[]> = {
  riceHalf: ['rice'],
  breadFewer: ['ruti', 'puri'],
  friedSnack: ['chop', 'singara', 'vegetable_roll'],
  drinkLessSugar: ['chaa', 'matha'],
  smallerStarch: ['chola', 'mashed_potato', 'daal'],
};

/** One practical suggestion about the meal itself. Message keys: diabetes.suggestions.<key>. */
export function suggestion(signal: Signal, mainFood: string | null): Suggestion {
  if (signal === 'green') return 'walkAfter';
  for (const [key, foods] of Object.entries(GROUPS) as Array<[Suggestion, readonly string[]]>) {
    if (mainFood && foods.includes(mainFood)) return key;
  }
  return 'addVegetables';
}

/** True if a reading counts as the 2-hour reading for a meal eaten at `mealAt`. */
export function isTwoHourReading(mealAt: number, readingAt: number): boolean {
  const minutes = (readingAt - mealAt) / 60_000;
  return Math.abs(minutes - LEARNING.twoHourMinutes) <= LEARNING.windowMinutes;
}
