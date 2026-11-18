/**
 * Builds the read-only SQLite files used by the Node-runtime route handlers:
 *   - data/build/medicines.sqlite  (/api/medicines/*, /api/explain) — see below
 *   - data/build/nutrition.sqlite  (/api/food/nutrition) — FoodNetBD (CC BY 4.0) from data/raw/nutrition/FoodNetBD.csv
 *     plus the model-class mapping in config/food-class-map.csv (density / height need nutritionist review)
 *
 * Inputs in data/raw/medicines/ (fetched automatically if missing — see scripts/fetch-data.ts):
 *   brands.csv              brand_id, generic_id, company_id, brand_name, form, strength, price, packsize
 *   companies.csv           company_id, company_name
 *   therapitics.csv         therapitic_id, therapitic_name     (drug class)
 *   therapitics_generics.csv generic_id, therapitic_id
 *   medicine.db             only the `generic` table (name + indication); generics.csv in the source repo is
 *                           malformed (unquoted commas shift its columns), so it is not used.
 *
 * Run: npm run build:data
 */
import Database from 'better-sqlite3';
import { parse } from 'csv-parse/sync';
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { bestUnitPrice, cleanText, formKey, nameKey, parsePacks, strengthKey } from '../lib/medicine/normalise';
import { fetchMedicineData } from './fetch-data';
import { MEDICINE_INDEXES, MEDICINE_SCHEMA } from '../lib/medicine/schema';
import { NUTRITION_SCHEMA } from '../lib/nutrition/schema';
import { MEDICINE_SOURCE } from './medicine-source';

const RAW = MEDICINE_SOURCE.rawDir;
const OUT_DIR = 'data/build';
const OUT = join(OUT_DIR, 'medicines.sqlite');

type Row = Record<string, string>;

function readCsv(file: string): Row[] {
  return parse(readFileSync(join(RAW, file)), {
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true, // e.g. 60"s
    relax_column_count: true,
    bom: true,
  }) as Row[];
}

async function main() {
  await buildMedicines();
  buildNutrition();
}

const NUTRITION_CSV = 'data/raw/nutrition/FoodNetBD.csv';
const FOOD_CLASS_MAP = 'config/food-class-map.csv';
const NUTRITION_OUT = join(OUT_DIR, 'nutrition.sqlite');

function num(v: string | undefined): number | null {
  const n = Number(String(v ?? '').trim());
  return String(v ?? '').trim() !== '' && Number.isFinite(n) ? n : null;
}

function buildNutrition() {
  const foods = parse(readFileSync(NUTRITION_CSV), { columns: true, skip_empty_lines: true, bom: true }) as Row[];
  const map = parse(readFileSync(FOOD_CLASS_MAP), { columns: true, skip_empty_lines: true, comment: '#', bom: true }) as Row[];

  mkdirSync(OUT_DIR, { recursive: true });
  if (existsSync(NUTRITION_OUT)) rmSync(NUTRITION_OUT);
  const db = new Database(NUTRITION_OUT);
  db.pragma('journal_mode = DELETE');
  db.exec(NUTRITION_SCHEMA);
  const insFood = db.prepare('INSERT INTO foods VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  const insMap = db.prepare('INSERT INTO food_class_map VALUES (?, ?, ?, ?, ?, ?)');
  const ids = new Set<number>();
  let skipped = 0;

  db.transaction(() => {
    for (const r of foods) {
      const id = num(r.Food_ID);
      const carbs = num(r['Carbohydrate (g)']);
      if (id === null || carbs === null || ids.has(id)) {
        skipped++;
        continue;
      }
      ids.add(id);
      insFood.run(
        id,
        cleanText(r['English Name']),
        cleanText(r['Bengali Name']),
        cleanText(r.Category) || null,
        cleanText(r.Preparation) || null,
        carbs,
        num(r['Total_Sugars (g)']),
        num(r['Fibre (g)']),
        num(r['Energy (kcal)']),
        num(r['Protein (g)']),
        num(r['Fat (g)']),
        num(r.Standard_Serving_Size_g),
      );
    }
    for (const m of map) {
      const foodId = num(m.foodnetbd_id);
      const density = num(m.density_g_per_cm3);
      const height = num(m.typical_height_cm);
      if (foodId === null || !ids.has(foodId)) throw new Error(`food-class-map: ${m.model_class} → unknown FoodNetBD id ${m.foodnetbd_id}`);
      if (!density || density <= 0 || !height || height <= 0) throw new Error(`food-class-map: ${m.model_class} needs density and height`);
      if (!['exact', 'close', 'proxy'].includes(m.match ?? '')) throw new Error(`food-class-map: ${m.model_class} has match "${m.match}"`);
      insMap.run(cleanText(m.model_class), foodId, m.match, density, height, cleanText(m.note) || null);
    }
    const meta = db.prepare('INSERT INTO meta VALUES (?, ?)');
    meta.run('source_name', 'FoodNetBD: A Bilingual, Disease-Annotated Nutrition dataset');
    meta.run('source_url', 'https://data.mendeley.com/datasets/23f7yxnvy7/1');
    meta.run('licence', 'CC BY 4.0');
    meta.run('built_at', new Date().toISOString());
  })();
  db.exec('ANALYZE; VACUUM');
  db.close();
  console.log(`build-data: wrote ${NUTRITION_OUT} (${ids.size} foods, ${map.length} model classes, ${skipped} rows skipped)`);
}

async function buildMedicines() {
  await fetchMedicineData();

  const brands = readCsv('brands.csv');
  const companies = new Map(readCsv('companies.csv').map((r) => [r.company_id!, cleanText(r.company_name)]));
  const classes = new Map(readCsv('therapitics.csv').map((r) => [r.therapitic_id!, cleanText(r.therapitic_name)]));
  const classByGeneric = new Map<string, string[]>();
  for (const r of readCsv('therapitics_generics.csv')) {
    const name = classes.get(r.therapitic_id!);
    if (!name) continue;
    const list = classByGeneric.get(r.generic_id!) ?? [];
    if (!list.includes(name)) list.push(name);
    classByGeneric.set(r.generic_id!, list);
  }

  const src = new Database(join(RAW, 'medicine.db'), { readonly: true, fileMustExist: true });
  const pregnancyNames = new Map(
    (src.prepare('SELECT pregnancy_id, pregnancy_name FROM pregnancy_category').all() as Row[]).map((r) => [
      r.pregnancy_id!,
      cleanText(r.pregnancy_name),
    ]),
  );
  const generics = new Map(
    (src.prepare('SELECT generic_id, generic_name, indication, pregnancy_category_id FROM generic').all() as Row[]).map((g) => {
      const preg = pregnancyNames.get(g.pregnancy_category_id ?? '') ?? '';
      return [
        g.generic_id!,
        {
          name: cleanText(g.generic_name),
          indication: cleanText(g.indication).replace(/\s*\\n\s*/g, ' '),
          // Older FDA letter categories (A, B, C, D, X, or combinations like "C+X"); "Not Classified" → null.
          pregnancy: /^[ABCDX](\+[ABCDX])?$/.test(preg) ? preg : null,
        },
      ];
    }),
  );
  src.close();

  mkdirSync(OUT_DIR, { recursive: true });
  if (existsSync(OUT)) rmSync(OUT);
  const db = new Database(OUT);
  db.pragma('journal_mode = DELETE');
  db.exec(MEDICINE_SCHEMA);

  const insGeneric = db.prepare('INSERT INTO generics VALUES (?, ?, ?, ?, ?, ?)');
  const insMaker = db.prepare('INSERT INTO manufacturers VALUES (?, ?, ?)');
  const insProduct = db.prepare(`INSERT INTO products VALUES (
    @id, @brand, @brand_key, @generic_id, @generic_key, @manufacturer_id, @manufacturer,
    @form, @form_key, @strength, @strength_key, @unit_price, @unit, @packs_json)`);

  const stats = { products: 0, withGeneric: 0, withStrength: 0, priced: 0, withUnitPrice: 0, skipped: 0 };

  db.transaction(() => {
    for (const [id, g] of generics) {
      insGeneric.run(Number(id), g.name, nameKey(g.name), g.indication || null, classByGeneric.get(id)?.join('; ') ?? null, g.pregnancy);
    }
    for (const [id, name] of companies) insMaker.run(Number(id), name, nameKey(name));

    for (const r of brands) {
      const brand = cleanText(r.brand_name);
      const form = cleanText(r.form);
      if (!brand || !form || !/^\d+$/.test(r.brand_id ?? '')) {
        stats.skipped++;
        continue;
      }
      const generic = generics.get(r.generic_id!);
      const strength = cleanText(r.strength);
      const packs = parsePacks(r.price ?? '', r.packsize ?? '');
      const best = bestUnitPrice(packs);
      insProduct.run({
        id: Number(r.brand_id),
        brand,
        brand_key: nameKey(brand),
        generic_id: generic ? Number(r.generic_id) : null,
        generic_key: generic ? nameKey(generic.name) : null,
        manufacturer_id: companies.has(r.company_id!) ? Number(r.company_id) : null,
        manufacturer: companies.get(r.company_id!) ?? null,
        form,
        form_key: formKey(form),
        strength,
        strength_key: strengthKey(strength),
        unit_price: best?.unitPrice ?? null,
        unit: best?.unit ?? null,
        packs_json: JSON.stringify(packs),
      });
      stats.products++;
      if (generic) stats.withGeneric++;
      if (strength) stats.withStrength++;
      if (packs.length) stats.priced++;
      if (best) stats.withUnitPrice++;
    }

    const meta = db.prepare('INSERT INTO meta VALUES (?, ?)');
    meta.run('source_name', MEDICINE_SOURCE.name);
    meta.run('source_url', MEDICINE_SOURCE.url);
    meta.run('source_commit', MEDICINE_SOURCE.commit);
    meta.run('licence', MEDICINE_SOURCE.licence);
    meta.run('data_last_updated', MEDICINE_SOURCE.lastUpdated);
    meta.run('built_at', new Date().toISOString());
  })();

  db.exec(MEDICINE_INDEXES);
  db.exec('ANALYZE');
  db.exec('VACUUM');
  db.close();

  console.log(`build-data: wrote ${OUT}`);
  console.table({ generics: generics.size, manufacturers: companies.size, ...stats });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
