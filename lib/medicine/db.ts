/** Server-only: opens the read-only SQLite files in data/build/, once per server instance. */
import Database from 'better-sqlite3';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

export const MEDICINE_DB_PATH = join(process.cwd(), 'data', 'build', 'medicines.sqlite');

let db: Database.Database | null = null;

/** Returns null if the database has not been built (run `npm run build:data`). */
export function getMedicineDb(): Database.Database | null {
  if (db) return db;
  if (!existsSync(MEDICINE_DB_PATH)) return null;
  db = new Database(MEDICINE_DB_PATH, { readonly: true, fileMustExist: true });
  return db;
}

export const NUTRITION_DB_PATH = join(process.cwd(), 'data', 'build', 'nutrition.sqlite');
let nutrition: Database.Database | null = null;

/** FoodNetBD nutrition database; null if not built. */
export function getNutritionDb(): Database.Database | null {
  if (nutrition) return nutrition;
  if (!existsSync(NUTRITION_DB_PATH)) return null;
  nutrition = new Database(NUTRITION_DB_PATH, { readonly: true, fileMustExist: true });
  return nutrition;
}
