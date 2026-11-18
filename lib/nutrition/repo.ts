/** Read-only queries on data/build/nutrition.sqlite. Takes a Database so tests can use a fixture. */
import type Database from 'better-sqlite3';
import type { FoodClassNutrition } from './schema';

interface Row {
  model_class: string;
  food_id: number;
  name_en: string;
  name_bn: string;
  match: FoodClassNutrition['match'];
  carbs_per_100g: number;
  density_g_per_cm3: number;
  typical_height_cm: number;
  note: string | null;
}

const SELECT = `
  SELECT m.model_class, m.food_id, f.name_en, f.name_bn, m.match, f.carbs_per_100g,
         m.density_g_per_cm3, m.typical_height_cm, m.note
  FROM food_class_map m JOIN foods f ON f.id = m.food_id`;

const toEntry = (r: Row): FoodClassNutrition => ({
  modelClass: r.model_class,
  foodId: r.food_id,
  nameEn: r.name_en,
  nameBn: r.name_bn,
  match: r.match,
  carbsPer100g: r.carbs_per_100g,
  densityGPerCm3: r.density_g_per_cm3,
  typicalHeightCm: r.typical_height_cm,
  note: r.note,
});

export function allFoodClasses(db: Database.Database): FoodClassNutrition[] {
  return (db.prepare(`${SELECT} ORDER BY m.model_class`).all() as Row[]).map(toEntry);
}

export function foodClass(db: Database.Database, modelClass: string): FoodClassNutrition | null {
  const r = db.prepare(`${SELECT} WHERE m.model_class = ?`).get(modelClass) as Row | undefined;
  return r ? toEntry(r) : null;
}
