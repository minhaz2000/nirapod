import { describe, expect, it } from 'vitest';
import en from '@/messages/en.json';
import { MEAL_CARB_THRESHOLDS } from '@/config/meal-signal';
import { baseSignal, controlLevel, foodPatterns, isTwoHourReading, personalSignal, suggestion } from '@/lib/rules/meal-signal';
import { isLowGlucose, toMmol } from '@/lib/rules/glucose';
import { emergencyHref } from '@/lib/emergency/navigate';

describe('control level (config/glucose-targets.ts)', () => {
  it('from fasting glucose', () => {
    expect(controlLevel({ fastingMmol: 6.5 })).toBe('good');
    expect(controlLevel({ fastingMmol: 8.4 })).toBe('fair');
    expect(controlLevel({ fastingMmol: 11.2 })).toBe('poor');
  });
  it('the worse of fasting and HbA1c', () => {
    expect(controlLevel({ fastingMmol: 6.5, hba1c: 8.6 })).toBe('poor');
    expect(controlLevel({ fastingMmol: 9.0, hba1c: 6.4 })).toBe('fair');
    expect(controlLevel({ fastingMmol: 6.5, hba1c: null })).toBe('good');
  });
  it('boundaries: HbA1c 7.0 is fair, fasting 10.0 is poor', () => {
    expect(controlLevel({ fastingMmol: 5, hba1c: 7.0 })).toBe('fair');
    expect(controlLevel({ fastingMmol: 10.0 })).toBe('poor');
  });
});

describe('green / amber / red thresholds (config/meal-signal.ts)', () => {
  it.each([
    ['good', 60, 'green'],
    ['good', 61, 'amber'],
    ['good', 90, 'amber'],
    ['good', 91, 'red'],
    ['fair', 50, 'green'],
    ['fair', 76, 'red'],
    ['poor', 45, 'green'],
    ['poor', 46, 'amber'],
    ['poor', 61, 'red'],
  ] as const)('%s control, %i g carbs → %s', (level, carbs, signal) => {
    expect(baseSignal(carbs, level)).toBe(signal);
  });
  it('stricter control means lower thresholds', () => {
    expect(MEAL_CARB_THRESHOLDS.poor.green).toBeLessThan(MEAL_CARB_THRESHOLDS.fair.green);
    expect(MEAL_CARB_THRESHOLDS.fair.green).toBeLessThan(MEAL_CARB_THRESHOLDS.good.green);
  });
});

describe('personal learning from 2-hour readings', () => {
  const rice = (v: number) => ({ mainFood: 'rice', twoHourMmol: v });
  it('needs 5 readings before adjusting', () => {
    const four = foodPatterns([rice(11), rice(12), rice(10.5), rice(11.5)]);
    expect(four[0]).toMatchObject({ food: 'rice', readings: 4, adjustment: null });
    const five = foodPatterns([rice(11), rice(12), rice(10.5), rice(11.5), rice(10.8)], 7.0);
    expect(five[0]).toMatchObject({ readings: 5, average2h: 11.2, highest2h: 12, averageRise: 4.2, adjustment: 'stricter' });
  });
  it('relaxed only when every reading stayed below the target', () => {
    expect(foodPatterns([7.1, 7.0, 6.8, 7.4, 7.2].map(rice))[0]!.adjustment).toBe('relaxed');
    expect(foodPatterns([7.1, 7.0, 6.8, 7.4, 10.4].map(rice))[0]!.adjustment).toBeNull(); // one high reading
  });
  it('attributes a meal to its main carb food only', () => {
    const p = foodPatterns([{ mainFood: 'ruti', twoHourMmol: 9 }, { mainFood: 'rice', twoHourMmol: 12 }, { mainFood: null, twoHourMmol: 8 }]);
    expect(p.map((x) => x.food).sort()).toEqual(['rice', 'ruti']);
  });
  it('stricter: one step up; relaxed: amber → green only, never red → amber', () => {
    const strict = { food: 'rice', readings: 6, average2h: 11, highest2h: 12, averageRise: null, adjustment: 'stricter' as const };
    const relaxed = { ...strict, adjustment: 'relaxed' as const };
    expect(personalSignal('green', strict)).toEqual({ signal: 'amber', adjusted: 'stricter' });
    expect(personalSignal('amber', strict)).toEqual({ signal: 'red', adjusted: 'stricter' });
    expect(personalSignal('red', strict)).toEqual({ signal: 'red', adjusted: null });
    expect(personalSignal('amber', relaxed)).toEqual({ signal: 'green', adjusted: 'relaxed' });
    expect(personalSignal('red', relaxed)).toEqual({ signal: 'red', adjusted: null });
    expect(personalSignal('amber', undefined)).toEqual({ signal: 'amber', adjusted: null });
  });
  it('2-hour window: 120 ± 45 minutes after the meal', () => {
    const meal = Date.UTC(2026, 10, 18, 13, 0);
    expect(isTwoHourReading(meal, meal + 120 * 60_000)).toBe(true);
    expect(isTwoHourReading(meal, meal + 80 * 60_000)).toBe(true);
    expect(isTwoHourReading(meal, meal + 60 * 60_000)).toBe(false);
    expect(isTwoHourReading(meal, meal + 170 * 60_000)).toBe(false);
  });
});

describe('one practical suggestion — never medicine (rule 3)', () => {
  it('picks by signal and main food', () => {
    expect(suggestion('green', 'rice')).toBe('walkAfter');
    expect(suggestion('red', 'rice')).toBe('riceHalf');
    expect(suggestion('amber', 'puri')).toBe('breadFewer');
    expect(suggestion('red', 'singara')).toBe('friedSnack');
    expect(suggestion('amber', 'chaa')).toBe('drinkLessSugar');
    expect(suggestion('amber', 'fish')).toBe('addVegetables');
  });
  it('no suggestion text mentions medicine, insulin or doses', () => {
    const texts = Object.values((en as unknown as { diabetes: { suggestions: Record<string, string> } }).diabetes.suggestions);
    expect(texts.length).toBeGreaterThanOrEqual(7);
    for (const t of texts) expect(t).not.toMatch(/medicine|medication|insulin|dose|tablet|metformin/i);
  });
});

describe('rule 6: any glucose below 3.9 mmol/L (70 mg/dL) → emergency guidance and Part 4', () => {
  it('detects low readings in either unit and routes to the emergency page', () => {
    expect(isLowGlucose(3.8)).toBe(true);
    expect(isLowGlucose(toMmol(65, 'mgdl'))).toBe(true);
    expect(isLowGlucose(4.0)).toBe(false);
    expect(emergencyHref({ glucoseMmol: 3.2 })).toBe('/emergency?signs=lowGlucose');
  });
});
