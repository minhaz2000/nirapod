/**
 * Builds read-only SQLite files in data/build/ from CSVs in data/raw/.
 *   - medicines.sqlite  ← Assorted Medicine Dataset of Bangladesh
 *   - food.sqlite       ← FoodNetBD
 * Placeholder — implementation pending. Run: npm run build:data
 */
import { existsSync, mkdirSync, readdirSync } from 'node:fs';

mkdirSync('data/build', { recursive: true });
const csvs = existsSync('data/raw') ? readdirSync('data/raw').filter((f) => f.endsWith('.csv')) : [];
console.log(`build-data: found ${csvs.length} CSV file(s) in data/raw/ — import not implemented yet.`);
