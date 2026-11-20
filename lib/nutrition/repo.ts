/** Read-only queries on data/build/nutrition.sqlite. Takes a Database so tests can use a fixture. */
import type Database from 'better-sqlite3';
import { editDistance, maxTypos } from '@/lib/medicine/fuzzy';
import { nameKey } from '@/lib/medicine/normalise';
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

// ---------- food search (English or Bangla name) ----------

export interface FoodMatch {
  id: number;
  nameEn: string;
  nameBn: string;
  category: string | null;
  preparation: string | null;
  carbsPer100g: number;
  sugarsPer100g: number | null;
  fibrePer100g: number | null;
  energyKcalPer100g: number | null;
  servingG: number | null;
  /** Lower is better: 0 = the food the app uses for this class (e.g. "rice"), 1 = all words match, 2 = close spelling. */
  score: number;
}

interface FoodRow {
  id: number;
  name_en: string;
  name_bn: string;
  category: string | null;
  preparation: string | null;
  carbs_per_100g: number;
  sugars_per_100g: number | null;
  fibre_per_100g: number | null;
  energy_kcal_per_100g: number | null;
  serving_g: number | null;
}

const words = (s: string) => nameKey(s).split(' ').filter(Boolean);
const BN = /[ঀ-৿]/;

/**
 * Foods by name, best first: the app's food class ("rice", "daal", "ruti" …) maps to the food it uses; otherwise all
 * query words must appear in the English name (one typo allowed per word), or the Bangla name must contain the query.
 */
export function searchFoods(db: Database.Database, query: string, limit = 5): FoodMatch[] {
  const q = query.trim().slice(0, 60);
  if (q.length < 2) return [];
  const rows = db
    .prepare('SELECT id, name_en, name_bn, category, preparation, carbs_per_100g, sugars_per_100g, fibre_per_100g, energy_kcal_per_100g, serving_g FROM foods')
    .all() as FoodRow[];
  const classFood = new Map((db.prepare('SELECT model_class, food_id FROM food_class_map').all() as Array<{ model_class: string; food_id: number }>).map((r) => [r.model_class.replace(/_/g, ' '), r.food_id]));
  const qWords = words(q);
  const aliasId = classFood.get(qWords.join(' ')) ?? classFood.get(q.toLowerCase());
  const scored: Array<{ row: FoodRow; score: number }> = [];
  for (const row of rows) {
    let score: number | null = null;
    if (row.id === aliasId) score = 0;
    else if (BN.test(q)) {
      if (row.name_bn === q) score = 0.5;
      else if (row.name_bn.includes(q)) score = 1 + (row.name_bn.length - q.length) / 100;
    } else if (qWords.length) {
      const nameWords = words(row.name_en);
      let typos = 0;
      const all = qWords.every((w) => {
        if (nameWords.includes(w) || nameWords.some((n) => n.startsWith(w) && w.length >= 4)) return true;
        const near = nameWords.some((n) => Math.abs(n.length - w.length) <= maxTypos(w.length) && editDistance(n, w) <= maxTypos(w.length));
        if (near) typos++;
        return near;
      });
      if (all) score = (typos ? 2 : 1) + (nameWords.length - qWords.length) / 100;
    }
    if (score !== null) scored.push({ row, score });
  }
  return scored
    .sort((a, b) => a.score - b.score || a.row.name_en.length - b.row.name_en.length)
    .slice(0, limit)
    .map(({ row, score }) => ({
      id: row.id,
      nameEn: row.name_en,
      nameBn: row.name_bn,
      category: row.category,
      preparation: row.preparation,
      carbsPer100g: row.carbs_per_100g,
      sugarsPer100g: row.sugars_per_100g,
      fibrePer100g: row.fibre_per_100g,
      energyKcalPer100g: row.energy_kcal_per_100g,
      servingG: row.serving_g,
      score: Math.round(score * 100) / 100,
    }));
}

/** Source and licence recorded in the database at build time. */
export function nutritionSource(db: Database.Database): { name: string; url: string; licence: string } {
  const meta = Object.fromEntries((db.prepare('SELECT key, value FROM meta').all() as Array<{ key: string; value: string }>).map((r) => [r.key, r.value]));
  return { name: meta.source_name ?? 'FoodNetBD', url: meta.source_url ?? 'https://data.mendeley.com/datasets/23f7yxnvy7/1', licence: meta.licence ?? 'CC BY 4.0' };
}
