import Database from 'better-sqlite3';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { allFoodClasses, foodClass } from '@/lib/nutrition/repo';
import { NUTRITION_SCHEMA } from '@/lib/nutrition/schema';

const MODEL_CLASSES: string[] = JSON.parse(readFileSync('public/models/food_seg.json', 'utf8')).classes;

describe('config/food-class-map.csv', () => {
  const lines = readFileSync('config/food-class-map.csv', 'utf8')
    .split('\n')
    .filter((l) => l.trim() && !l.startsWith('#'));
  const rows = lines.slice(1).map((l) => l.split(','));

  it('is marked for nutritionist review', () => {
    expect(readFileSync('config/food-class-map.csv', 'utf8')).toMatch(/^# NEEDS NUTRITIONIST REVIEW/);
  });
  it('maps exactly the 16 classes of food_seg.json', () => {
    expect(rows.map((r) => r[0]).sort()).toEqual([...MODEL_CLASSES].sort());
  });
  it('has positive, plausible density (0.3–1.3 g/cm³) and height (0.2–8 cm)', () => {
    for (const r of rows) {
      const density = Number(r[4]);
      const height = Number(r[5]);
      expect(density, r[0]).toBeGreaterThan(0.3);
      expect(density, r[0]).toBeLessThan(1.3);
      expect(height, r[0]).toBeGreaterThan(0.2);
      expect(height, r[0]).toBeLessThan(8);
      expect(['exact', 'close', 'proxy']).toContain(r[3]);
    }
  });
});

describe('nutrition repo (fixture)', () => {
  const db = new Database(':memory:');
  db.exec(NUTRITION_SCHEMA);
  db.prepare('INSERT INTO foods VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').run(36, 'Boiled Rice BR-28', 'সিদ্ধ ভাত', 'Cereals', 'Boiled', 24.3, 0.1, 0.4, 112, 2.3, 0.2, 80);
  db.prepare('INSERT INTO food_class_map VALUES (?,?,?,?,?,?)').run('rice', 36, 'exact', 0.8, 2.5, null);

  it('returns carbs per 100 g with density and height', () => {
    expect(foodClass(db, 'rice')).toEqual({
      modelClass: 'rice',
      foodId: 36,
      nameEn: 'Boiled Rice BR-28',
      nameBn: 'সিদ্ধ ভাত',
      match: 'exact',
      carbsPer100g: 24.3,
      densityGPerCm3: 0.8,
      typicalHeightCm: 2.5,
      note: null,
    });
    expect(foodClass(db, 'pizza')).toBeNull();
    expect(allFoodClasses(db)).toHaveLength(1);
  });
});
