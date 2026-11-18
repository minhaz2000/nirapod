/**
 * Portion maths (pure): photo area → cm² → volume (× typical height) → grams (× density) → carbs.
 * The plate diameter set once by the user gives the scale (config/portion.ts). Every estimate is shown to the user,
 * who can say less / about right / more, remove a wrong food, or add one the app missed.
 */
import { PORTION, type AddedFoodSize, type PortionCorrection } from '@/config/portion';
import type { FoodClassNutrition } from '@/lib/nutrition/schema';

export interface FoodPortion {
  id: string;
  modelClass: string;
  source: 'model' | 'added';
  /** Model confidence (null for foods the user added). */
  confidence: number | null;
  /** Estimated area on the plate before correction (cm²). */
  areaCm2: number;
  correction: PortionCorrection;
  grams: number;
  carbs: number;
}

export const plateAreaCm2 = (diameterCm: number) => Math.PI * (diameterCm / 2) ** 2;

export function clampPlate(diameterCm: number | undefined): number {
  const d = Number(diameterCm);
  if (!Number.isFinite(d) || d <= 0) return PORTION.defaultPlateDiameterCm;
  return Math.min(PORTION.maxPlateDiameterCm, Math.max(PORTION.minPlateDiameterCm, d));
}

/** cm per pixel: the plate fills the shorter side of the photo. */
export const cmPerPixel = (plateDiameterCm: number, imageW: number, imageH: number) => plateDiameterCm / Math.min(imageW, imageH);

/** Area of a food in cm² from its share of the photo, capped at the plate area. */
export function areaCm2FromShare(areaFraction: number, imageW: number, imageH: number, plateDiameterCm: number): number {
  const s = cmPerPixel(plateDiameterCm, imageW, imageH);
  const area = Math.max(0, areaFraction) * imageW * imageH * s * s;
  return Math.min(area, plateAreaCm2(plateDiameterCm));
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export function gramsFor(areaCm2: number, food: Pick<FoodClassNutrition, 'densityGPerCm3' | 'typicalHeightCm'>, correction: PortionCorrection = 'right'): number {
  return Math.round(areaCm2 * food.typicalHeightCm * food.densityGPerCm3 * PORTION.correction[correction]);
}

export const carbsFor = (grams: number, food: Pick<FoodClassNutrition, 'carbsPer100g'>) => round1((grams * food.carbsPer100g) / 100);

function build(id: string, modelClass: string, source: FoodPortion['source'], confidence: number | null, areaCm2: number, food: FoodClassNutrition, correction: PortionCorrection = 'right'): FoodPortion {
  const grams = gramsFor(areaCm2, food, correction);
  return { id, modelClass, source, confidence, areaCm2: round1(areaCm2), correction, grams, carbs: carbsFor(grams, food) };
}

export function portionFromDetection(
  id: string,
  det: { label: string; score: number; areaFraction: number },
  image: { width: number; height: number },
  plateDiameterCm: number,
  food: FoodClassNutrition,
): FoodPortion {
  return build(id, det.label, 'model', det.score, areaCm2FromShare(det.areaFraction, image.width, image.height, plateDiameterCm), food);
}

/** "Add a food the app missed": small / medium / large share of the plate. */
export function addedFood(id: string, modelClass: string, size: AddedFoodSize, plateDiameterCm: number, food: FoodClassNutrition): FoodPortion {
  return build(id, modelClass, 'added', null, plateAreaCm2(plateDiameterCm) * PORTION.addedFoodShare[size], food);
}

/** One-tap correction: less / about right / more. */
export function correctPortion(p: FoodPortion, correction: PortionCorrection, food: FoodClassNutrition): FoodPortion {
  return build(p.id, p.modelClass, p.source, p.confidence, p.areaCm2, food, correction);
}

/** The user says the app named the food wrongly: same area, other food. */
export function relabelPortion(p: FoodPortion, modelClass: string, food: FoodClassNutrition): FoodPortion {
  return build(p.id, modelClass, p.source, p.confidence, p.areaCm2, food, p.correction);
}

export const mealCarbs = (portions: readonly FoodPortion[]) => Math.round(portions.reduce((s, p) => s + p.carbs, 0));

/** The food giving the most carbs in the meal (used for suggestions and personal patterns). */
export function mainCarbFood(portions: readonly FoodPortion[]): string | null {
  const byClass = new Map<string, number>();
  for (const p of portions) byClass.set(p.modelClass, (byClass.get(p.modelClass) ?? 0) + p.carbs);
  let best: string | null = null;
  let max = 0;
  for (const [cls, c] of byClass) if (c > max) [best, max] = [cls, c];
  return best;
}
