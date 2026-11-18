/** Schema of data/build/nutrition.sqlite (FoodNetBD, CC BY 4.0) — shared by scripts/build-data.ts and tests. */
export const NUTRITION_SCHEMA = `
  CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  CREATE TABLE foods (
    id INTEGER PRIMARY KEY,
    name_en TEXT NOT NULL, name_bn TEXT NOT NULL,
    category TEXT, preparation TEXT,
    carbs_per_100g REAL NOT NULL,
    sugars_per_100g REAL, fibre_per_100g REAL,
    energy_kcal_per_100g REAL, protein_per_100g REAL, fat_per_100g REAL,
    serving_g REAL
  );
  CREATE TABLE food_class_map (
    model_class TEXT PRIMARY KEY,
    food_id INTEGER NOT NULL REFERENCES foods(id),
    match TEXT NOT NULL CHECK (match IN ('exact', 'close', 'proxy')),
    density_g_per_cm3 REAL NOT NULL,
    typical_height_cm REAL NOT NULL,
    note TEXT
  );
  CREATE INDEX idx_foods_name ON foods(name_en);
`;

export interface FoodClassNutrition {
  modelClass: string;
  foodId: number;
  nameEn: string;
  nameBn: string;
  match: 'exact' | 'close' | 'proxy';
  carbsPer100g: number;
  densityGPerCm3: number;
  typicalHeightCm: number;
  note: string | null;
}
