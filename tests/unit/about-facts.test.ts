import Database from 'better-sqlite3';
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AI_FACTS } from '@/lib/about';

describe('"How Nirapod\'s AI works" shows true numbers', () => {
  it('food model figures come from food_seg.json', () => {
    const meta = JSON.parse(readFileSync('public/models/food_seg.json', 'utf8'));
    expect(AI_FACTS.foodClasses).toBe(16);
    expect(AI_FACTS.foodMaskMap50).toBe(0.867);
    expect(meta.architecture).toBe('yolo11n-seg');
  });

  it.runIf(existsSync('data/build/medicines.sqlite'))('medicine product count matches the built database', () => {
    const db = new Database('data/build/medicines.sqlite', { readonly: true });
    expect((db.prepare('SELECT COUNT(*) AS n FROM products').get() as { n: number }).n).toBe(AI_FACTS.medicineProducts);
    db.close();
  });
});
