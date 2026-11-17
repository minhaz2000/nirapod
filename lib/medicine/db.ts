/** Server-only: opens data/build/medicines.sqlite read-only, once per server instance. */
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
