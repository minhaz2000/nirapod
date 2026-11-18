/** Browser: nutrition table for the 16 food classes, kept on the phone so meal signals work offline. */
import type { FoodClassNutrition } from './schema';

const KEY = 'nirapod.nutrition.v1';

export async function getNutritionTable(): Promise<Record<string, FoodClassNutrition> | null> {
  const cached = typeof localStorage !== 'undefined' ? localStorage.getItem(KEY) : null;
  try {
    const res = await fetch('/api/food/nutrition');
    if (res.ok) {
      const { foods } = (await res.json()) as { foods: FoodClassNutrition[] };
      const table = Object.fromEntries(foods.map((f) => [f.modelClass, f]));
      localStorage.setItem(KEY, JSON.stringify(table));
      return table;
    }
  } catch {
    /* offline: use the copy on the phone */
  }
  return cached ? (JSON.parse(cached) as Record<string, FoodClassNutrition>) : null;
}
