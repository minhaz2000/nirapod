import { describe, expect, it } from 'vitest';
import type { FoodClassNutrition } from '@/lib/nutrition/schema';
import {
  addedFood,
  areaCm2FromShare,
  carbsFor,
  clampPlate,
  cmPerPixel,
  correctPortion,
  gramsFor,
  mainCarbFood,
  mealCarbs,
  plateAreaCm2,
  portionFromDetection,
  relabelPortion,
} from '@/lib/rules/portion';

const food = (modelClass: string, carbsPer100g: number, densityGPerCm3: number, typicalHeightCm: number): FoodClassNutrition => ({
  modelClass,
  foodId: 1,
  nameEn: modelClass,
  nameBn: modelClass,
  match: 'exact',
  carbsPer100g,
  densityGPerCm3,
  typicalHeightCm,
  note: null,
});
// Values from config/food-class-map.csv + FoodNetBD
const RICE = food('rice', 24.3, 0.8, 2.5);
const DAAL = food('daal', 21.2, 1.05, 1.5);
const FISH = food('fish', 1.5, 1.05, 2.0);
const RUTI = food('ruti', 49.7, 0.55, 0.4);

describe('plate scale', () => {
  it('default 26 cm plate, clamped to sensible sizes', () => {
    expect(clampPlate(undefined)).toBe(26);
    expect(clampPlate(10)).toBe(16);
    expect(clampPlate(60)).toBe(40);
    expect(clampPlate(24)).toBe(24);
    expect(plateAreaCm2(26)).toBeCloseTo(530.9, 1);
  });

  it('the plate fills the shorter side of the photo', () => {
    expect(cmPerPixel(26, 1000, 800)).toBeCloseTo(26 / 800);
  });

  it('photo area share → cm², capped at the plate area', () => {
    // 1000×800 photo, 26 cm plate → 1 px = 0.0325 cm; a 25 % share = 200,000 px = 211.25 cm²
    expect(areaCm2FromShare(0.25, 1000, 800, 26)).toBeCloseTo(211.25, 2);
    expect(areaCm2FromShare(2, 1000, 800, 26)).toBeCloseTo(plateAreaCm2(26), 5);
    expect(areaCm2FromShare(-1, 1000, 800, 26)).toBe(0);
  });
});

describe('area → volume → weight → carbs', () => {
  it('rice: 150 cm² × 2.5 cm × 0.8 g/cm³ = 300 g → 72.9 g carbs', () => {
    expect(gramsFor(150, RICE)).toBe(300);
    expect(carbsFor(300, RICE)).toBe(72.9);
  });

  it('a detection on a 1000×800 photo', () => {
    const p = portionFromDetection('a', { label: 'rice', score: 0.82, areaFraction: 0.2 }, { width: 1000, height: 800 }, 26, RICE);
    // 0.2 × 800,000 px × 0.0325² = 169 cm² → 338 g → 82.1 g carbs
    expect(p).toMatchObject({ modelClass: 'rice', source: 'model', confidence: 0.82, areaCm2: 169, grams: 338, carbs: 82.1, correction: 'right' });
  });

  it('one-tap correction: less ×0.7, more ×1.4 (from the same area)', () => {
    const p = portionFromDetection('a', { label: 'rice', score: 0.82, areaFraction: 0.2 }, { width: 1000, height: 800 }, 26, RICE);
    expect(correctPortion(p, 'less', RICE)).toMatchObject({ grams: 237, carbs: 57.6, correction: 'less' });
    expect(correctPortion(p, 'more', RICE)).toMatchObject({ grams: 473, carbs: 114.9 });
    expect(correctPortion(correctPortion(p, 'more', RICE), 'right', RICE).grams).toBe(338);
  });

  it('relabel a wrongly named food keeps the area', () => {
    const p = portionFromDetection('a', { label: 'daal', score: 0.5, areaFraction: 0.1 }, { width: 1000, height: 800 }, 26, DAAL);
    expect(relabelPortion(p, 'rice', RICE)).toMatchObject({ modelClass: 'rice', areaCm2: p.areaCm2, grams: gramsFor(p.areaCm2, RICE) });
  });

  it('"add a food the app missed": medium rice = 15 % of a 26 cm plate', () => {
    // 530.9 cm² × 0.15 = 79.6 cm² → 159 g → 38.6 g carbs
    expect(addedFood('b', 'rice', 'medium', 26, RICE)).toMatchObject({ source: 'added', confidence: null, grams: 159, carbs: 38.6 });
    expect(addedFood('c', 'rice', 'large', 26, RICE).grams).toBeGreaterThan(addedFood('d', 'rice', 'small', 26, RICE).grams);
  });

  it('a 18 cm ruti on a 26 cm plate weighs about 56 g (typical ruti 40–60 g)', () => {
    expect(gramsFor(plateAreaCm2(18), RUTI)).toBe(56);
  });

  it('meal carbs and main carb food', () => {
    const portions = [
      addedFood('1', 'rice', 'large', 26, RICE),
      addedFood('2', 'daal', 'small', 26, DAAL),
      addedFood('3', 'fish', 'medium', 26, FISH),
    ];
    expect(mealCarbs(portions)).toBe(Math.round(portions.reduce((s, p) => s + p.carbs, 0)));
    expect(mainCarbFood(portions)).toBe('rice');
    expect(mainCarbFood([])).toBeNull();
  });
});
