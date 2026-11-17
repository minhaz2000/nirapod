/**
 * Read-only queries against data/build/medicines.sqlite. Takes a better-sqlite3 Database so tests can pass a fixture.
 * Safety rule 10: alternatives match generic name, strength and dosage form EXACTLY (after formatting normalisation).
 */
import type Database from 'better-sqlite3';
import { rankKeysWithVariants } from './fuzzy';
import { nameKey, type Pack, type PackUnit } from './normalise';

export interface Product {
  id: number;
  brand: string;
  generic: string | null;
  indication: string | null;
  drugClass: string | null;
  manufacturer: string | null;
  form: string;
  strength: string;
  unitPrice: number | null;
  unit: PackUnit | null;
  packs: Pack[];
}

export interface DataInfo {
  sourceName: string;
  sourceUrl: string;
  licence: string;
  /** "YYYY-MM" */
  lastUpdated: string;
}

interface ProductRow {
  id: number;
  brand: string;
  generic: string | null;
  indication: string | null;
  drug_class: string | null;
  manufacturer: string | null;
  form: string;
  strength: string;
  unit_price: number | null;
  unit: PackUnit | null;
  packs_json: string;
  brand_key: string;
  generic_key: string | null;
  form_key: string;
  strength_key: string;
}

const SELECT = `
  SELECT p.id, p.brand, p.brand_key, p.generic_key, p.form, p.form_key, p.strength, p.strength_key,
         p.manufacturer, p.unit_price, p.unit, p.packs_json,
         g.name AS generic, g.indication, g.drug_class
  FROM products p LEFT JOIN generics g ON g.id = p.generic_id`;

function toProduct(r: ProductRow): Product {
  return {
    id: r.id,
    brand: r.brand,
    generic: r.generic,
    indication: r.indication,
    drugClass: r.drug_class,
    manufacturer: r.manufacturer,
    form: r.form,
    strength: r.strength,
    unitPrice: r.unit_price,
    unit: r.unit,
    packs: JSON.parse(r.packs_json) as Pack[],
  };
}

const brandKeyCache = new WeakMap<Database.Database, string[]>();

function brandKeys(db: Database.Database): string[] {
  let keys = brandKeyCache.get(db);
  if (!keys) {
    keys = (db.prepare('SELECT DISTINCT brand_key FROM products').pluck().all() as string[]).filter(Boolean);
    brandKeyCache.set(db, keys);
  }
  return keys;
}

export interface BrandMatch {
  brand: string;
  /** 0 = exact; higher = weaker match. */
  score: number;
  products: Product[];
}

/** Fuzzy brand search (typos, OCR misreads, brand joined to strength). Best brand first. */
export function searchBrands(db: Database.Database, query: string, maxBrands = 8): BrandMatch[] {
  const ranked = rankKeysWithVariants(nameKey(query), brandKeys(db), maxBrands);
  const stmt = db.prepare(`${SELECT} WHERE p.brand_key = ? ORDER BY p.form, p.strength_key`);
  return ranked.map(({ key, score }) => {
    const products = (stmt.all(key) as ProductRow[]).map(toProduct);
    return { brand: products[0]?.brand ?? key, score, products };
  });
}

export function getProduct(db: Database.Database, id: number): Product | null {
  const row = db.prepare(`${SELECT} WHERE p.id = ?`).get(id) as ProductRow | undefined;
  return row ? toProduct(row) : null;
}

export type AlternativesResult =
  | { status: 'ok'; product: Product; alternatives: Array<Product & { cheaper: boolean }> }
  | { status: 'not_found' }
  | { status: 'not_comparable'; product: Product; reason: 'generic_unknown' | 'strength_unknown' | 'price_unknown' };

/** Other brands with the same generic AND strength AND dosage form, cheapest unit price first. */
export function findAlternatives(db: Database.Database, id: number, limit = 20): AlternativesResult {
  const row = db.prepare(`${SELECT} WHERE p.id = ?`).get(id) as ProductRow | undefined;
  if (!row) return { status: 'not_found' };
  const product = toProduct(row);
  if (!row.generic_key) return { status: 'not_comparable', product, reason: 'generic_unknown' };
  if (!row.strength_key) return { status: 'not_comparable', product, reason: 'strength_unknown' };
  if (row.unit_price === null || !row.unit) return { status: 'not_comparable', product, reason: 'price_unknown' };

  const rows = db
    .prepare(
      `${SELECT}
       WHERE p.generic_key = ? AND p.strength_key = ? AND p.form_key = ?
         AND p.unit = ? AND p.unit_price IS NOT NULL
         AND p.brand_key <> ?
       ORDER BY p.unit_price ASC, p.brand ASC
       LIMIT ?`,
    )
    .all(row.generic_key, row.strength_key, row.form_key, row.unit, row.brand_key, limit) as ProductRow[];

  return {
    status: 'ok',
    product,
    alternatives: rows.map((r) => ({ ...toProduct(r), cheaper: r.unit_price! < row.unit_price! })),
  };
}

export function getDataInfo(db: Database.Database): DataInfo {
  const meta = new Map(
    (db.prepare('SELECT key, value FROM meta').all() as Array<{ key: string; value: string }>).map((m) => [m.key, m.value]),
  );
  return {
    sourceName: meta.get('source_name') ?? '',
    sourceUrl: meta.get('source_url') ?? '',
    licence: meta.get('licence') ?? '',
    lastUpdated: meta.get('data_last_updated') ?? '',
  };
}
