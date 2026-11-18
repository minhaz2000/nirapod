/**
 * Builds data/build/medicines.sqlite (read-only, used by the /api/medicines/* route handlers).
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
